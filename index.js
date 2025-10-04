// ===== Termux Voice/Stream Fix =====
try {
    const OpusScript = require("opusscript"); // Opus (ses codec) modülü
    const nacl = require("tweetnacl");        // Şifreleme modülü
    global.OpusScript = OpusScript;
    global.nacl = nacl;

    // prism-media Encoder’ı opusscript ile zorla oluştur
    const { Encoder } = require('prism-media');
    global.audioEncoder = new Encoder(48000, 2, { opus: OpusScript });

    console.log("[AudioFix] opusscript ve tweetnacl başarıyla yüklendi.");
} catch (err) {
    console.warn("[AudioFix] Ses modülleri yüklenemedi:", err.message);
}
// ===================================

require('./polyfill.js');
const { Client, ActivityType } = require("discord.js-selfbot-v13");
const { DiscordStreamClient } = require("discord-stream-client");
const { readFileSync } = require("fs");
const play = require("play-dl");
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const config = require('./config.js');

// ---- EXPRESS & SOCKET.IO KURULUMU ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const publicPath = path.join(__dirname, 'public');
app.use('/public', express.static(publicPath)); // Stil ve script dosyaları için
app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// ---- STREAMER BÖLÜMÜ ----
let videoList = [];
try {
    videoList = JSON.parse(readFileSync('./videos.json', 'utf8')).videoUrls;
    console.log(`[Streamer] ${videoList.length} video yüklendi.`);
} catch (error) {
    console.error('[Streamer] videos.json okunurken hata:', error);
    videoList = ["https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"];
}

const streamingClients = new Map(); // Aktif stream yapan botları tutar

function getRandomVideo() {
    return videoList[Math.floor(Math.random() * videoList.length)];
}

async function startStreamer(botConfig, type = 'stream') {
    if (streamingClients.has(botConfig.token)) {
        console.log(`[Streamer] ${botConfig.token.substring(0, 5)}... tokenli bot zaten aktif.`);
        return;
    }

    const client = new Client({ checkUpdate: false });
    const streamClient = new DiscordStreamClient(client);
    streamClient.setResolution('720p');
    streamClient.setVideoCodec('H264');
    
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
            if (!voiceChannel || !voiceChannel.isVoice()) throw new Error('Ses kanalı bulunamadı.');

            const connection = await streamClient.joinVoiceChannel(voiceChannel, { selfDeaf: false, selfMute: false, selfVideo: isCameraOnly });
            botState.statusText = isCameraOnly ? `Kamera açık: ${voiceChannel.name}` : `Yayın yapıyor: ${voiceChannel.name}`;
            updateStreamerStatus();

            if (isCameraOnly) return; 

            const restartStream = async () => {
                try {
                    let videoSource = getRandomVideo();
                    let streamUrl = videoSource;
            
                    if (play.yt_validate(videoSource) === 'video') {
                        console.log(`[Streamer] YouTube linki algılandı: ${videoSource}. Stream URL alınıyor...`);
                        const stream = await play.stream(videoSource, { discordPlayerCompatibility: true });
                        streamUrl = stream.url;
                        console.log(`[Streamer] Stream URL başarıyla alındı.`);
                    }
            
                    const streamConnection = await connection.createStream();
                    player = streamClient.createPlayer(streamUrl, streamConnection.udp);
                    botState.player = player;
    
                    player.on('finish', () => {
                        console.log(`[Streamer] ${client.user.tag} için yayın bitti, yenisi başlatılıyor...`);
                        setTimeout(restartStream, 2000);
                    });
                    player.on('error', (err) => {
                        console.error(`[Streamer] ${client.user.tag} için oynatıcı hatası:`, err.message);
                        stopStreamer(botConfig.token); // Hata durumunda botu tamamen durdur
                    });
    
                    player.play();
                } catch (e) {
                     console.error(`[Streamer] ${client.user.tag} için yayın döngüsü hatası:`, e.message);
                     stopStreamer(botConfig.token);
                }
            };
            await restartStream();

        } catch (error) {
            console.error(`[Streamer] ${client.user.tag} için yayın başlatma hatası:`, error.message);
            stopStreamer(botConfig.token);
        }
    });

    client.login(botConfig.token).catch(err => {
        console.error(`[Streamer] ${botConfig.token.substring(0, 5)}... token ile giriş yapılamadı:`, err.message);
        streamingClients.delete(botConfig.token);
        updateStreamerStatus();
    });

    streamingClients.set(botConfig.token, { client, status: 'online', statusText: 'Giriş yapılıyor...' });
    updateStreamerStatus();
}

async function stopStreamer(token) {
    const bot = streamingClients.get(token);
    if (bot) {
        console.log(`[Streamer] ${bot.tag || token.substring(0, 5)}... botu durduruluyor.`);
        if (bot.player) bot.player.stop();
        if (bot.client) bot.client.destroy();
        streamingClients.delete(token);
        updateStreamerStatus();
        io.emit('status-update', { message: `${bot.tag || 'Bot'} durduruldu.`, type: 'info' });
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
    
    panelClient.on('messageCreate', async msg => {
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== panelClient.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
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
        socket.emit('bot-info', {
            tag: panelClient.user.tag,
            avatar: panelClient.user.displayAvatarURL(),
            id: panelClient.user.id,
        });
    }

    // --- Streamer Eventleri ---
    socket.on('get-streamer-bots', () => updateStreamerStatus());
    socket.on('start-streamer', ({ token, type }) => {
        const botConfig = config.streamer_configs.find(c => c.token === token);
        if (botConfig) {
            startStreamer(botConfig, type);
            socket.emit('status-update', { message: 'Yayın botu başlatılıyor...', type: 'info' });
        }
    });
    socket.on('stop-streamer', ({ token }) => stopStreamer(token));

    // --- Web Panel Eventleri ---
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
                activity.type = data.activity.type;
                activity.name = data.activity.name;
                if (data.activity.type === 'STREAMING' && data.activity.url) {
                    activity.url = data.activity.url;
                }
            }
            panelClient.user.setPresence({
                status: data.status,
                activities: activity.name ? [activity] : [],
            });
            socket.emit('status-update', { message: 'Durum değiştirildi.', type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi: ' + error.message, type: 'error' });
        }
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
            if (!user) throw new Error('Kullanıcı bulunamadı. Ortak sunucunuz olmayabilir.');
            
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === panelClient.user.id);
            
            if (userMessages.size === 0) return socket.emit('status-update', { message: 'Silinecek mesajınız bulunamadı.', type: 'info' });

            for (const message of userMessages.values()) {
                await message.delete();
                await new Promise(resolve => setTimeout(resolve, 350));
            }
            socket.emit('status-update', { message: `${userMessages.size} mesaj silindi.`, type: 'success' });
        } catch (error) {
            let errorMessage = 'DM temizlenemedi: ' + error.message;
            if (error.httpStatus === 403) errorMessage = 'DM kanalı açılamadı. Engellenmiş olabilirsiniz.';
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

// ---- SUNUCUYU BAŞLAT ----
loginPanelClient(config.panel_token);
const port = 3000;
server.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde başarıyla başlatıldı.`);
    console.log('Web arayüzüne erişmek için tarayıcınızı açın.');
});
            


