require('./polyfill.js');
const { Client, MessageEmbed } = require("discord.js-selfbot-v13");
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

const executeRaid = require('./commands/raid.js');
const cloneServer = require('./commands/server-cloner.js');
const { startSpam, stopSpam } = require('./commands/dm-spammer.js');
const cleanDmMessages = require('./commands/dm-cleaner.js');
const { stopRichPresence, setListeningRpc, setWatchingRpc } = require('./commands/rpc-manager.js');
const { commands, createHelpEmbed } = require('./commands/help.js'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

let botProcess = null;
const botWorkingDirectory = path.join(__dirname, 'bot');

[botWorkingDirectory, path.join(__dirname, 'music'), path.join(__dirname, 'commands')].forEach(dir => {
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
    const streamOptions = { fps: fps, ffmpeg_args: ffmpegArgs };
    const streamClient = new DiscordStreamClient(client, streamOptions);
    streamClient.setResolution(resolution);
    streamClient.setVideoCodec('H264');
    console.log(`[Streamer] Performans ayarları uygulandı: ${resolution}@${fps}fps, V-Bitrate: ${videoBitrate}, A-Bitrate: ${audioBitrate}`);
    const isCameraOnly = type === 'camera';
    let player;
    client.on('ready', async () => {
        const botState = streamingClients.get(botConfig.token);
        if (botState) {
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
        console.error(`[Streamer] ${botConfig.token.substring(0, 5)}... tokeni ile giriş yapılamadı:`, err.message);
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

let panelClient = new Client({ checkUpdate: false });
let afkEnabled = true;
let voiceConnection = null;
let audioPlayer = null;
let musicPlaylist = [];
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
        audioPlayer = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
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
        if (afkEnabled && msg.channel.type === 'DM' && msg.author.id !== panelClient.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }
        if (msg.author.id !== panelClient.user.id) return;
        const prefix = ".";
        if (!msg.content.startsWith(prefix)) return;
        const args = msg.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();
        
        // ===============================================================================================
        // ANA KOMUT İŞLEYİCİ - TÜM KOMUTLARIN MANTIĞI BURADA YER ALIR
        // ===============================================================================================
        
        if (command === "help") {
            const page = parseInt(args[0]) || 1;
            const helpEmbed = createHelpEmbed(panelClient, page);
            
            try {
                // HATA ÇÖZÜMÜ: Mesaj içeriği olarak boş bir karakter gönderiyoruz.
                if (typeof helpEmbed === 'string') {
                    await msg.edit(helpEmbed);
                } else {
                    await msg.edit({ content: ' ', embeds: [helpEmbed] });
                }
            } catch (err) {
                console.error("Help komutu hatası:", err);
                await msg.channel.send("Yardım menüsü gönderilirken bir hata oluştu.").catch();
            }
        }

        if (command === "ping") {
            const m = await msg.channel.send("Ölçülüyor...");
            m.edit(`Pong! Gecikme: **${m.createdTimestamp - msg.createdTimestamp}ms** | API Gecikmesi: **${panelClient.ws.ping}ms**`).catch();
        }
        
        if (command === "dmall") {
            if (!msg.guild) return msg.edit("Bu komut sadece sunucularda kullanılabilir.").catch();
            const text = args.join(" ");
            if (!text) return msg.edit("Gönderilecek mesajı yazmalısın.").catch();
            msg.delete().catch();
            let successCount = 0;
            let failCount = 0;
            const members = await msg.guild.members.fetch();
            await msg.channel.send(`DM gönderme işlemi başladı. Toplam ${members.size} üye...`);
            for (const member of members.values()) {
                if (member.id !== panelClient.user.id && !member.user.bot) {
                    await member.send(text).then(() => successCount++).catch(() => failCount++);
                    await new Promise(res => setTimeout(res, 500)); // Rate limit yememek için bekleme
                }
            }
            await msg.channel.send(`✅ DM gönderme tamamlandı! Başarılı: **${successCount}**, Başarısız: **${failCount}**`);
        }

        if (command === "twdlisten") {
            const imageKey = args[0];
            if (!imageKey) return msg.edit('**Hata:** Lütfen bir resim anahtarı belirtin.\n**Örnek:** `.twdlisten twd_resim`').catch();
            setListeningRpc(panelClient, { largeImageKey: imageKey });
            msg.edit(`✅ **Sadece Dinliyor** tipli "The Walking Dead" RPC ayarlandı!`).catch();
        }
        
        if (command === "twdwatch") {
            const imageKey = args[0];
            if (!imageKey) return msg.edit('**Hata:** Lütfen bir resim anahtarı belirtin.\n**Örnek:** `.twdwatch twd_resim`').catch();
            setWatchingRpc(panelClient, { largeImageKey: imageKey });
            msg.edit(`✅ **Zamanlayıcılı "İzliyor"** tipli "The Walking Dead" RPC ayarlandı!`).catch();
        }

        if (command === "stoprpc") {
            stopRichPresence(panelClient);
            msg.edit("✅ RPC başarıyla temizlendi.").catch();
        }
        
        // ===============================================================================================
        // YENİ EKLENEN KOMUTLAR - ARTIK BUNLAR ÇALIŞIYOR
        // ===============================================================================================

        if (command === "yazıtura") {
            const result = Math.random() < 0.5 ? 'Yazı' : 'Tura';
            msg.edit(`🎲 Sonuç: **${result}**`).catch();
        }

        if (command === "tersyaz") {
            const text = args.join(' ');
            if (!text) return msg.edit('Lütfen tersten yazılacak bir metin girin.').catch();
            const reversedText = text.split('').reverse().join('');
            msg.edit(reversedText).catch();
        }

        if (command === "avatar") {
            const user = msg.mentions.users.first() || await panelClient.users.fetch(args[0]).catch(() => msg.author);
            const avatarEmbed = new MessageEmbed()
                .setColor("#8A2BE2")
                .setTitle(`${user.username} adlı kullanıcının avatarı`)
                .setImage(user.displayAvatarURL({ dynamic: true, size: 4096 }))
                .setFooter({ text: `${msg.author.username} tarafından istendi.`});
            
            await msg.delete().catch();
             // HATA ÇÖZÜMÜ: `content` eklenerek "boş mesaj" hatası giderildi.
            await msg.channel.send({ content: ' ', embeds: [avatarEmbed] }).catch(console.error);
        }
        
        if (command === "hesapla") {
            const expression = args.join(' ');
            if (!expression) return msg.edit('Lütfen bir işlem girin. Örn: `.hesapla 5 * 5`').catch();
            try {
                const result = eval(expression.replace(/[^-()\d/*+.]/g, ''));
                msg.edit(`🧮 Sonuç: \`${expression} = ${result}\``).catch();
            } catch (error) {
                msg.edit('Geçersiz matematiksel işlem.').catch();
            }
        }

        if (command === "sunucubilgi") {
            if (!msg.guild) return msg.edit('Bu komut sadece sunucularda çalışır.').catch();
            const guild = msg.guild;
            const embed = new MessageEmbed()
                .setColor("#8A2BE2")
                .setTitle(`${guild.name} Sunucu Bilgileri`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '👑 Sahip', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '🆔 Sunucu ID', value: guild.id, inline: true },
                    { name: '📆 Oluşturulma', value: `<t:${parseInt(guild.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '👥 Üyeler', value: `${guild.memberCount}`, inline: true },
                    { name: '💬 Kanallar', value: `${guild.channels.cache.size}`, inline: true },
                    { name: '✨ Roller', value: `${guild.roles.cache.size}`, inline: true }
                )
                .setTimestamp();
            await msg.edit({ content: ' ', embeds: [embed] }).catch();
        }

        if (command === "kullanıcıbilgi") {
            const user = msg.mentions.users.first() || await panelClient.users.fetch(args[0]).catch(() => msg.author);
            const member = msg.guild ? await msg.guild.members.fetch(user.id).catch(() => null) : null;
            
            const embed = new MessageEmbed()
                .setColor("#8A2BE2")
                .setTitle(`${user.username} Kullanıcı Bilgileri`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Tag', value: user.tag, inline: true },
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '🤖 Bot mu?', value: user.bot ? 'Evet' : 'Hayır', inline: true },
                    { name: '📆 Hesap Oluşturma', value: `<t:${parseInt(user.createdTimestamp / 1000)}:R>`, inline: true },
                );
            if(member) {
                 embed.addFields(
                    { name: '☀️ Sunucuya Katılma', value: `<t:${parseInt(member.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: '🎨 En Yüksek Rol', value: `${member.roles.highest}`, inline: true },
                );
            }
            await msg.edit({ content: ' ', embeds: [embed] }).catch();
        }
        
        if (command === "say") {
            const text = args.join(' ');
            if (!text) return;
            await msg.edit(text).catch();
        }
        
        if (command === "embed") {
            const parts = args.join(' ').split('|');
            const title = parts[0]?.trim();
            const description = parts[1]?.trim();
            if (!title || !description) return msg.edit('Kullanım: `.embed Başlık | Mesaj`').catch();
            
            const embed = new MessageEmbed()
                .setColor("#8A2BE2")
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();
            await msg.edit({ content: ' ', embeds: [embed] }).catch();
        }

        if (command === "zar") {
            const result = Math.floor(Math.random() * 6) + 1;
            msg.edit(`🎲 Atılan zar: **${result}**`).catch();
        }
        
        if (command === "alkış") {
            const text = args.join(' ');
            if (!text) return msg.edit('Lütfen bir metin girin.').catch();
            msg.edit(`👏 ${text.split(' ').join(' 👏 ')} 👏`).catch();
        }

        if (command === "espri") {
            const jokes = ["Adamın biri varmış, ikinci dönem düzeltmiş.", "Geçen gün bir taksi çevirdim, hala dönüyor.", "Ben ekmek yedim, ananas yedi.", "Espri yaptım, en sonda.", "Sana bir espri yapayım mı? Kalsın."];
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            msg.edit(`😂 ${joke}`).catch();
        }
        
        if (command === "sevgiölçer") {
            const user = msg.mentions.users.first();
            if(!user) return msg.edit('Lütfen bir kullanıcı etiketleyin.').catch();
            const love = Math.floor(Math.random() * 101);
            msg.edit(`❤️ ${user} ile aranızdaki sevgi oranı: **%${love}**`).catch();
        }
        
        if (command === "temizle") {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100) return msg.edit("Lütfen 1 ile 100 arasında bir sayı girin.").catch();
            const messages = await msg.channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === panelClient.user.id).first(amount);
            if (userMessages.length > 0) {
                 await msg.channel.bulkDelete(userMessages, true).catch(console.error);
                 const confirmation = await msg.channel.send(`✅ ${userMessages.length} adet mesajım silindi.`);
                 setTimeout(() => confirmation.delete().catch(), 3000);
            } else {
                 msg.edit("Silinecek mesaj bulunamadı.").catch();
            }
        }
    });
    panelClient.login(token).catch(error => {
        console.error('[Web Panel] Giriş hatası:', error.message);
        io.emit('status-update', { message: 'Geçersiz Panel Token. Giriş yapılamadı.', type: 'error' });
    });
}

io.on('connection', (socket) => {
    console.log('[Web Panel] Bir kullanıcı bağlandı.');
    panelClient.socket = socket; 
    if (panelClient.user) {
        socket.emit('bot-info', { tag: panelClient.user.tag, avatar: panelClient.user.displayAvatarURL(), id: panelClient.user.id });
    }
    socket.emit('bot:status', { isRunning: !!botProcess });

    socket.on('get-commands', () => {
        socket.emit('command-list', commands);
    });

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
                    if (audioPlayer) audioPlayer.stop();
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
            const activityTypeMap = {
                PLAYING: 0, STREAMING: 1, LISTENING: 2, WATCHING: 3, COMPETING: 5,
            };
            const selectedType = activityTypeMap[data.activity.type] ?? 0;
            const presenceData = { status: data.status, activities: [], };
            if (data.activity.name) {
                const activity = {
                    name: data.activity.name,
                    type: selectedType,
                };
                if (selectedType === 1 && data.activity.url) {
                    activity.url = data.activity.url;
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

    // HATA ÇÖZÜMÜ: Troll grup oluşturma mantığı yeniden yazıldı.
    socket.on('start-troll-group', async (data) => {
        if (trollGroupChannel) {
            return socket.emit('status-update', { message: 'Zaten aktif bir troll grup var.', type: 'warning' });
        }
        try {
            const { userIds } = data;
            const validUserIds = userIds.filter(id => id && /^\d{17,19}$/.test(id.trim()));
            if (validUserIds.length < 2) {
                return socket.emit('status-update', { message: 'En az 2 geçerli kullanıcı IDsi girmelisiniz.', type: 'error' });
            }
            
            // Kullanıcıların hepsinin erişilebilir olup olmadığını kontrol et
            for (const userId of validUserIds) {
                try {
                    await panelClient.users.fetch(userId);
                } catch (e) {
                     return socket.emit('status-update', { message: `Grup oluşturulamadı: ${userId} ID'li kullanıcı bulunamadı. (Bu hesapla ortak sunucunuz olmayabilir veya arkadaş olmayabilirsiniz)`, type: 'error' });
                }
            }

            socket.emit('status-update', { message: 'Grup oluşturuluyor...', type: 'info' });
            
            const firstUser = await panelClient.users.fetch(validUserIds[0]);
            const dmChannel = await firstUser.createDM();
            
            for (let i = 1; i < validUserIds.length; i++) {
                try {
                    await dmChannel.addMember(validUserIds[i]);
                    socket.emit('status-update', { message: `${validUserIds[i]} ID'li kullanıcı gruba eklendi.`, type: 'info' });
                    await new Promise(res => setTimeout(res, 500)); // Rate limit için bekle
                } catch (e) {
                    socket.emit('status-update', { message: `${validUserIds[i]} ID'li kullanıcı eklenemedi: ${e.message}`, type: 'warning' });
                }
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

    socket.on('toggle-spam', (data) => {
        const isSpamming = data.isSpamming;
        if (isSpamming) {
            stopSpam(socket);
        } else {
            startSpam(data, socket);
        }
    });

    socket.on('clean-dm', ({ userId }) => {
        cleanDmMessages(panelClient, userId, socket);
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

loginPanelClient(config.panel_token);
const port = 3000;
server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde başarıyla başlatıldı.`);
});
