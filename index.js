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

let spamInterval = null;
let spammerClient = null;
let audioPlayer = null;
let currentVoiceConnection = null;
let currentStreamInfo = { type: null, channelId: null, guildId: null };
let activeTypingChannels = new Set();

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

        if (msg.author.id !== client.user.id || !msg.content.startsWith('.')) return;

        const args = msg.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        try {
            switch (command) {
                case 'help':
                    const helpMessage = `
**REALLYKRAK Komut Menüsü:**
\`\`\`
.help                           - Bu yardım menüsünü gösterir.
.nitro_troll                    - Sahte bir Nitro hediye bağlantısı gönderir.
.avatar <URL>                   - Profil fotoğrafınızı değiştirir.
.status <tür> <isim> [detay]    - Durumunuzu ayarlar. Türler: PLAYING, WATCHING, LISTENING, STREAMING, COMPETING.
.dm <KullanıcıID> <mesaj>       - Belirtilen kullanıcıya DM gönderir.
.ghostping <KanalID> <KullanıcıID> - Belirtilen kişiye anlık bildirim gönderir.
.typing <KanalID>               - Belirtilen kanalda yazıyor durumunu açıp/kapatır.
.userinfo [KullanıcıID]         - Belirtilen kullanıcı (veya sizin) bilgilerinizi gösterir.
.serverinfo                     - Bulunulan sunucunun bilgilerini gösterir.
.mass-react <emoji> [limit]     - Son X mesaja belirtilen emoji ile tepki verir (varsayılan 10).
.stop_stream                    - Aktif yayını durdurur.
\`\`\`
`;
                    await msg.edit(helpMessage);
                    break;

                case 'nitro_troll':
                    await msg.edit('https://discord.gift/SEN_TROLLEDIN_DOSTUM_IYI_FORUMLAR');
                    break;

                case 'avatar':
                    const avatarUrl = args[0];
                    if (!avatarUrl) return msg.edit('Lütfen bir URL belirtin. Örn: `.avatar <URL>`');
                    await client.user.setAvatar(avatarUrl);
                    await msg.edit('Profil fotoğrafı güncellendi.');
                    break;

                case 'status':
                    const activityType = args.shift()?.toUpperCase();
                    const activityName = args.shift();
                    const customStatus = args.join(' ');
                    if (!activityType || !activityName) return msg.edit('Eksik argüman. Örn: `.status PLAYING Visual Studio Code`');
                    const validTypes = ['PLAYING', 'WATCHING', 'LISTENING', 'STREAMING', 'COMPETING'];
                    if (!validTypes.includes(activityType)) return msg.edit(`Geçersiz tür. Geçerli türler: ${validTypes.join(', ')}`);
                    await client.user.setPresence({ activities: [{ name: activityName, type: activityType, state: customStatus || undefined }] });
                    await msg.edit('Durum güncellendi.');
                    break;

                case 'dm':
                    const dmUserId = args.shift();
                    const dmContent = args.join(' ');
                    if (!dmUserId || !dmContent) return msg.edit('Eksik argüman. Örn: `.dm <KullanıcıID> <mesaj>`');
                    const user = await client.users.fetch(dmUserId);
                    await user.send(dmContent);
                    await msg.edit('DM başarıyla gönderildi.');
                    break;

                case 'ghostping':
                    const ghostChannelId = args.shift();
                    const ghostUserId = args.shift();
                    if (!ghostChannelId || !ghostUserId) {
                        await msg.edit('Eksik argüman. Örn: `.ghostping <KanalID> <KullanıcıID>`');
                        return;
                    }
                    await msg.delete();
                    const channel = await client.channels.fetch(ghostChannelId);
                    const pingMsg = await channel.send(`<@${ghostUserId}>`);
                    await pingMsg.delete();
                    break;

                case 'typing':
                    const typingChannelId = args.shift();
                    if (!typingChannelId) return msg.edit('Lütfen bir kanal ID belirtin.');
                    const typingChannel = await client.channels.fetch(typingChannelId);
                    if (!typingChannel || !typingChannel.isText()) {
                        await msg.edit('Belirtilen kanal bir metin kanalı değil.');
                        return;
                    }
                    if (activeTypingChannels.has(typingChannelId)) {
                        typingChannel.stopTyping(true);
                        activeTypingChannels.delete(typingChannelId);
                        await msg.edit('Yazıyor durumu durduruldu.');
                    } else {
                        typingChannel.startTyping();
                        activeTypingChannels.add(typingChannelId);
                        await msg.edit('Yazıyor durumu başlatıldı.');
                    }
                    break;

                case 'userinfo':
                    const userInfoId = args[0] || msg.author.id;
                    const userToGet = await client.users.fetch(userInfoId).catch(() => null);
                    if (!userToGet) return msg.edit('Kullanıcı bulunamadı.');
                    let userInfoMsg = `**${userToGet.tag} Kullanıcı Bilgileri**\n**ID:** ${userToGet.id}\n**Hesap Oluşturulma:** ${userToGet.createdAt.toLocaleDateString('tr-TR')}\n**Avatar:** ${userToGet.displayAvatarURL()}`;
                    await msg.edit(userInfoMsg);
                    break;

                case 'serverinfo':
                    if (!msg.guild) return msg.edit('Bu komut sadece sunucularda kullanılabilir.');
                    const guild = msg.guild;
                    await guild.members.fetch();
                    const serverInfoMsg = `**${guild.name} Sunucu Bilgileri**\n**ID:** ${guild.id}\n**Sahip:** <@${guild.ownerId}>\n**Oluşturulma:** ${guild.createdAt.toLocaleDateString('tr-TR')}\n**Üyeler:** ${guild.memberCount} (${guild.members.cache.filter(m => m.presence?.status !== 'offline').size} Aktif)\n**Boost:** Seviye ${guild.premiumTier} (${guild.premiumSubscriptionCount} Boost)`;
                    await msg.edit(serverInfoMsg);
                    break;
                
                case 'mass-react':
                    const emoji = args[0];
                    const limit = parseInt(args[1], 10) || 10;
                    if (!emoji) {
                        await msg.edit('Lütfen bir emoji belirtin.');
                        return;
                    }
                    await msg.delete();
                    const messages = await msg.channel.messages.fetch({ limit: limit });
                    for (const message of messages.values()) {
                        try {
                            await message.react(emoji);
                            await new Promise(resolve => setTimeout(resolve, 400));
                        } catch (e) { /* Hataları yoksay */ }
                    }
                    break;

                case 'stop_stream':
                case 'stop_camera':
                    await stopStreaming('user');
                    await msg.edit('Yayın/Kamera durduruldu.');
                    break;
                
                default:
                    await msg.edit('Bilinmeyen komut. Komut listesi için `.help` yazın.');
                    break;
            }
        } catch (e) {
            console.error(`Komut hatası [${command}]:`, e);
            try {
                await msg.edit(`Komut çalıştırılırken bir hata oluştu: ${e.message}`);
            } catch (editError) {
                console.error("Hata mesajı düzenlenemedi:", editError);
            }
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
            io.emit('status-update', { message: 'Yayın durduruldu.', type: 'info' });
        }
        currentStreamInfo = { type: null, channelId: null, guildId: null };
        io.emit('stream-status-change', { type: 'camera', isActive: false });
        io.emit('stream-status-change', { type: 'stream', isActive: false });
    };

    const startStreaming = async (channelId, isCamera) => {
        if (currentVoiceConnection) await stopStreaming('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            currentStreamInfo = { type: isCamera ? 'camera' : 'stream', channelId: channel.id, guildId: channel.guild.id };

            let videoSourceUrl = isCamera 
                ? config.cameraVideoUrl 
                : videoList[Math.floor(Math.random() * videoList.length)];
            
            if (!videoSourceUrl) throw new Error('Yayın için geçerli bir URL bulunamadı.');
            console.log(`Yayın başlatılıyor: ${videoSourceUrl}`);
            
            let stream;
            let type;
            
            if ((await playdl.validate(videoSourceUrl)) === 'yt_video') {
                const streamDetails = await playdl.stream(videoSourceUrl);
                stream = streamDetails.stream;
                type = streamDetails.type;
            } else {
                stream = videoSourceUrl;
                type = StreamType.Arbitrary;
            }

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            currentVoiceConnection = connection;
            
            await entersState(connection, VoiceConnectionStatus.Ready, 20000);
            
            if (isCamera) await client.user.setSelfVideo(true);
            else await client.user.setSelfStream(true);

            await new Promise(resolve => setTimeout(resolve, 1000));

            audioPlayer = createAudioPlayer();
            const resource = createAudioResource(stream, { inputType: type });
            
            audioPlayer.play(resource);
            connection.subscribe(audioPlayer);

            audioPlayer.on(AudioPlayerStatus.Idle, () => startStreaming(channelId, isCamera));
            audioPlayer.on('error', error => {
                console.error(`Audio Player Hatası: ${error.message}, yayın yeniden başlatılıyor...`);
                startStreaming(channelId, isCamera);
            });

            io.emit('status-update', { message: `${isCamera ? 'Kamera modu' : 'Yayın'} başlatıldı.`, type: 'success' });
            io.emit('stream-status-change', { type: currentStreamInfo.type, isActive: true });

            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    stopStreaming('internal-disconnect');
                }
            });

        } catch (error) {
            console.error("Yayın başlatma hatası:", error);
            io.emit('status-update', { message: `Yayın başlatılamadı: ${error.message}`, type: 'error' });
            stopStreaming('error');
        }
    };

    socket.on('toggle-stream', ({ channelId, status, type }) => {
        if (status) startStreaming(channelId, type === 'camera');
        else stopStreaming('user');
    });
    
    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => { stopStreaming('internal'); login(token); });

    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Profil fotoğrafı güncellendi.', type: 'success' });
            socket.emit('bot-info', { avatar: client.user.displayAvatarURL() });
        } catch (e) {
            socket.emit('status-update', { message: 'Avatar değiştirilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('change-status', async (data) => {
        try {
            const activity = { name: data.activityName, type: data.activityType.toUpperCase(), state: data.customStatus };
            if (data.applicationId && data.largeImageKey) {
                activity.application_id = data.applicationId;
                activity.assets = {
                    large_image: data.largeImageKey, large_text: data.largeImageText || ' ',
                    small_image: data.smallImageKey || undefined, small_text: data.smallImageText || ' '
                };
            }
            await client.user.setPresence({ activities: data.activityName ? [activity] : [] });
            socket.emit('status-update', { message: 'Durum güncellendi.', type: 'success' });
        } catch (e) {
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('send-dm', async (data) => {
        try {
            const user = await client.users.fetch(data.userId);
            await user.send(data.content);
            socket.emit('status-update', { message: 'DM başarıyla gönderildi.', type: 'success' });
        } catch (e) {
            socket.emit('status-update', { message: 'DM gönderilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('ghost-ping', async (data) => {
        try {
            const channel = await client.channels.fetch(data.channelId);
            const msg = await channel.send(`<@${data.userId}>`);
            await msg.delete();
            socket.emit('status-update', { message: 'Ghost ping gönderildi.', type: 'info' });
        } catch (e) {
            console.error("Ghost Ping Hatası:", e.message);
            socket.emit('status-update', { message: 'Ghost ping atılamadı: ' + e.message, type: 'error' });
        }
    });
    
    socket.on('start-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel.isText()) {
                 socket.emit('status-update', { message: "'Yazıyor...' durumu başlatılamadı: Metin kanalı değil.", type: 'error' });
                 return;
            }
            if (!activeTypingChannels.has(channelId)) {
                await channel.startTyping();
                activeTypingChannels.add(channelId);
                socket.emit('status-update', { message: `'Yazıyor...' durumu başlatıldı.`, type: 'info' });
            }
        } catch (e) {
            console.error("'Yazıyor...' Başlatma Hatası:", e.message);
            socket.emit('status-update', { message: "'Yazıyor...' durumu başlatılamadı.", type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
             if (!channel.isText()) return;
            if (activeTypingChannels.has(channelId)) {
                channel.stopTyping(true);
                activeTypingChannels.delete(channelId);
                socket.emit('status-update', { message: `'Yazıyor...' durumu durduruldu.`, type: 'info' });
            }
        } catch (e) {
            console.error("'Yazıyor...' Durdurma Hatası:", e.message);
        }
    });

    socket.on('clean-dm', async (data) => {
        const { userId, delay } = data;
        try {
            const user = await client.users.fetch(userId);
            if (!user) {
                return socket.emit('status-update', { message: 'Kullanıcı bulunamadı.', type: 'error' });
            }
            const dmChannel = await user.createDM();
            socket.emit('status-update', { message: `${user.tag} ile olan mesajlar siliniyor...`, type: 'info' });

            let deletedCount = 0;
            let lastId = null;

            while(true) {
                const messages = await dmChannel.messages.fetch({ limit: 100, before: lastId });
                const userMessages = messages.filter(m => m.author.id === client.user.id);
                
                if (userMessages.size > 0) {
                    for (const message of userMessages.values()) {
                        await message.delete();
                        deletedCount++;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    socket.emit('status-update', { message: `${deletedCount} mesaj silindi...`, type: 'info' });
                }
                
                if (messages.size < 100) break;
                lastId = messages.last().id;
            }

            socket.emit('status-update', { message: `Temizlik tamamlandı! Toplam ${deletedCount} mesaj silindi.`, type: 'success' });
        } catch (e) {
            console.error("DM Temizleme Hatası:", e.message);
            socket.emit('status-update', { message: 'DM temizlenemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('toggle-spam', async (data) => {
        if (spamInterval) {
            clearInterval(spamInterval);
            spamInterval = null;
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
            const msg = data.ping ? `<@${data.userId}> ${data.message}` : data.message;
            spamInterval = setInterval(() => {
                user.send(msg).catch(() => {
                    clearInterval(spamInterval);
                    spamInterval = null;
                    if (spammerClient) spammerClient.destroy();
                    spammerClient = null;
                    socket.emit('spam-status-change', false);
                    socket.emit('status-update', { message: 'Spam durduruldu (hedef engellemiş olabilir).', type: 'error' });
                });
            }, parseInt(data.delay));
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
