const { Client, ActivityType } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnectionStatus, entersState, AudioPlayerStatus } = require('@discordjs/voice');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

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
let musicQueue = [];
let currentSongIndex = -1;

// Müzik klasörünü kontrol et ve şarkıları yükle
try {
    const musicDir = './music';
    if (fs.existsSync(musicDir)) {
        musicQueue = fs.readdirSync(musicDir).filter(file => file.endsWith('.mp3')).map(file => path.join(__dirname, musicDir, file));
        console.log(`${musicQueue.length} adet şarkı 'music' klasöründen yüklendi.`);
    } else {
        console.log("'music' klasörü bulunamadı, oluşturuluyor...");
        fs.mkdirSync(musicDir);
        console.log("'music' klasörü oluşturuldu. Lütfen .mp3 dosyalarınızı buraya ekleyin.");
    }
} catch(e) {
    console.error("Müzik dosyaları okunurken hata:", e);
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

// Müzik fonksiyonları
const playNextSong = () => {
    if (musicQueue.length === 0) {
        io.emit('status-update', { message: 'Müzik kuyruğu boş.', type: 'warning' });
        return stopMusic('internal');
    }

    currentSongIndex = (currentSongIndex + 1) % musicQueue.length;
    const songPath = musicQueue[currentSongIndex];
    const songName = path.basename(songPath);

    try {
        const connection = getVoiceConnection(currentStreamInfo.guildId);
        if (!connection) {
            console.error("Müzik çalınacak bağlantı bulunamadı.");
            return stopMusic('internal');
        }

        const resource = createAudioResource(songPath);
        audioPlayer.play(resource);
        io.emit('status-update', { message: `Şimdi Çalıyor: ${songName}`, type: 'info' });
        io.emit('music-status-change', { isPlaying: true, songName });

    } catch (error) {
        console.error("Şarkı çalınırken hata:", error);
        io.emit('status-update', { message: `Hata: ${error.message}`, type: 'error' });
        playNextSong();
    }
};

const stopMusic = async (source = 'user') => {
    if (audioPlayer) {
        audioPlayer.stop(true);
        audioPlayer = null;
    }
    if (currentVoiceConnection) {
        currentVoiceConnection.destroy();
        currentVoiceConnection = null;
    }
    if (source === 'user') {
        io.emit('status-update', { message: 'Müzik durduruldu.', type: 'info' });
    }
    currentStreamInfo = { type: null, channelId: null, guildId: null };
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

    const startMusic = async (channelId) => {
        if (currentVoiceConnection) await stopMusic('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            currentStreamInfo = { type: 'music', channelId: channel.id, guildId: channel.guild.id };

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
                console.error(`Audio Player Hatası: ${error.message}`);
                stopMusic('error');
                io.emit('status-update', { message: `Bir hata oluştu: ${error.message}`, type: 'error' });
            });
             
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) { stopMusic('internal-disconnect'); }
            });

            io.emit('music-status-change', { isPlaying: true });
            currentSongIndex = -1;
            playNextSong();
            audioPlayer.on(AudioPlayerStatus.Idle, () => playNextSong());

        } catch (error) {
            console.error("Müzik başlatma hatası:", error);
            io.emit('status-update', { message: `Başlatılamadı: ${error.message}`, type: 'error' });
            stopMusic('error');
        }
    };

    socket.on('toggle-music', ({ channelId, status }) => {
        if (status) startMusic(channelId);
        else stopMusic('user');
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
            audioPlayer.stop(); // Idle event'ını tetikleyerek sıradakine geçer
            socket.emit('status-update', { message: 'Şarkı atlandı.', type: 'info' });
        }
    });

    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => { stopMusic('internal'); login(token); });
    socket.on('change-avatar', async (url) => { /* Değişiklik yok */ });
    
    // **DÜZELTME:** Durum değiştirme fonksiyonu `TypeError` hatasını önlemek için güncellendi.
    socket.on('change-status', async (data) => {
        try {
            const activity = {};
            if (data.activity.name) {
                // Gelen string'i (örn: "PLAYING") direkt olarak kullanıyoruz.
                // discord.js-selfbot-v13 string değerleri kabul eder.
                activity.type = data.activity.type;
                activity.name = data.activity.name;

                if (data.activity.type === 'STREAMING' && data.activity.url) {
                    activity.url = data.activity.url;
                }
            }

            client.user.setPresence({
                status: data.status,
                activities: activity.name ? [activity] : [],
            });
            socket.emit('status-update', { message: 'Durum başarıyla değiştirildi.', type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + error.message, type: 'error' });
        }
    });

    socket.on('send-dm', async (data) => { /* Değişiklik yok */ });
    socket.on('ghost-ping', async (data) => { /* Değişiklik yok */ });
    socket.on('start-typing', async (channelId) => { /* Değişiklik yok */ });
    socket.on('stop-typing', async (channelId) => { /* Değişiklik yok */ });
    
    // **DÜZELTME:** DM Cleaner fonksiyonu 'Unauthorized' hatasını daha iyi yönetmek için güncellendi.
    socket.on('clean-dm', async (data) => {
        try {
            const user = await client.users.fetch(data.userId).catch(() => null);
            if (!user) {
                 throw new Error('Kullanıcı bulunamadı. Bu kişiyle ortak bir sunucunuz olmayabilir veya ID geçersiz.');
            }
            
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === client.user.id);
            
            if (userMessages.size === 0) {
                return socket.emit('status-update', { message: 'Silinecek mesajınız bulunamadı.', type: 'info' });
            }

            let deletedCount = 0;
            for (const message of userMessages.values()) {
                await message.delete();
                deletedCount++;
                await new Promise(resolve => setTimeout(resolve, 350)); // Rate limit için bekleme
            }
            
            console.log(`${deletedCount} adet mesaj silindi.`);
            socket.emit('status-update', { message: `${deletedCount} adet mesajınız başarıyla silindi.`, type: 'success' });

        } catch (error) {
            console.error('DM temizlenirken hata:', error);
            let errorMessage = 'DM temizlenemedi: ' + error.message;
            // Discord API hatası ise daha açıklayıcı bir mesaj ver
            if (error.httpStatus === 403) {
                errorMessage = 'DM kanalı açılamadı. Bu kullanıcıyla ortak bir sunucunuz olmayabilir veya sizi engellemiş olabilir.';
            }
            socket.emit('status-update', { message: errorMessage, type: 'error' });
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
                
