// Termux uyumluluğu için package.json'a opusscript paketi eklendi.
// discord-stream-client, @discordjs/opus'u bulamazsa otomatik olarak opusscript'i kullanacaktır.

require('./polyfill.js');
const { Client, ActivityType, MessageEmbed } = require("discord.js-selfbot-v13");
const { DiscordStreamClient } = require("discord-stream-client");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const { readFileSync } = require("fs");
const play = require("play-dl");
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config.js');
const executeRaid = require('./raid.js');
const cloneServer = require('./server-cloner.js');

// ---- EXPRESS & SOCKET.IO KURULUMU ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ---- YÖNETİLECEK BOT BÖLÜMLERİ ----
let botProcess = null;
const botWorkingDirectory = path.join(__dirname, 'bot');

[botWorkingDirectory, path.join(__dirname, 'music')].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Manager] "${path.basename(dir)}" klasörü oluşturuldu.`);
    }
});

function executeCommand(command, args, cwd, socket, logPrefix = 'bot') {
    const process = spawn(command, args, { cwd, shell: true });
    socket.emit(`${logPrefix}:log`, `[Komut] ${command} ${args.join(' ')}\n`);
    
    process.stdout.on('data', (data) => socket.emit(`${logPrefix}:log`, data.toString()));
    process.stderr.on('data', (data) => socket.emit(`${logPrefix}:log`, `[HATA] ${data.toString()}`));
    process.on('close', (code) => socket.emit(`${logPrefix}:log`, `İşlem sonlandı. Çıkış kodu: ${code}\n`));
    
    return process;
}

// ---- STREAMER BÖLÜMÜ ----
let videoList = [];
try {
    const videoData = readFileSync('./videos.json', 'utf8');
    if (videoData) {
        videoList = JSON.parse(videoData).videoUrls;
        console.log(`[Streamer] ${videoList.length} video yüklendi.`);
    }
} catch (error) {
    console.error('[Streamer] videos.json okunurken hata:', error.message);
    videoList = ["https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"];
    console.log('[Streamer] Varsayılan video listesi kullanılıyor.');
}

const streamingClients = new Map();

function getRandomVideo() {
    if (videoList.length === 0) return null;
    return videoList[Math.floor(Math.random() * videoList.length)];
}

async function startStreamer(botConfig, type = 'stream') {
    if (streamingClients.has(botConfig.token)) {
        console.log(`[Streamer] ${botConfig.token.substring(0, 5)}... tokenli bot zaten aktif.`);
        return;
    }

    const client = new Client({ checkUpdate: false });

    const streamSettings = config.stream_settings || {};
    const resolution = streamSettings.resolution || '720p';
    const fps = streamSettings.fps || 30;
    const videoBitrate = streamSettings.video_bitrate || '1000k';
    const audioBitrate = streamSettings.audio_bitrate || '128k';
    let ffmpegArgs = [...(streamSettings.ffmpeg_args || [])];
    ffmpegArgs.push('-b:v', videoBitrate, '-b:a', audioBitrate);
    ffmpegArgs.push('-acodec', 'aac', '-ar', '48000');
    
    const streamOptions = {
        fps: fps,
        ffmpeg_args: ffmpegArgs
    };

    const streamClient = new DiscordStreamClient(client, streamOptions);
    streamClient.setResolution(resolution);
    streamClient.setVideoCodec('H264');
    
    console.log(`[Streamer] Performans ayarları uygulandı: ${resolution}@${fps}fps, V-Bitrate: ${videoBitrate}, A-Bitrate: ${audioBitrate}`);
    
    const isCameraOnly = type === 'camera';
    let player;

    client.on('ready', async () => {
        const botState = streamingClients.get(botConfig.token);
        if(botState) {
            botState.tag = client.user.tag;
            botState.avatar = client.user.displayAvatarURL();
            console.log(`[Streamer] ${client.user.tag} olarak giriş yapıldı ve yayın için hazır.`);
            updateStreamerStatus();
        }

        try {
            const voiceChannel = await client.channels.fetch(botConfig.voice_channel_id);
            if (!voiceChannel || !voiceChannel.isVoice()) throw new Error('Ses kanalı bulunamadı veya bir ses kanalı değil.');

            const connection = await streamClient.joinVoiceChannel(voiceChannel, { selfDeaf: false, selfMute: false, selfVideo: isCameraOnly });
            botState.statusText = isCameraOnly ? `Kamera açık: ${voiceChannel.name}` : `Yayın yapıyor: ${voiceChannel.name}`;
            updateStreamerStatus();

            if (isCameraOnly) return; 

            const restartStream = async () => {
                const bot = streamingClients.get(botConfig.token);
                if (!bot) return;

                const videoSource = getRandomVideo();
                if (!videoSource) {
                    console.log('[Streamer] Oynatılacak video bulunamadı. Yayın durduruluyor.');
                    stopStreamer(botConfig.token);
                    return;
                }

                console.log(`[Streamer] ${client.user.tag} oynatıyor: ${videoSource}`);
                
                let inputStream;

                try {
                    if (play.yt_validate(videoSource) === 'video') {
                        const streamInfo = await play.stream(videoSource, { discordPlayerCompatibility: true });
                        inputStream = streamInfo.stream;
                    } else {
                        inputStream = videoSource;
                    }
                } catch (e) {
                    console.error(`[Streamer] Video kaynağı işlenemedi: ${videoSource}\n Hata: ${e.message}\nSıradaki video deneniyor...`);
                    setTimeout(restartStream, 2000);
                    return;
                }
            
                try {
                    const streamConnection = await connection.createStream();
                    player = streamClient.createPlayer(inputStream, streamConnection.udp);
                    botState.player = player;
    
                    player.on('finish', () => {
                        console.log(`[Streamer] Video bitti, sıradaki video başlatılıyor...`);
                        setTimeout(restartStream, 1000);
                    });
                    player.on('error', (err) => {
                        console.error('[Streamer] Oynatıcı hatası:', err.message);
                        stopStreamer(botConfig.token);
                    });
    
                    player.play();
                } catch (e) {
                     console.error('[Streamer] Akış oluşturulurken veya oynatılırken hata:', e.message);
                     stopStreamer(botConfig.token);
                }
            };
            await restartStream();

        } catch (error) {
            console.error('[Streamer] Giriş veya yayın başlatma hatası:', error.message);
            stopStreamer(botConfig.token);
        }
    });

    client.login(botConfig.token).catch(err => {
        console.error(`[Streamer] ${botConfig.token.substring(0,5)}... tokeni ile giriş yapılamadı:`, err.message);
        streamingClients.delete(botConfig.token);
        updateStreamerStatus();
    });

    streamingClients.set(botConfig.token, { client, status: 'online', statusText: 'Giriş yapılıyor...' });
    updateStreamerStatus();
}

async function stopStreamer(token) {
    const bot = streamingClients.get(token);
    if (bot) {
        const botTag = bot.tag || 'Bot';
        if (bot.player) {
            bot.player.stop();
        }
        if (bot.client) {
            bot.client.destroy();
        }
        streamingClients.delete(token);
        console.log(`[Streamer] ${botTag} durduruldu.`);
        updateStreamerStatus();
        io.emit('status-update', { message: `${botTag} durduruldu.`, type: 'info' });
    }
}

function updateStreamerStatus() {
    const statusList = Array.from(config.streamer_configs, cfg => {
        const activeBot = streamingClients.get(cfg.token);
        return {
            token: cfg.token,
            tag: activeBot ? activeBot.tag : null,
            avatar: activeBot ? activeBot.avatar : null,
            status: activeBot ? activeBot.status : 'offline',
            statusText: activeBot ? activeBot.statusText : 'Çevrimdışı'
        };
    });
    io.emit('streamer-status-update', statusList);
}

// ---- WEB PANEL BÖLÜMÜ ----
let panelClient = new Client({ checkUpdate: false });
let afkEnabled = true;
let spamTimeout = null;
let spammerClient = null;
let voiceConnection = null;
let audioPlayer = null;
let musicPlaylist = [];

// Troll Grup için global değişkenler
let trollGroupChannel = null;
let trollGroupListener = null;

const musicDir = path.join(__dirname, 'music');
try {
    const files = fs.readdirSync(musicDir);
    musicPlaylist = files.filter(file => file.endsWith('.mp3'));
    console.log(`[Music] ${musicPlaylist.length} şarkı yüklendi.`);
} catch (error) {
    console.error('[Music] Müzik klasörü okunurken hata:', error);
}

function playNextSong() {
    if (!voiceConnection || musicPlaylist.length === 0) {
        io.emit('status-update', { message: 'Müzik listesi boş veya ses kanalında değilsiniz.', type: 'warning' });
        return;
    }
    const song = musicPlaylist[Math.floor(Math.random() * musicPlaylist.length)];
    const resource = createAudioResource(path.join(musicDir, song));
    
    if (!audioPlayer) {
        audioPlayer = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });
        audioPlayer.on('error', error => {
            console.error('[Music] Audio Player Hatası:', error);
            io.emit('status-update', { message: `Müzik hatası: ${error.message}`, type: 'error' });
        });
        audioPlayer.on(VoiceConnectionStatus.Idle, () => {
             playNextSong();
        });
    }

    audioPlayer.play(resource);
    voiceConnection.subscribe(audioPlayer);
    io.emit('status-update', { message: `Şimdi çalıyor: ${song}`, type: 'info' });
}

function loginPanelClient(token) {
    if (panelClient && panelClient.readyAt) {
        panelClient.destroy();
    }
    panelClient = new Client({ checkUpdate: false });

    panelClient.on('ready', () => {
        console.log(`[Web Panel] ${panelClient.user.tag} olarak giriş yapıldı!`);
        io.emit('bot-info', {
            tag: panelClient.user.tag,
            avatar: panelClient.user.displayAvatarURL(),
            id: panelClient.user.id,
        });
        io.emit('status-update', { message: 'Panele başarıyla giriş yapıldı!', type: 'success' });
    });
    
    panelClient.on('messageCreate', async msg => {
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== panelClient.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }

        if (msg.author.id !== panelClient.user.id) return;
        
        const prefix = ".";
        if (!msg.content.startsWith(prefix)) return;

        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();

        if (command === "help") {
            try {
                const helpEmbed = new MessageEmbed()
                    .setTitle('Stark\'s Industries | Komut Menüsü')
                    .setDescription('Aşağıda mevcut tüm komutları görebilirsin.')
                    .setColor('#8A2BE2')
                    .setTimestamp()
                    .setFooter({ text: `${panelClient.user.tag}` })
                    .addFields(
                        { name: '🛠️ Genel Komutlar', value: '`.help`, `.ping`, `.avatar [@kullanıcı]`', inline: false },
                        { name: '⚙️ Hesap Yönetimi', value: '`.oynuyor [oyun]`, `.izliyor [film]`, `.dinliyor [şarkı]`, `.yayın [yayın adı]`, `.durum [online/idle/dnd/invisible]`, `.temizle [sayı]`', inline: false },
                        { name: '💥 Raid & Yönetim Komutları', value: '`.dmall [mesaj]`, `.rol-oluştur [isim] [sayı]`, `.kanal-oluştur [isim] [sayı]`, `.herkesi-banla [sebep]`, `.kanalları-sil`, `.rolleri-sil`', inline: false }
                    );
                // HATA DÜZELTMESİ: Boş mesaj hatasını önlemek için içeriği boşluk yerine görünmez bir karakterle doldurun.
                await msg.edit({ content: '\u200B', embeds: [helpEmbed] }).catch(async (e) => {
                     console.error("Help komutu düzenlenemedi, silinip yeniden gönderiliyor:", e);
                     await msg.delete();
                     await msg.channel.send({ embeds: [helpEmbed] });
                });
            } catch (e) {
                console.error("Help komutu başarısız:", e);
                await msg.edit("Komutlar yüklenemedi. Lütfen tekrar deneyin.").catch(console.error);
            }
        }

        if (command === "ping") {
            msg.edit(`Pong! Gecikme: **${panelClient.ws.ping}ms**`);
        }

        if (command === "dmall") {
             if (!msg.inGuild()) return msg.edit("Bu komut sadece sunucularda kullanılabilir.");
             const text = args.join(" ");
             if(!text) return msg.edit("Gönderilecek mesajı yazmalısın.");
             msg.delete();
             msg.guild.members.cache.forEach(member => {
                if (member.id !== panelClient.user.id && !member.user.bot) {
                    member.send(text).catch(() => console.log(`${member.user.tag} adlı kullanıcıya DM gönderilemedi.`));
                }
             });
        }
    });

    panelClient.login(token).catch(error => {
        console.error('[Web Panel] Giriş hatası:', error.message);
        io.emit('status-update', { message: 'Geçersiz Panel Token. Giriş yapılamadı.', type: 'error' });
    });
}

// ---- SOCKET.IO BAĞLANTI YÖNETİCİSİ ----
io.on('connection', (socket) => {
    console.log('[Web Panel] Bir kullanıcı bağlandı.');
    if (panelClient.user) {
        socket.emit('bot-info', { tag: panelClient.user.tag, avatar: panelClient.user.displayAvatarURL(), id: panelClient.user.id });
    }
    socket.emit('bot:status', { isRunning: !!botProcess });

    socket.on('bot:install', () => {
        socket.emit('bot:log', 'Bağımlılıklar kuruluyor (npm install)...\n');
        executeCommand('npm', ['install'], botWorkingDirectory, socket, 'bot');
    });

    socket.on('bot:start', () => {
        if (botProcess) return socket.emit('bot:log', 'Bot zaten çalışıyor!\n');
        socket.emit('bot:log', 'Bot başlatılıyor (node index.js)...\n');
        botProcess = executeCommand('node', ['index.js'], botWorkingDirectory, socket, 'bot');
        io.emit('bot:status', { isRunning: true });
        botProcess.on('close', (code) => {
            botProcess = null;
            io.emit('bot:status', { isRunning: false });
        });
    });

    socket.on('bot:stop', () => {
        if (botProcess) {
            botProcess.kill();
            botProcess = null;
            io.emit('bot:log', 'Bot durduruldu.\n');
            io.emit('bot:status', { isRunning: false });
        } else {
            socket.emit('bot:log', 'Bot zaten çalışmıyor.\n');
        }
    });

    socket.on('bot:command', (command) => {
        if (botProcess && command) {
            botProcess.stdin.write(command + '\n');
            socket.emit('bot:log', `> ${command}\n`);
        } else {
            socket.emit('bot:log', 'Komut göndermek için önce botu başlatmalısınız.\n');
        }
    });

    socket.on('start-raid', async (data) => {
        try {
            const { serverId, raidName, amount } = data;
            if (!panelClient || !panelClient.user) {
                return socket.emit('status-update', { message: 'Panel botu aktif değil.', type: 'error' });
            }
            const guild = await panelClient.guilds.fetch(serverId).catch(() => null);
            if (!guild) {
                return socket.emit('status-update', { message: 'Sunucu bulunamadı veya bot sunucuda değil.', type: 'error' });
            }
            const member = await guild.members.fetch(panelClient.user.id).catch(() => null);
            if (!member || !member.permissions.has('ADMINISTRATOR')) {
                 return socket.emit('status-update', { message: 'Panel botunun bu sunucuda YÖNETİCİ yetkisi yok.', type: 'error' });
            }
            const mockMessage = {
                content: `.raid ${raidName} ${amount}`, guild, client: panelClient, author: panelClient.user, member,
                delete: () => new Promise(resolve => resolve()),
            };
            socket.emit('status-update', { message: `${guild.name} sunucusunda raid başlatıldı!`, type: 'success' });
            executeRaid(mockMessage);
        } catch (error) {
            console.error('[RAID HATA]', error);
            socket.emit('status-update', { message: 'Raid başlatılırken bir hata oluştu: ' + error.message, type: 'error' });
        }
    });

    socket.on('voice-control', async (data) => {
        const { action, channelId } = data;
        
        switch (action) {
            case 'join':
                if (!channelId) return socket.emit('status-update', { message: 'Ses Kanalı IDsi girmelisiniz.', type: 'error' });
                const channel = await panelClient.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isVoice()) return socket.emit('status-update', { message: 'Geçerli bir ses kanalı bulunamadı.', type: 'error' });
                if (voiceConnection) voiceConnection.destroy();
                voiceConnection = joinVoiceChannel({
                    channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false, selfMute: false
                });
                socket.emit('status-update', { message: `${channel.name} kanalına katılındı.`, type: 'success' });
                break;
            case 'leave':
                if (voiceConnection) {
                    voiceConnection.destroy(); voiceConnection = null;
                    if(audioPlayer) audioPlayer.stop();
                    socket.emit('status-update', { message: 'Ses kanalından ayrılındı.', type: 'info' });
                }
                break;
            case 'play': playNextSong(); break;
            case 'stop':
                if (audioPlayer) {
                    audioPlayer.stop();
                    socket.emit('status-update', { message: 'Müzik durduruldu.', type: 'info' });
                }
                break;
        }
    });
    
    socket.on('change-status', async (data) => {
        try {
            // HATA DÜZELTMESİ: RPC'nin çalışması için ActivityType enum'larını kullanın
            const activityTypeMap = {
                PLAYING: ActivityType.Playing,
                STREAMING: ActivityType.Streaming,
                LISTENING: ActivityType.Listening,
                WATCHING: ActivityType.Watching,
                COMPETING: ActivityType.Competing,
            };
            const selectedType = activityTypeMap[data.activity.type] ?? ActivityType.Playing;

            const presenceData = {
                status: data.status,
                activities: [],
            };

            if (data.activity.name) {
                const activity = {
                    name: data.activity.name,
                    type: selectedType,
                    details: data.activity.details,
                    state: data.activity.state,
                    assets: {}
                };

                if (selectedType === ActivityType.Streaming && data.activity.url) {
                    activity.url = data.activity.url;
                }

                if (data.activity.applicationId) {
                    activity.application_id = data.activity.applicationId;
                }

                if (data.activity.largeImageKey) {
                    activity.assets.large_image = data.activity.largeImageKey;
                    if (data.activity.largeImageText) {
                        activity.assets.large_text = data.activity.largeImageText;
                    }
                }
                if (data.activity.smallImageKey) {
                    activity.assets.small_image = data.activity.smallImageKey;
                    if (data.activity.smallImageText) {
                        activity.assets.small_text = data.activity.smallImageText;
                    }
                }

                // Eğer assets nesnesi boşsa, onu aktiviteden kaldırın
                if (Object.keys(activity.assets).length === 0) {
                    delete activity.assets;
                }
                
                presenceData.activities.push(activity);
            }

            await panelClient.user.setPresence(presenceData);
            socket.emit('status-update', { message: 'Durum başarıyla değiştirildi.', type: 'success' });
        } catch (error) { 
            console.error("Durum değiştirme hatası:", error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + error.message, type: 'error' }); 
        }
    });

    socket.on('server-copy', async (data) => {
        const { sourceGuildId, newServerName } = data;
        if (!panelClient || !panelClient.user) {
            return socket.emit('status-update', { message: 'Panel botu aktif değil.', type: 'error' });
        }
        socket.emit('status-update', { message: 'Sunucu kopyalama işlemi başlatılıyor...', type: 'info' });
        cloneServer(panelClient, sourceGuildId, newServerName, socket);
    });

    socket.on('start-troll-group', async (data) => {
        if (trollGroupChannel) {
            return socket.emit('status-update', { message: 'Zaten aktif bir troll grup var.', type: 'warning' });
        }
        try {
            const { userIds } = data;
            // HATA DÜZELTMESİ: Geçersiz ID'leri ve boşlukları filtreleyin
            const validUserIds = userIds.filter(id => id && /^\d{17,19}$/.test(id.trim()));
            if (validUserIds.length < 2) {
                return socket.emit('status-update', { message: 'En az 2 geçerli kullanıcı IDsi girmelisiniz.', type: 'error' });
            }

            socket.emit('status-update', { message: 'Grup oluşturuluyor...', type: 'info' });

            // HATA DÜZELTMESİ: Kullanıcı bulunamazsa veya erişilemezse hatayı yakala
            let firstUser;
            try {
                firstUser = await panelClient.users.fetch(validUserIds[0]);
            } catch (e) {
                return socket.emit('status-update', { message: `Grup oluşturulamadı: ${validUserIds[0]} ID'li kullanıcı bulunamadı veya erişilemiyor.`, type: 'error' });
            }
            
            const dmChannel = await firstUser.createDM();
            
            for (let i = 1; i < validUserIds.length; i++) {
                try {
                    await dmChannel.addMember(validUserIds[i]);
                     socket.emit('status-update', { message: `${validUserIds[i]} ID'li kullanıcı gruba eklendi.`, type: 'info' });
                } catch(e) {
                     socket.emit('status-update', { message: `${validUserIds[i]} ID'li kullanıcı eklenemedi: ${e.message}`, type: 'warning' });
                }
                await new Promise(res => setTimeout(res, 500));
            }

            trollGroupChannel = dmChannel;
            
            trollGroupListener = (channel, recipient) => {
                if (trollGroupChannel && channel.id === trollGroupChannel.id) {
                    console.log(`[Troll Group] ${recipient.user.tag} gruptan ayrıldı. Geri ekleniyor...`);
                    socket.emit('status-update', { message: `${recipient.user.tag} gruptan ayrıldı, geri ekleniyor!`, type: 'warning' });
                    setTimeout(() => channel.addMember(recipient.user.id).catch(console.error), 1000);
                }
            };

            panelClient.on('channelRecipientRemove', trollGroupListener);

            socket.emit('troll-group-status', { isActive: true });
            socket.emit('status-update', { message: 'Troll grup başarıyla oluşturuldu ve aktif!', type: 'success' });

        } catch (error) {
            console.error("Troll grup hatası:", error);
            socket.emit('status-update', { message: `Grup oluşturulamadı: ${error.message}`, type: 'error' });
        }
    });

    socket.on('stop-troll-group', () => {
        if (trollGroupListener) {
            panelClient.removeListener('channelRecipientRemove', trollGroupListener);
        }
        trollGroupChannel = null;
        trollGroupListener = null;
        socket.emit('troll-group-status', { isActive: false });
        socket.emit('status-update', { message: 'Troll grup durduruldu.', type: 'info' });
    });

    socket.on('get-streamer-bots', () => updateStreamerStatus());
    socket.on('start-streamer', ({ token, type }) => {
        const botConfig = config.streamer_configs.find(c => c.token === token);
        if (botConfig) startStreamer(botConfig, type);
    });
    socket.on('stop-streamer', ({ token }) => stopStreamer(token));
    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => loginPanelClient(token));
});

// ---- SUNUCUYU BAŞLAT ----
loginPanelClient(config.panel_token);
const port = 3000;
server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde başarıyla başlatıldı.`);
});
