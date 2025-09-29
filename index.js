const { Client } = require('discord.js-selfbot-v13');
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

let spamInterval = null;
let spammerClient = null;
let audioPlayer = null;
let currentVoiceConnection = null;

const streamsDir = path.join(__dirname, 'streams');
if (!fs.existsSync(streamsDir)) {
    fs.mkdirSync(streamsDir);
}

function login(token) {
    if (client && client.readyAt) {
        client.destroy();
    }
    client = new Client({ checkUpdate: false });

    client.on('ready', () => {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        console.log(`Web arayüzü http://localhost:3000 adresinde aktif.`);
        io.emit('bot-info', {
            username: client.user.username,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
        });
        io.emit('status-update', { message: 'Başarıyla giriş yapıldı!', type: 'success' });
    });
    
    client.on('messageCreate', msg => {
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== client.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
        }
    });

    client.login(token).catch(error => {
        console.error('Giriş yapılırken hata oluştu:', error.message);
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
        });
    }

    const stopStreaming = (source = 'user') => {
        if (audioPlayer) {
            audioPlayer.stop(true);
            audioPlayer = null;
        }
        if (currentVoiceConnection) {
            currentVoiceConnection.destroy();
            currentVoiceConnection = null;
        }
        client.user.setActivity(null);
        if (source === 'user') {
            socket.emit('status-update', { message: 'Yayın durduruldu.', type: 'info' });
        }
        socket.emit('camera-status-change', false);
    };

    const startStreaming = async (channelId, fileName, isCamera) => {
        if (getVoiceConnection(client.guilds.cache.first()?.id)) {
            stopStreaming('internal');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) {
                socket.emit('status-update', { message: 'Geçerli bir ses kanalı ID\'si bulunamadı.', type: 'error' });
                return;
            }

            const filePath = path.join(streamsDir, fileName);
            if (!fs.existsSync(filePath)) {
                socket.emit('status-update', { message: `'${fileName}' dosyası 'streams' klasöründe bulunamadı.`, type: 'error' });
                return;
            }

            currentVoiceConnection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            await entersState(currentVoiceConnection, VoiceConnectionStatus.Ready, 20000);

            const voiceState = channel.guild.voiceStates.cache.get(client.user.id);
            if (isCamera && voiceState) {
                await voiceState.setVideo(true);
                await voiceState.setStreaming(true);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            audioPlayer = createAudioPlayer();
            const resource = createAudioResource(filePath);
            
            audioPlayer.play(resource);
            currentVoiceConnection.subscribe(audioPlayer);

            audioPlayer.on(AudioPlayerStatus.Idle, () => stopStreaming('auto'));
            audioPlayer.on('error', error => {
                console.error(`Audio Player Hatası: ${error.message}`);
                stopStreaming('error');
            });

            socket.emit('status-update', { message: `${channel.name} kanalında yayın başlatıldı.`, type: 'success' });
            if (isCamera) {
                socket.emit('camera-status-change', true);
            }

        } catch (error) {
            console.error("Yayın başlatma hatası:", error);
            socket.emit('status-update', { message: 'Yayın başlatılamadı. Kanal ID veya FFmpeg kurulumunu kontrol edin.', type: 'error' });
            if (isCamera) {
                socket.emit('camera-status-change', false);
            }
            stopStreaming('error');
        }
    };

    socket.on('start-stream', ({ channelId, fileName }) => startStreaming(channelId, fileName, false));
    socket.on('stop-stream', () => stopStreaming('user'));
    socket.on('toggle-camera', ({ channelId, status }) => {
        if (status) {
            startStreaming(channelId, 'camera.mp4', true);
        } else {
            stopStreaming('user');
        }
    });
    
    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        socket.emit('status-update', { message: `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`, type: 'success' });
    });

    socket.on('switch-account', (token) => {
        io.emit('status-update', { message: 'Hesap değiştiriliyor...', type: 'info' });
        login(token);
    });

    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Avatar başarıyla değiştirildi.', type: 'success' });
            io.emit('bot-info', { 
                username: client.user.username,
                tag: client.user.tag,
                avatar: client.user.displayAvatarURL(),
            });
        } catch (error) {
            socket.emit('status-update', { message: 'Avatar değiştirilemedi. URL\'yi kontrol edin.', type: 'error' });
        }
    });

    socket.on('change-status', (data) => {
        try {
            const activities = [];
            if (data.customStatus) activities.push({ type: 'CUSTOM', name: 'custom', state: data.customStatus });
            if (data.activityName) activities.push({ name: data.activityName, type: data.activityType.toUpperCase() });
            client.user.setPresence({ activities });
            socket.emit('status-update', { message: 'Durum başarıyla güncellendi.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Durum değiştirilemedi.', type: 'error' });
        }
    });
    
    socket.on('send-dm', async ({ userId, content }) => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(content);
            socket.emit('status-update', { message: `${user.tag} adlı kullanıcıya mesaj gönderildi.`, type: 'success' });
        } catch (error) {
            console.error('DM gönderme hatası:', error);
            socket.emit('status-update', { message: 'Mesaj gönderilemedi: Kullanıcı bulunamadı veya DM\'leri kapalı.', type: 'error' });
        }
    });

    socket.on('toggle-spam', async (data) => {
        if (spamInterval) {
            clearInterval(spamInterval);
            spamInterval = null;
            if (spammerClient) spammerClient.destroy();
            spammerClient = null;
            socket.emit('spam-status-change', false);
            return socket.emit('status-update', { message: 'Spam durduruldu.', type: 'info' });
        }
        
        spammerClient = new Client({ checkUpdate: false });
        
        spammerClient.login(data.token).then(async () => {
            try {
                const user = await spammerClient.users.fetch(data.userId);
                socket.emit('status-update', { message: `Spam ${user.tag} adlı kullanıcıya başlatıldı.`, type: 'success' });
                socket.emit('spam-status-change', true);

                const messageToSend = data.ping ? `<@${data.userId}> ${data.message}` : data.message;

                spamInterval = setInterval(() => {
                    user.send(messageToSend).catch(err => {
                        console.error("Spam mesajı gönderilemedi:", err);
                        clearInterval(spamInterval);
                        spamInterval = null;
                        socket.emit('spam-status-change', false);
                        socket.emit('status-update', { message: 'Spam durduruldu: Kullanıcı DM kapattı veya engelledi.', type: 'error' });
                    });
                }, 1500);
            } catch (e) {
                socket.emit('status-update', { message: 'Spam başlatılamadı: Kullanıcı bulunamadı.', type: 'error' });
                 if (spammerClient) spammerClient.destroy();
            }
        }).catch(err => {
            socket.emit('status-update', { message: 'Spam başlatılamadı: Geçersiz Token.', type: 'error' });
        });
    });

    socket.on('ghost-ping', async ({ channelId, userId }) => {
        try {
            const channel = await client.channels.fetch(channelId);
            const msg = await channel.send(`<@${userId}>`);
            await msg.delete();
            socket.emit('status-update', { message: 'Ghost ping başarıyla gönderildi.', type: 'success' });
        } catch (error) {
            socket.emit('status-update', { message: 'Ghost ping gönderilemedi. İzinleri kontrol edin.', type: 'error' });
        }
    });

    socket.on('start-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.startTyping();
            socket.emit('status-update', { message: `'Yazıyor...' durumu başlatıldı.`, type: 'info' });
        } catch (error) {
            socket.emit('status-update', { message: 'Kanal bulunamadı.', type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.stopTyping(true);
            socket.emit('status-update', { message: `'Yazıyor...' durumu durduruldu.`, type: 'info' });
        } catch (error) {}
    });
});

login(config.token);

server.listen(3000, () => console.log('Sunucu 3000 portunda başlatıldı. http://localhost:3000'));
                                                                       
