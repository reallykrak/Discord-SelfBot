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
                    await msg.delete(); // Ghost pingde komut görünmemeli.
                    const channel = await client.channels.fetch(ghostChannelId);
                    const pingMsg = await channel.send(`<@${ghostUserId}>`);
                    await pingMsg.delete();
                    break;

                case 'typing':
                    const typingChannelId = args.shift();
                    if (!typingChannelId) return msg.edit('Lütfen bir kanal ID belirtin.');
                    const typingChannel = await client.channels.fetch(typingChannelId);
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
                    await msg.delete(); // Bu komutun kendisi görünmemeli.
                    const messages = await msg.channel.messages.fetch({ limit: limit });
                    for (const message of messages.values()) {
                        try {
                            await message.react(emoji);
                            await new Promise(resolve => setTimeout(resolve, 400)); // Rate limit için bekle
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

app.use(express.static(path.join(__dirname, 'public')));

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
            currentVoiceConnection.removeAllListeners();
            currentVoiceConnection.destroy();
            currentVoiceConnection = null;
        }
        try {
            if (client && client.user && currentStreamInfo.guildId) {
                const voiceState = client.guilds.cache.get(currentStreamInfo.guildId)?.voiceStates.cache.get(client.user.id);
                if (voiceState) {
                    if (voiceState.streaming) await voiceState.setSelfStream(false).catch(() => {});
                    if (voiceState.selfVideo) await voiceState.setSelfVideo(false).catch(() => {});
                }
            }
        } catch (error) {
            console.error("Yayın durumu temizlenirken hata oluştu:", error.message);
        }
        if (source === 'user') {
            socket.emit('status-update', { message: 'Yayın durduruldu.', type: 'info' });
        }
        currentStreamInfo = { type: null, channelId: null, guildId: null };
        io.emit('stream-status-change', { type: 'camera', isActive: false });
        io.emit('stream-status-change', { type: 'stream', isActive: false });
    };

    const startStreaming = async (channelId, isCamera) => {
        if (getVoiceConnection(channelId)) await stopStreaming('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            currentStreamInfo = { type: isCamera ? 'camera' : 'stream', channelId: channel.id, guildId: channel.guild.id };

            let videoSourceUrl;
            if (isCamera) {
                videoSourceUrl = config.cameraVideoUrl;
            } else {
                if (videoList.length === 0) throw new Error("'videos.json' dosyanız boş.");
                videoSourceUrl = videoList[Math.floor(Math.random() * videoList.length)];
            }
            
            if (!videoSourceUrl) throw new Error('Yayın için geçerli bir URL bulunamadı.');

            console.log(`Yayın başlatılıyor: ${videoSourceUrl}`);
            
            let streamSource;
            let streamType;
            
            const validatedType = await playdl.validate(videoSourceUrl);

            if (validatedType === 'yt_video') {
                const info = await playdl.video_info(videoSourceUrl);
                
                // --- YENİ ESNEK FORMAT SEÇİMİ ---
                // Önce ses ve video içeren bir format ara
                let format = info.format.find(f => f.acodec !== 'none' && f.vcodec !== 'none');
                // Bulamazsan, sadece ses içeren bir formata razı ol
                if (!format) {
                    format = info.format.find(f => f.acodec !== 'none');
                }
                // O da yoksa, sadece video içeren bir formata razı ol (isteğiniz üzerine)
                if (!format) {
                    format = info.format.find(f => f.vcodec !== 'none');
                }
                // Hiçbiri yoksa hata ver
                if (!format) {
                    throw new Error('Bu YouTube videosu için oynatılabilir hiçbir format (ses veya video) bulunamadı.');
                }
                
                const streamDetails = await playdl.stream_from_info(info, { format: format.itag });
                streamSource = streamDetails.stream;
                streamType = streamDetails.type;
            } else {
                // GIF gibi doğrudan linkler için
                const { default: fetch } = await import('node-fetch');
                const response = await fetch(videoSourceUrl);
                if (!response.ok) throw new Error(`URL'den akış alınamadı: ${response.statusText}`);
                streamSource = response.body;
                streamType = StreamType.Arbitrary;
            }

            currentVoiceConnection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            
            currentVoiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(currentVoiceConnection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(currentVoiceConnection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    console.log("Bağlantı koptu, temizleniyor.");
                    stopStreaming('internal-disconnect');
                }
            });

            await entersState(currentVoiceConnection, VoiceConnectionStatus.Ready, 20000);

            const voiceState = channel.guild.voiceStates.cache.get(client.user.id);
            if (voiceState) {
                if (isCamera) await voiceState.setSelfVideo(true);
                else await voiceState.setSelfStream(true);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));

            audioPlayer = createAudioPlayer();
            const resource = createAudioResource(streamSource, { inputType: streamType });
            
            audioPlayer.play(resource);
            currentVoiceConnection.subscribe(audioPlayer);

            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                console.log("Yayın bitti, yenisi başlatılıyor...");
                if (currentStreamInfo.channelId) {
                    startStreaming(currentStreamInfo.channelId, currentStreamInfo.type === 'camera');
                }
            });
            audioPlayer.on('error', error => {
                console.error(`Audio Player Hatası: ${error.message}, yayın yeniden başlatılıyor...`);
                 if (currentStreamInfo.channelId) {
                    startStreaming(currentStreamInfo.channelId, currentStreamInfo.type === 'camera');
                }
            });

            io.emit('status-update', { message: `${isCamera ? 'Kamera modu' : 'Yayın'} başlatıldı.`, type: 'success' });
            io.emit('stream-status-change', { type: isCamera ? 'camera' : 'stream', isActive: true });
            
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
        if (!activeTypingChannels.has(channelId)) {
            await channel.startTyping();
            activeTypingChannels.add(channelId);
            socket.emit('status-update', { message: `'Yazıyor...' durumu başlatıldı.`, type: 'info' });
        }
    } catch (e) {
        console.error("'Yazıyor...' Başlatma Hatası:", e.message);
        socket.emit('status-update', { message: `'Yazıyor...' durumu durduruldu.`, type: 'info' });
        }

    socket.on('clean-dm', async (data) => {
        try {
            const user = await client.users.fetch(data.userId);
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
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
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
            }, 1500);
        } catch (e) {
            socket.emit('status-update', { message: 'Spam için geçersiz Token: ' + e.message, type: 'error' });
            socket.emit('spam-status-change', false);
        }
    });
});

