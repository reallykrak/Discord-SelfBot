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

// ---- EXPRESS & SOCKET.IO KURULUMU ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const publicPath = path.join(__dirname, 'public');
app.use('/public', express.static(publicPath));
app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// ---- YÖNETİLECEK BOT BÖLÜMÜ ----
let botProcess = null;
const botWorkingDirectory = path.join(__dirname, 'bot');

if (!fs.existsSync(botWorkingDirectory)) {
    fs.mkdirSync(botWorkingDirectory);
    console.log('[Bot Manager] "bot" klasörü oluşturuldu. Lütfen yönetilecek bot dosyalarını bu klasöre atın.');
}

function executeBotCommand(command, args, socket) {
    const process = spawn(command, args, { cwd: botWorkingDirectory, shell: true });
    process.stdout.on('data', (data) => socket.emit('bot:log', data.toString()));
    process.stderr.on('data', (data) => socket.emit('bot:log', `[HATA] ${data.toString()}`));
    process.on('close', (code) => socket.emit('bot:log', `İşlem sonlandı. Çıkış kodu: ${code}`));
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

    // ---- PERFORMANS VE SES İYİLEŞTİRMESİ ----
    const streamSettings = config.stream_settings || {};
    const resolution = streamSettings.resolution || '720p';
    const fps = streamSettings.fps || 30;
    const videoBitrate = streamSettings.video_bitrate || '1000k';
    const audioBitrate = streamSettings.audio_bitrate || '128k';

    // Mevcut argümanları kopyala
    let ffmpegArgs = [...(streamSettings.ffmpeg_args || [])];

    // Ses ve video bitrate'ini ekle
    ffmpegArgs.push('-b:v', videoBitrate, '-b:a', audioBitrate);
    
    // Ses kesilmesi sorununu çözmek için codec ve frekans belirt
    ffmpegArgs.push('-acodec', 'aac', '-ar', '48000');
    
    const streamOptions = {
        fps: fps,
        ffmpeg_args: ffmpegArgs
    };

    const streamClient = new DiscordStreamClient(client, streamOptions);
    streamClient.setResolution(resolution);
    streamClient.setVideoCodec('H264');
    
    console.log(`[Streamer] Performans ayarları uygulandı: ${resolution}@${fps}fps, V-Bitrate: ${videoBitrate}, A-Bitrate: ${audioBitrate}`);
    // ---- İYİLEŞTİRME SONU ----
    
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
                        console.log('[Streamer] YouTube linki algılandı, play-dl ile işleniyor...');
                        const streamInfo = await play.stream(videoSource, { discordPlayerCompatibility: true });
                        inputStream = streamInfo.stream;
                    } else {
                        console.log('[Streamer] Direkt video linki algılandı, doğrudan ffmpeg kullanılacak...');
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
    const statusList = config.streamer_configs.map(cfg => {
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

const musicDir = path.join(__dirname, 'music');
if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir);
    console.log('[Music] "music" klasörü oluşturuldu. Lütfen .mp3 dosyalarınızı buraya ekleyin.');
} else {
    try {
        const files = fs.readdirSync(musicDir);
        musicPlaylist = files.filter(file => file.endsWith('.mp3'));
        console.log(`[Music] ${musicPlaylist.length} şarkı yüklendi.`);
    } catch (error) {
        console.error('[Music] Müzik klasörü okunurken hata:', error);
    }
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
    if (panelClient && panelClient.readyAt) panelClient.destroy();
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
    
    // =========================================================================================
    // ============================= YENİ KOMUT SİSTEMİ BAŞLANGIÇ =============================
    // =========================================================================================
    panelClient.on('messageCreate', async msg => {
        // AFK sistemi
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== panelClient.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }

        // Komutlar sadece bot sahibi tarafından kullanılabilir
        if (msg.author.id !== panelClient.user.id) return;
        
        const prefix = "."; // Komut ön eki
        if (!msg.content.startsWith(prefix)) return;

        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();

        // ---- YARDIM KOMUTU ----
        if (command === "help") {
            const helpEmbed = new MessageEmbed()
                .setTitle('REALLYKRAK | Komut Menüsü')
                .setDescription('Aşağıda mevcut tüm komutları görebilirsin.')
                .setColor('BLUE')
                .setTimestamp()
                .setFooter({ text: `${panelClient.user.tag}` })
                .addFields(
                    { name: '🛠️ Genel Komutlar', value: '`.help`, `.ping`, `.avatar [@kullanıcı]`, `.sunucu-bilgi`, `.kullanıcı-bilgi [@kullanıcı]`', inline: false },
                    { name: '✨ Eğlence & Metin Komutları', value: '`.say [mesaj]`, `.embed [mesaj]`, `.büyükyaz [mesaj]`, `.tersyaz [mesaj]`', inline: false },
                    { name: '⚙️ Hesap Yönetimi', value: '`.oynuyor [oyun]`, `.izliyor [film]`, `.dinliyor [şarkı]`, `.yayın [yayın adı]`, `.durum [online/idle/dnd/invisible]`, `.temizle [sayı]`', inline: false },
                    { name: '⚠️ Tehlikeli & Yönetim Komutları (DİKKATLİ KULLAN!)', value: '`.dmall [mesaj]`, `.rol-oluştur [isim] [sayı]`, `.kanal-oluştur [isim] [sayı]`, `.herkesi-banla [sebep]`, `.herkesi-kickle [sebep]`, `.kanalları-sil`, `.rolleri-sil`, `.emoji-ekle [link] [isim]`', inline: false },
                    { name: '💥 Raid Komutları (ÇOK TEHLİKELİ!)', value: '`.raid [kanal-adı] [sayı]`', inline: false }
                );
            msg.channel.send({ embeds: [helpEmbed] }).catch(console.error);
        }

        // ---- GENEL KOMUTLAR ----
        if (command === "ping") {
            msg.edit(`Pong! Gecikme: **${panelClient.ws.ping}ms**`);
        }
        if (command === "avatar") {
            const user = msg.mentions.users.first() || panelClient.users.cache.get(args[0]) || msg.author;
            const avatarEmbed = new MessageEmbed()
                .setTitle(`${user.username} adlı kullanıcının avatarı`)
                .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setColor("RANDOM");
            msg.channel.send({ embeds: [avatarEmbed] });
        }
        if (command === "sunucu-bilgi") {
            if (!msg.inGuild()) return msg.edit("Bu komut sadece sunucularda kullanılabilir.");
            const guild = msg.guild;
            const infoEmbed = new MessageEmbed()
                .setTitle(`${guild.name} | Sunucu Bilgileri`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setColor("GREEN")
                .addFields(
                    { name: '👑 Sahip', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '👥 Üyeler', value: `${guild.memberCount}`, inline: true },
                    { name: '📅 Oluşturulma', value: `<t:${parseInt(guild.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '🆔 Sunucu ID', value: guild.id, inline: false },
                    { name: '💬 Kanallar', value: `${guild.channels.cache.size}`, inline: true },
                    { name: '🏷️ Roller', value: `${guild.roles.cache.size}`, inline: true },
                );
            msg.channel.send({ embeds: [infoEmbed] });
        }
         if (command === "kullanıcı-bilgi") {
            const user = msg.mentions.users.first() || panelClient.users.cache.get(args[0]) || msg.author;
            const member = msg.guild.members.cache.get(user.id);
            const userEmbed = new MessageEmbed()
                .setTitle(`${user.username} | Kullanıcı Bilgileri`)
                .setThumbnail(user.displayAvatarURL({dynamic: true}))
                .setColor("PURPLE")
                 .addFields(
                    { name: 'Kullanıcı Adı', value: user.tag, inline: true },
                    { name: 'ID', value: user.id, inline: true },
                    { name: 'Hesap Oluşturulma', value: `<t:${parseInt(user.createdTimestamp / 1000)}:R>`, inline: false },
                    { name: 'Sunucuya Katılma', value: `<t:${parseInt(member.joinedTimestamp / 1000)}:R>`, inline: false },
                 );
            msg.channel.send({embeds: [userEmbed]})
        }


        // ---- EĞLENCE & METİN KOMUTLARI ----
        if (command === "say") {
            msg.delete();
            msg.channel.send(args.join(" "));
        }
        if (command === "embed") {
            msg.delete();
            const embed = new MessageEmbed().setDescription(args.join(" ")).setColor("ORANGE");
            msg.channel.send({ embeds: [embed] });
        }
        if (command === "büyükyaz") {
            const mapping = { 'a': '🇦', 'b': '🇧', 'c': '🇨', 'd': '🇩', 'e': '🇪', 'f': '🇫', 'g': '🇬', 'h': '🇭', 'i': '🇮', 'j': '🇯', 'k': '🇰', 'l': '🇱', 'm': '🇲', 'n': '🇳', 'o': '🇴', 'p': '🇵', 'q': '🇶', 'r': '🇷', 's': '🇸', 't': '🇹', 'u': '🇺', 'v': '🇻', 'w': '🇼', 'x': '🇽', 'y': '🇾', 'z': '🇿' };
            const text = args.join(" ").toLowerCase().split('').map(c => mapping[c] || c).join('');
            msg.edit(text);
        }
         if(command === "tersyaz") {
            const text = args.join(' ');
            msg.edit(text.split('').reverse().join(''));
        }

        // ---- HESAP YÖNETİMİ ----
        if (command === "oynuyor") {
            panelClient.user.setActivity(args.join(" "), { type: 'PLAYING' });
            msg.edit(`Durum **Oynuyor: ${args.join(" ")}** olarak ayarlandı.`);
        }
        if (command === "izliyor") {
            panelClient.user.setActivity(args.join(" "), { type: 'WATCHING' });
            msg.edit(`Durum **İzliyor: ${args.join(" ")}** olarak ayarlandı.`);
        }
        if (command === "dinliyor") {
            panelClient.user.setActivity(args.join(" "), { type: 'LISTENING' });
            msg.edit(`Durum **Dinliyor: ${args.join(" ")}** olarak ayarlandı.`);
        }
        if (command === "yayın") {
            panelClient.user.setActivity(args.join(" "), { type: 'STREAMING', url: "https://www.twitch.tv/discord" });
            msg.edit(`Durum **Yayınlıyor: ${args.join(" ")}** olarak ayarlandı.`);
        }
        if (command === "durum") {
            const status = args[0]?.toLowerCase();
            if (['online', 'idle', 'dnd', 'invisible'].includes(status)) {
                panelClient.user.setStatus(status);
                msg.edit(`Görünürlük **${status}** olarak ayarlandı.`);
            } else {
                msg.edit("Geçersiz durum! (online, idle, dnd, invisible)");
            }
        }
        if (command === "temizle") {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100) return msg.edit("1-100 arası bir sayı girmelisin.");
            const messages = await msg.channel.messages.fetch({ limit: amount });
            const userMessages = messages.filter(m => m.author.id === panelClient.user.id);
            userMessages.forEach(m => m.delete().catch(console.error));
        }
        
        // ---- TEHLİKELİ YÖNETİM KOMUTLARI ----
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
        if(command === "rol-oluştur") {
            if (!msg.inGuild()) return;
            const name = args[0] || 'YeniRol';
            const count = parseInt(args[1]) || 1;
            for(let i = 0; i < count; i++) {
                msg.guild.roles.create({ name: `${name}-${i+1}`, color: 'RANDOM' }).catch(console.error);
            }
        }
        if(command === "kanal-oluştur") {
             if (!msg.inGuild()) return;
            const name = args[0] || 'yeni-kanal';
            const count = parseInt(args[1]) || 1;
            for(let i = 0; i < count; i++) {
                msg.guild.channels.create(`${name}-${i+1}`).catch(console.error);
            }
        }
        if (command === "herkesi-banla") {
            if (!msg.inGuild()) return;
            const reason = args.join(" ") || "Sebep belirtilmedi.";
            msg.guild.members.cache.forEach(member => {
                if (member.bannable && member.id !== panelClient.user.id) {
                    member.ban({ reason }).catch(console.error);
                }
            });
        }
        if (command === "herkesi-kickle") {
             if (!msg.inGuild()) return;
             const reason = args.join(" ") || "Sebep belirtilmedi.";
             msg.guild.members.cache.forEach(member => {
                if (member.kickable && member.id !== panelClient.user.id) {
                    member.kick(reason).catch(console.error);
                }
             });
        }
        if(command === "kanalları-sil") {
            if (!msg.inGuild()) return;
            msg.guild.channels.cache.forEach(channel => channel.delete().catch(console.error));
        }
        if(command === "rolleri-sil") {
             if (!msg.inGuild()) return;
             msg.guild.roles.cache.forEach(role => {
                if(role.editable && role.id !== msg.guild.id) role.delete().catch(console.error);
             });
        }
        if(command === "emoji-ekle") {
            if (!msg.inGuild()) return;
            const link = args[0];
            const name = args[1];
            if(!link || !name) return msg.edit("Kullanım: .emoji-ekle [link] [isim]");
            msg.guild.emojis.create(link, name).then(emoji => msg.edit(`${emoji} emojisi eklendi!`)).catch(() => msg.edit("Emoji eklenemedi. Linki kontrol et veya yetkim yok."));
        }

        // ---- RAID KOMUTLARI ----
        if (command === "raid") {
            if (!msg.inGuild()) return;
             const raidName = args[0] || "raid";
             const amount = parseInt(args[1]) || 50;
             executeRaid({ ...msg, content: `.raid ${raidName} ${amount}` });
        }
    });
    // =======================================================================================
    // ============================= YENİ KOMUT SİSTEMİ BİTİŞ ================================
    // =======================================================================================

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
        socket.emit('bot:log', 'Bağımlılıklar kuruluyor (npm install)... Lütfen bekleyin.\n');
        executeBotCommand('npm', ['install'], socket);
    });

    socket.on('bot:start', () => {
        if (botProcess) {
            return socket.emit('bot:log', 'Bot zaten çalışıyor!\n');
        }
        socket.emit('bot:log', 'Bot başlatılıyor (node index.js)...\n');
        botProcess = spawn('node', ['index.js'], { cwd: botWorkingDirectory, shell: true });
        io.emit('bot:status', { isRunning: true });

        botProcess.stdout.on('data', (data) => io.emit('bot:log', data.toString()));
        botProcess.stderr.on('data', (data) => io.emit('bot:log', `[HATA] ${data.toString()}`));
        botProcess.on('close', (code) => {
            io.emit('bot:log', `\nBot işlemi sonlandı. Çıkış kodu: ${code}\n`);
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
            case 'mute':
            case 'deafen':
                 if (voiceConnection && voiceConnection.state.status === VoiceConnectionStatus.Ready) {
                    const member = panelClient.guilds.cache.get(voiceConnection.joinConfig.guildId)?.me;
                    if(member?.voice) {
                        if(action === 'mute'){
                            const isMuted = !member.voice.selfMute;
                            await member.voice.setMute(isMuted);
                            socket.emit('status-update', { message: isMuted ? 'Mikrofon susturuldu.' : 'Mikrofon açıldı.', type: 'info' });
                        } else {
                            const isDeafened = !member.voice.selfDeaf;
                            await member.voice.setDeaf(isDeafened);
                            socket.emit('status-update', { message: isDeafened ? 'Kulaklık kapatıldı.' : 'Kulaklık açıldı.', type: 'info' });
                        }
                    }
                }
                break;
        }
    });

    socket.on('get-streamer-bots', () => updateStreamerStatus());
    socket.on('start-streamer', ({ token, type }) => {
        const botConfig = config.streamer_configs.find(c => c.token === token);
        if (botConfig) startStreamer(botConfig, type);
    });
    socket.on('stop-streamer', ({ token }) => stopStreamer(token));
    socket.on('toggle-afk', (status) => { afkEnabled = status; });
    socket.on('switch-account', (token) => loginPanelClient(token));

    socket.on('change-avatar', async (url) => {
        try {
            await panelClient.user.setAvatar(url);
            socket.emit('status-update', { message: 'Avatar değiştirildi.', type: 'success' });
        } catch(e) { socket.emit('status-update', { message: 'Avatar değiştirilemedi: ' + e.message, type: 'error' }); }
    });
    
    socket.on('change-status', async (data) => {
        try {
            const activity = {};
            if (data.activity.name) {
                activity.type = ActivityType[data.activity.type.charAt(0).toUpperCase() + data.activity.type.slice(1).toLowerCase()];
                activity.name = data.activity.name;
                if (data.activity.type === 'STREAMING' && data.activity.url) {
                    activity.url = data.activity.url;
                }
            }
            panelClient.user.setPresence({ status: data.status, activities: activity.name ? [activity] : [] });
            socket.emit('status-update', { message: 'Durum değiştirildi.', type: 'success' });
        } catch (error) { socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + error.message, type: 'error' }); }
    });

    socket.on('ghost-ping', async (data) => {
        try {
            const channel = await panelClient.channels.fetch(data.channelId);
            const msg = await channel.send(`<@${data.userId}>`);
            await msg.delete();
            socket.emit('status-update', { message: 'Ghost ping gönderildi.', type: 'success' });
        } catch(e) { socket.emit('status-update', { message: 'Gönderilemedi: ' + e.message, type: 'error' }); }
    });

    socket.on('clean-dm', async (data) => {
        try {
            const user = await panelClient.users.fetch(data.userId).catch(() => null);
            if (!user) throw new Error('Kullanıcı bulunamadı.');
            
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === panelClient.user.id);
            
            let count = 0;
            for (const message of userMessages.values()) {
                await message.delete(); count++;
                await new Promise(resolve => setTimeout(resolve, 350));
            }
            socket.emit('status-update', { message: `${count} mesaj silindi.`, type: 'success' });
        } catch (error) { socket.emit('status-update', { message: 'DM temizlenemedi: ' + error.message, type: 'error' }); }
    });

    socket.on('toggle-spam', async (data) => {
        if (spamTimeout) {
            clearTimeout(spamTimeout); spamTimeout = null;
            if (spammerClient) spammerClient.destroy(); spammerClient = null;
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
                if(!spamTimeout) return;
                const messageCount = data.smartMode ? Math.floor(Math.random() * 5) + 1 : 1;
                const delay = data.smartMode ? (Math.floor(Math.random() * 3000) + parseInt(data.delay)) : parseInt(data.delay);
                for (let i = 0; i < messageCount; i++) {
                    const msg = data.ping ? `<@${data.userId}> ${data.message}` : data.message;
                    user.send(msg).catch(() => {
                        clearTimeout(spamTimeout); spamTimeout = null;
                        if (spammerClient) spammerClient.destroy(); spammerClient = null;
                        socket.emit('spam-status-change', false);
                        socket.emit('status-update', { message: 'Spam durduruldu (hedef engellemiş olabilir).', type: 'error' });
                    });
                }
                spamTimeout = setTimeout(spamLoop, delay);
            };
            spamTimeout = setTimeout(spamLoop, 0);
        } catch (e) {
            socket.emit('status-update', { message: 'Spam için geçersiz Token: ' + e.message, type: 'error' });
        }
    });
});

// ---- SUNUCUYU BAŞLAT ----
loginPanelClient(config.panel_token);
const port = 3000;
server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde başarıyla başlatıldı.`);
});

