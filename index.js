const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnectionStatus, entersState, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const playdl = require('play-dl');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let client = new Client({ checkUpdate: false });
let afkEnabled = true;

let spamTimeout = null;
let spammerClient = null;
let audioPlayer = null;
let currentVoiceConnection = null;
let currentStreamInfo = { type: null, channelId: null, guildId: null };
let activeTypingChannels = new Set();
let musicQueue = [];
let currentSongIndex = -1;

try {
    const musicDir = './music';
    if (fs.existsSync(musicDir)) {
        musicQueue = fs.readdirSync(musicDir).filter(file => file.endsWith('.mp3')).map(file => path.join(__dirname, musicDir, file));
        console.log(`${musicQueue.length} adet şarkı 'music' klasöründen yüklendi.`);
    } else {
        console.log("'music' klasörü bulunamadı, müzik çalar özelliği pasif olacak.");
        fs.mkdirSync(musicDir);
        console.log("'music' klasörü oluşturuldu. Lütfen .mp3 dosyalarınızı buraya ekleyin.");
    }
} catch(e) {
    console.error("Müzik dosyaları okunurken hata:", e);
}

let videoList = [];
try {
  const videoData = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
  videoList = videoData.videoUrls;
  console.log(`${videoList.length} adet video 'videos.json' dosyasından yüklendi.`);
} catch (error) {
  console.error("'videos.json' okunurken hata oluştu, varsayılan video listesi boş olacak.", error);
  videoList = [];
}

function login(token) {
    if (client && client.readyAt) client.destroy();
    client = new Client({ checkUpdate: false });

    client.on('ready', () => {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        io.emit('bot-info', {
            username: client.user.username,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
            id: client.user.id,
        });
        io.emit('status-update', { message: 'Başarıyla giriş yapıldı!', type: 'success' });
    });
    
    client.on('messageCreate', async msg => {
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== client.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }
    });

    client.login(token).catch(error => {
        console.error('Giriş hatası:', error.message);
        io.emit('status-update', { message: 'Geçersiz Token. Giriş yapılamadı.', type: 'error' });
    });
}

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

const playNextSong = (channelId) => {
    if (musicQueue.length === 0) {
        io.emit('status-update', { message: 'Müzik kuyruğu boş.', type: 'warning' });
        return stopStreaming('internal');
    }

    currentSongIndex = (currentSongIndex + 1) % musicQueue.length;
    const songPath = musicQueue[currentSongIndex];
    const songName = path.basename(songPath);

    try {
        const connection = getVoiceConnection(currentStreamInfo.guildId);
        if (!connection) {
            console.error("Müzik çalınacak bağlantı bulunamadı.");
            return stopStreaming('internal');
        }

        const resource = createAudioResource(songPath);
        audioPlayer.play(resource);
        io.emit('status-update', { message: `Şimdi Çalıyor: ${songName}`, type: 'info' });
        io.emit('music-status-change', { isPlaying: true, songName });

    } catch (error) {
        console.error("Şarkı çalınırken hata:", error);
        io.emit('status-update', { message: `Hata: ${error.message}`, type: 'error' });
        playNextSong(channelId);
    }
};

const stopStreaming = async (source = 'user') => {
    if (audioPlayer) {
        audioPlayer.stop(true);
        audioPlayer = null;
    }
    if (currentVoiceConnection) {
        currentVoiceConnection.destroy();
        currentVoiceConnection = null;
    }
    try {
        if (client && client.user) {
            if (currentStreamInfo.type === 'camera') await client.user.setSelfVideo(false).catch(() => {});
            else await client.user.setSelfStream(false).catch(() => {});
        }
    } catch (error) {
        console.error("Yayın durumu temizlenirken hata oluştu:", error.message);
    }
    if (source === 'user') {
        io.emit('status-update', { message: 'Yayın/Müzik durduruldu.', type: 'info' });
    }
    currentStreamInfo = { type: null, channelId: null, guildId: null };
    io.emit('stream-status-change', { type: 'camera', isActive: false });
    io.emit('stream-status-change', { type: 'stream', isActive: false });
    io.emit('music-status-change', { isPlaying: false, songName: 'Durduruldu' });
};