login(config.token);

const magenta = '\u001b[35m';
const cyan = '\u001b[36m';
const reset = '\u001b[0m';

const asciiArt = `
${magenta}  ██████╗ ███████╗  █████╗ ██╗     ██╗  ██╗   ██╗██████╗  █████╗ ██╗  ██╗
${magenta}  ██╔══██╗██╔════╝ ██╔══██╗██║     ██║  ╚██╗ ██╔╝██╔══██╗██╔══██╗╚██╗██╔╝
${cyan}  ██████╔╝█████╗   ███████║██║     ██║   ╚████╔╝ ██████╔╝███████║ ╚███╔╝ 
${cyan}  ██╔══██╗██╔══╝   ██╔══██║██║     ██║    ╚██╔╝  ██╔══██╗██╔══██║ ██╔██╗ 
${magenta}  ██║  ██║███████╗ ██║  ██║███████╗███████╗   ██║   ██║  ██║██║  ██║██╔╝ ██╗
${magenta}  ╚═╝  ╚═╝╚══════╝ ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
`;

console.log(asciiArt);
console.log(`${cyan}======================================================================${reset}`);
console.log(`${magenta}                          Sunucu başlatılıyor...                        ${reset}`);
console.log(`${cyan}======================================================================${reset}`);


server.listen(3000, () => {
    console.log(`${magenta}Sunucu ${cyan}http://localhost:3000${magenta} portunda başarıyla başlatıldı.${reset}`);
});
}
