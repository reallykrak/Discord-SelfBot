const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnectionStatus, entersState, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const playdl = require('play-dl'); // 'play' yerine 'playdl' olarak değiştirdim

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let client = new Client({ checkUpdate: false });
let afkEnabled = true;

let spamInterval = null;
let spammerClient = null;
let audioPlayer = null;
let currentVoiceConnection = null;
let currentStreamInfo = { type: null, channelId: null };
let activeTypingChannels = new Set(); // Sürekli yazıyor durumu için

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
        // AFK Modu
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== client.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }

        // Komut İşleme
        if (msg.author.id !== client.user.id || !msg.content.startsWith('.')) return;

        const args = msg.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        try {
            switch (command) {
                case 'help':
                    const helpMessage = `
**REALLYKRAK Komutları:**
\`\`\`
.help                           - Bu yardım menüsünü gösterir.
.nitro_troll                    - Sahte bir Nitro hediye bağlantısı gönderir.
.avatar <URL>                   - Profil fotoğrafınızı değiştirir.
.status <type> <name> [state]   - Durumunuzu ayarlar. Türler: PLAYING, WATCHING, LISTENING, STREAMING, COMPETING.
                                  Örn: .status PLAYING Visual Studio Code Kod yazıyor...
.dm <KullanıcıID> <mesaj>       - Belirtilen kullanıcıya DM gönderir.
.ghostping <KanalID> <KullanıcıID> - Belirtilen kişiye ghost ping atar.
.typing <KanalID>               - Belirtilen kanalda yazıyor durumunu açıp/kapatır.
.stop_stream                    - Aktif yayını durdurur.
.stop_camera                    - Aktif kamera modunu durdurur.
\`\`\`
`;
                    await msg.channel.send(helpMessage);
                    break;

                case 'nitro_troll':
                    await msg.channel.send('https://discord.gift/SEN_TROLLEDIN');
                    break;

                case 'avatar':
                    const avatarUrl = args[0];
                    if (!avatarUrl) return msg.channel.send('Lütfen bir URL belirtin. Örn: `.avatar <URL>`');
                    await client.user.setAvatar(avatarUrl);
                    await msg.channel.send('Profil fotoğrafı güncellendi.');
                    break;

                case 'status':
                    const activityType = args.shift()?.toUpperCase();
                    const activityName = args.shift();
                    const customStatus = args.join(' ');

                    if (!activityType || !activityName) {
                        return msg.channel.send('Lütfen tür ve aktivite adını belirtin. Örn: `.status PLAYING Visual Studio Code Kod yazıyor...`');
                    }

                    const validTypes = ['PLAYING', 'WATCHING', 'LISTENING', 'STREAMING', 'COMPETING'];
                    if (!validTypes.includes(activityType)) {
                        return msg.channel.send(`Geçersiz aktivite türü. Geçerli türler: ${validTypes.join(', ')}`);
                    }

                    const presenceData = { activities: [] };
                    presenceData.activities.push({
                        name: activityName,
                        type: activityType,
                        state: customStatus || undefined,
                    });
                    await client.user.setPresence(presenceData);
                    await msg.channel.send('Durum güncellendi.');
                    break;

                case 'dm':
                    const dmUserId = args.shift();
                    const dmContent = args.join(' ');
                    if (!dmUserId || !dmContent) return msg.channel.send('Lütfen kullanıcı ID ve mesaj belirtin. Örn: `.dm <KullanıcıID> <mesaj>`');
                    const user = await client.users.fetch(dmUserId);
                    await user.send(dmContent);
                    await msg.channel.send('DM başarıyla gönderildi.');
                    break;

                case 'ghostping':
                    const ghostChannelId = args.shift();
                    const ghostUserId = args.shift();
                    if (!ghostChannelId || !ghostUserId) return msg.channel.send('Lütfen kanal ve kullanıcı ID belirtin. Örn: `.ghostping <KanalID> <KullanıcıID>`');
                    const channel = await client.channels.fetch(ghostChannelId);
                    const pingMsg = await channel.send(`<@${ghostUserId}>`);
                    await pingMsg.delete();
                    await msg.channel.send('Ghost ping gönderildi.');
                    break;

                case 'typing':
                    const typingChannelId = args.shift();
                    if (!typingChannelId) return msg.channel.send('Lütfen kanal ID belirtin. Örn: `.typing <KanalID>`');
                    const typingChannel = await client.channels.fetch(typingChannelId);
                    if (activeTypingChannels.has(typingChannelId)) {
                        typingChannel.stopTyping(true);
                        activeTypingChannels.delete(typingChannelId);
                        await msg.channel.send('Yazıyor durumu durduruldu.');
                    } else {
                        typingChannel.startTyping();
                        activeTypingChannels.add(typingChannelId);
                        await msg.channel.send('Yazıyor durumu başlatıldı. Durdurmak için tekrar `.typing` yazın.');
                    }
                    break;
                case 'stop_stream':
                    await stopStreaming('user'); // Use the same stopStreaming logic
                    await msg.channel.send('Yayın durduruldu.');
                    break;
                case 'stop_camera':
                    await stopStreaming('user'); // Camera mode uses the same streaming infrastructure
                    await msg.channel.send('Kamera modu durduruldu.');
                    break;

                default:
                    await msg.channel.send('Bilinmeyen komut. Komut listesi için `.help` yazın.');
                    break;
            }
        } catch (e) {
            console.error(`Komut hatası [${command}]:`, e);
            await msg.channel.send(`Komut çalıştırılırken bir hata oluştu: ${e.message}`);
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
            if (client && client.user) {
                await client.user.setPresence({ activities: [] });
            }
        } catch (error) {
            console.error("Presence temizlenirken hata oluştu:", error.message);
        }
        if (source === 'user') {
            socket.emit('status-update', { message: 'Yayın durduruldu.', type: 'info' });
        }
        currentStreamInfo = { type: null, channelId: null };
        io.emit('stream-status-change', { type: 'camera', isActive: false });
        io.emit('stream-status-change', { type: 'stream', isActive: false });
    };

    const startStreaming = async (channelId, isCamera) => {
        if (getVoiceConnection(channelId)) await stopStreaming('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));

        currentStreamInfo = { type: isCamera ? 'camera' : 'stream', channelId: channelId };
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            let videoSourceUrl;
            if (isCamera) {
                videoSourceUrl = config.cameraVideoUrl;
            } else {
                if (videoList.length === 0) {
                    throw new Error("'videos.json' dosyanız boş veya okunamadı. Lütfen geçerli video URL'leri ekleyin.");
                }
                videoSourceUrl = videoList[Math.floor(Math.random() * videoList.length)];
            }
            
            // Critical check for undefined or invalid URLs
            if (!videoSourceUrl || typeof videoSourceUrl !== 'string' || videoSourceUrl.trim() === '') {
                throw new Error('Yayın için geçerli bir URL bulunamadı veya boş.');
            }

            console.log(`Yayın başlatılıyor: ${videoSourceUrl}`);
            
            let streamSource;
            let streamType;

            const validatedType = await playdl.validate(videoSourceUrl); // 'play' yerine 'playdl'

            if (validatedType === 'yt_video' || validatedType === 'yt_playlist') {
                const p_stream = await playdl.stream(videoSourceUrl); // 'play' yerine 'playdl'
                streamSource = p_stream.stream;
                streamType = p_stream.type;
            } else {
                // play-dl'nin doğrudan medya dosyalarını yanlış yorumlama sorununu çözmek için node-fetch kullan
                const { default: fetch } = await import('node-fetch');
                const response = await fetch(videoSourceUrl);
                if (!response.ok) throw new Error(`URL'den akış alınamadı: ${response.statusText}`);
                streamSource = response.body; // response.body bir ReadableStream'dir
                streamType = StreamType.Arbitrary; // @discordjs/voice'dan StreamType kullan
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
                if (isCamera) {
                    await voiceState.setSelfVideo(true);
                } else {
                    await voiceState.setSelfStream(true);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));

            audioPlayer = createAudioPlayer();
            const resource = createAudioResource(streamSource, { inputType: streamType }); // streamSource ve streamType kullan

            audioPlayer.play(resource);
            currentVoiceConnection.subscribe(audioPlayer);

            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                console.log("Yayın bitti veya durakladı, yenisi başlatılıyor...");
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
        if (status) {
            startStreaming(channelId, type === 'camera');
        } else {
            stopStreaming('user');
        }
    });
    
    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => { stopStreaming('internal'); login(token); });

    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Profil fotoğrafı güncellendi.', type: 'success' });
            socket.emit('bot-info', {
                username: client.user.username,
                tag: client.user.tag,
                avatar: client.user.displayAvatarURL(),
                id: client.user.id
            });
        } catch (e) {
            console.error("Avatar Değiştirme Hatası:", e.message);
            socket.emit('status-update', { message: 'Avatar değiştirilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('change-status', async (data) => {
        try {
            const activity = {
                name: data.activityName,
                type: data.activityType.toUpperCase(),
                state: data.customStatus,
            };
    
            // Rich Presence Assets
            if (data.applicationId && data.largeImageKey) {
                activity.application_id = data.applicationId;
                activity.assets = {
                    large_image: data.largeImageKey,
                    large_text: data.largeImageText || ' ',
                    small_image: data.smallImageKey || undefined,
                    small_text: data.smallImageText || ' '
                };
            }
    
            const presenceData = { activities: [] };
            if (data.activityName) {
                presenceData.activities.push(activity);
            }
            
            await client.user.setPresence(presenceData);
            socket.emit('status-update', { message: 'Durum güncellendi.', type: 'success' });
        } catch (e) {
            console.error("Durum Değiştirme Hatası:", e.message);
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('send-dm', async (data) => {
        try {
            const user = await client.users.fetch(data.userId);
            await user.send(data.content);
            socket.emit('status-update', { message: 'DM başarıyla gönderildi.', type: 'success' });
        } catch (e) {
            console.error("DM Gönderme Hatası:", e.message);
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
            socket.emit('status-update', { message: "'Yazıyor...' durumu başlatılamadı.", type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
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
        try {
            const user = await client.users.fetch(data.userId);
            if (!user) {
                return socket.emit('status-update', { message: 'Kullanıcı bulunamadı.', type: 'error' });
            }
            const dmChannel = await user.createDM();
            socket.emit('status-update', { message: `${user.tag} ile olan mesajlar siliniyor...`, type: 'info' });

            let messages;
            let deletedCount = 0;
            let lastId = null;

            while(true) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                messages = await dmChannel.messages.fetch(options);
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
                if (messages.last()) {
                    lastId = messages.last().id;
                } else {
                    break; // No more messages
                }
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