io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');
    if (client.user) {
        socket.emit('bot-info', {
            username: client.user.username,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
            id: client.user.id,
        });
    }

    const startStreaming = async (channelId, streamType) => {
        if (currentVoiceConnection) await stopStreaming('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            currentStreamInfo = { type: streamType, channelId: channel.id, guildId: channel.guild.id };

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            currentVoiceConnection = connection;
            
            await entersState(connection, VoiceConnectionStatus.Ready, 20000);

            audioPlayer = createAudioPlayer();
            connection.subscribe(audioPlayer);

            audioPlayer.on('error', error => {
                console.error(`Audio Player Hatası: ${error.message}, yeniden başlatılıyor...`);
                stopStreaming('error');
                io.emit('status-update', { message: `Bir hata oluştu: ${error.message}`, type: 'error' });
            });
             
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) { stopStreaming('internal-disconnect'); }
            });

            if (streamType === 'music') {
                io.emit('stream-status-change', { type: 'music', isActive: true });
                currentSongIndex = -1;
                playNextSong(channelId);
                audioPlayer.on(AudioPlayerStatus.Idle, () => playNextSong(channelId));

            } else {
                let isCamera = streamType === 'camera';
                if (isCamera) await client.user.setSelfVideo(true);
                else await client.user.setSelfStream(true);
                await new Promise(resolve => setTimeout(resolve, 1000));

                let videoSourceUrl = isCamera 
                    ? config.cameraVideoUrl 
                    : videoList[Math.floor(Math.random() * videoList.length)];
                if (!videoSourceUrl) throw new Error('Yayın için geçerli bir URL bulunamadı.');

                let stream, type;
                if ((await playdl.validate(videoSourceUrl)) === 'yt_video') {
                    const streamDetails = await playdl.stream(videoSourceUrl);
                    stream = streamDetails.stream;
                    type = streamDetails.type;
                } else {
                    stream = videoSourceUrl;
                    type = StreamType.Arbitrary;
                }
                const resource = createAudioResource(stream, { inputType: type });
                audioPlayer.play(resource);
                
                audioPlayer.on(AudioPlayerStatus.Idle, () => startStreaming(channelId, streamType));
                io.emit('status-update', { message: `${isCamera ? 'Kamera modu' : 'Yayın'} başlatıldı.`, type: 'success' });
                io.emit('stream-status-change', { type: streamType, isActive: true });
            }
        } catch (error) {
            console.error("Yayın/Müzik başlatma hatası:", error);
            io.emit('status-update', { message: `Başlatılamadı: ${error.message}`, type: 'error' });
            stopStreaming('error');
        }
    };

    socket.on('toggle-stream', ({ channelId, status, type }) => {
        if (status) startStreaming(channelId, type);
        else stopStreaming('user');
    });

    socket.on('voice-state-change', async ({ action }) => {
        try {
            if (!currentVoiceConnection || !currentStreamInfo.guildId) {
                return socket.emit('status-update', { message: 'Önce bir ses kanalına katılmalısınız.', type: 'error' });
            }
            const guild = await client.guilds.fetch(currentStreamInfo.guildId);
            const member = guild.members.me;

            switch(action) {
                case 'mute': await member.voice.setMute(true); socket.emit('status-update', { message: 'Sese kapatıldı.', type: 'info' }); break;
                case 'unmute': await member.voice.setMute(false); socket.emit('status-update', { message: 'Ses açıldı.', type: 'info' }); break;
                case 'deafen': await member.voice.setDeaf(true); socket.emit('status-update', { message: 'Kulaklık kapatıldı.', type: 'info' }); break;
                case 'undeafen': await member.voice.setDeaf(false); socket.emit('status-update', { message: 'Kulaklık açıldı.', type: 'info' }); break;
            }
        } catch (e) {
             socket.emit('status-update', { message: 'Ses durumu değiştirilemedi: ' + e.message, type: 'error' });
        }
    });
    
    socket.on('music-control', (action) => {
        if (!audioPlayer || !currentVoiceConnection) {
            return socket.emit('status-update', { message: 'Müzik çalar aktif değil.', type: 'error' });
        }
        if (action === 'skip') {
            audioPlayer.stop();
            socket.emit('status-update', { message: 'Şarkı atlandı.', type: 'info' });
        }
    });

    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => { stopStreaming('internal'); login(token); });
    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Avatar başarıyla değiştirildi.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Avatar değiştirilemedi: ' + error.message, type: 'error' });
        }
    });
    
    socket.on('change-status', async (data) => {
        try {
            client.user.setPresence({
                status: data.status,
                activities: [
                    {
                        name: data.activity.name,
                        type: data.activity.type,
                        url: data.activity.url,
                    },
                ],
            });
            socket.emit('status-update', { message: 'Durum başarıyla değiştirildi.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + error.message, type: 'error' });
        }
    });

    socket.on('ghost-ping', async (data) => {
        try {
            const channel = await client.channels.fetch(data.channelId);
            const msg = await channel.send(`<@${data.userId}>`);
            await msg.delete();
            socket.emit('status-update', { message: 'Ghost ping gönderildi.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Ghost ping gönderilemedi: ' + error.message, type: 'error' });
        }
    });

    socket.on('start-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.startTyping();
            activeTypingChannels.add(channelId);
            socket.emit('status-update', { message: 'Yazıyor durumu başlatıldı.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Yazıyor durumu başlatılamadı: ' + error.message, type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.stopTyping(true);
            activeTypingChannels.delete(channelId);
            socket.emit('status-update', { message: 'Yazıyor durumu durduruldu.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Yazıyor durumu durdurulamadı: ' + error.message, type: 'error' });
        }
    });

    socket.on('clean-dm', async (data) => {
        try {
            const user = await client.users.fetch(data.userId);
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === client.user.id);
            
            let deletedCount = 0;
            for (const message of userMessages.values()) {
                await message.delete();
                deletedCount++;
            }
            
            console.log(`${deletedCount} adet mesaj silindi.`);
            socket.emit('status-update', { message: `${deletedCount} adet mesaj silindi.`, type: 'success' });
        } catch (error) {
            console.error('DM temizlenirken hata:', error);
            socket.emit('status-update', { message: 'DM temizlenemedi: ' + error.message, type: 'error' });
        }
    });

    socket.on('copy-server', async (data) => {
        try {
            const sourceGuild = await client.guilds.fetch(data.sourceGuildId);
            const newGuild = await client.guilds.create(data.newGuildName, {
                icon: sourceGuild.iconURL(),
            });

            if (data.options.channels) {
                const categories = sourceGuild.channels.cache.filter(c => c.type === 'GUILD_CATEGORY').sort((a, b) => a.position - b.position);
                for (const category of categories.values()) {
                    const newCategory = await newGuild.channels.create(category.name, { type: 'GUILD_CATEGORY' });
                    const children = category.children.sort((a, b) => a.position - b.position);
                    for (const channel of children.values()) {
                        await newGuild.channels.create(channel.name, {
                            type: channel.type,
                            parent: newCategory,
                        });
                    }
                }
            }

            if (data.options.roles) {
                const roles = sourceGuild.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position);
                for (const role of roles.values()) {
                    await newGuild.roles.create({
                        name: role.name,
                        color: role.color,
                        permissions: role.permissions,
                    });
                }
            }

            if (data.options.emojis) {
                for (const emoji of sourceGuild.emojis.cache.values()) {
                    await newGuild.emojis.create(emoji.url, emoji.name);
                }
            }
            
            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı.', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalanırken hata:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı: ' + error.message, type: 'error' });
        }
    });

    socket.on('toggle-spam', async (data) => {
        if (spamTimeout) {
            clearTimeout(spamTimeout);
            spamTimeout = null;
            if (spammerClient) spammerClient.destroy();
            spammerClient = null;
            socket.emit('spam-status-change', false);
            socket.emit('status-update', { message: 'Spam durduruldu.', type: 'info' });
            return;
        }
        spammerClient = new Client({ checkUpdate: false });
        try {
            await spammerClient.login(data.token);
            const user = await spammerClient.users.fetch(data.userId);
            socket.emit('spam-status-change', true);
            socket.emit('status-update', { message: 'Spam başlatıldı!', type: 'success' });
            
            const spamLoop = () => {
                const messageCount = data.smartMode ? Math.floor(Math.random() * 5) + 1 : 1;
                const delay = data.smartMode ? (Math.floor(Math.random() * 3000) + parseInt(data.delay)) : parseInt(data.delay);

                for (let i = 0; i < messageCount; i++) {
                    const msg = data.ping ? `<@${data.userId}> ${data.message}` : data.message;
                    user.send(msg).catch(() => {
                        clearTimeout(spamTimeout);
                        spamTimeout = null;
                        if (spammerClient) spammerClient.destroy();
                        spammerClient = null;
                        socket.emit('spam-status-change', false);
                        socket.emit('status-update', { message: 'Spam durduruldu (hedef engellemiş olabilir).', type: 'error' });
                    });
                }
                spamTimeout = setTimeout(spamLoop, delay);
            };
            spamLoop();

        } catch (e) {
            socket.emit('status-update', { message: 'Spam için geçersiz Token: ' + e.message, type: 'error' });
            socket.emit('spam-status-change', false);
        }
    });
});

login(config.token);

const port = 3000;
server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} portunda başarıyla başlatıldı.`);
});
