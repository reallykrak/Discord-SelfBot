const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, getVoiceConnection, VoiceConnectionStatus, entersState, AudioPlayerStatus } = require('@discordjs/voice');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const play = require('play-dl');

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

let videoList = [];
try {
  const videoData = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
  videoList = videoData.videoUrls;
  console.log(`${videoList.length} adet video 'videos.json' dosyasından yüklendi.`);
} catch (error) {
  console.error("'videos.json' okunurken hata oluştu, varsayılan video kullanılacak.", error);
  videoList = ["https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"];
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
        });
        io.emit('status-update', { message: 'Başarıyla giriş yapıldı!', type: 'success' });
    });
    
    client.on('messageCreate', msg => {
        if(afkEnabled && msg.channel.type === 'DM' && msg.author.id !== client.user.id) {
            msg.channel.send(config.afkMessage).catch(console.error);
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
        if (getVoiceConnection(channelId)) stopStreaming('internal');
        
        await new Promise(resolve => setTimeout(resolve, 500));

        currentStreamInfo = { type: isCamera ? 'camera' : 'stream', channelId: channelId };
        
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) throw new Error('Ses kanalı bulunamadı veya geçersiz.');

            let videoSourceUrl = isCamera ? config.cameraVideoUrl : videoList[Math.floor(Math.random() * videoList.length)];
            
            let stream = await play.stream(videoSourceUrl);

            currentVoiceConnection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
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
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            
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
            io.emit('status-update', { message: 'Yayın başlatılamadı: ' + error.message, type: 'error' });
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
    socket.on('switch-account', (token) => { login(token); });

    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Profil fotoğrafı güncellendi.', type: 'success' });
        } catch (e) {
            console.error("Avatar Değiştirme Hatası:", e.message);
            socket.emit('status-update', { message: 'Avatar değiştirilemedi: ' + e.message, type: 'error' });
        }
    });

    socket.on('change-status', async (data) => {
        try {
            await client.user.setPresence({ activities: [{ name: data.activityName, type: data.activityType.toUpperCase(), state: data.customStatus }] });
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
            await channel.startTyping();
        } catch (e) {
            console.error("'Yazıyor...' Başlatma Hatası:", e.message);
            socket.emit('status-update', { message: "'Yazıyor...' durumu başlatılamadı.", type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.stopTyping(true);
        } catch (e) {
            console.error("'Yazıyor...' Durdurma Hatası:", e.message);
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
server.listen(3000, () => console.log('Sunucu http://localhost:3000 portunda başlatıldı.'));
              
