const { Client, WebhookClient } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let client = new Client({ checkUpdate: false });
let afkEnabled = true;

// DM Spammer için global değişkenler
let spamInterval = null;
let spammerClient = null;

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
            msg.channel.send(config.afkMessage);
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

    // --- GENEL ---
    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        socket.emit('status-update', { message: `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`, type: 'success' });
    });

    socket.on('switch-account', (token) => {
        io.emit('status-update', { message: 'Hesap değiştiriliyor...', type: 'info' });
        login(token);
    });

    // --- PROFİL & DURUM ---
    socket.on('change-avatar', async (url) => {
        try {
            if (!url || !url.startsWith('http')) {
                return socket.emit('status-update', { message: 'Lütfen geçerli bir resim URL\'si girin.', type: 'error' });
            }
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Avatar başarıyla değiştirildi.', type: 'success' });
            io.emit('bot-info', { // Arayüzdeki avatarı anında güncelle
                username: client.user.username,
                tag: client.user.tag,
                avatar: client.user.displayAvatarURL(),
            });
        } catch (error) {
            console.error('Avatar değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Avatar değiştirilemedi. URL\'yi kontrol edin veya bir süre bekleyin.', type: 'error' });
        }
    });

    socket.on('change-status', (data) => {
        try {
            const presenceData = { activities: [] };
            if (data.customStatus) {
                presenceData.activities.push({ type: 'CUSTOM', name: 'custom', state: data.customStatus });
            }
            if (data.activityName) {
                presenceData.activities.push({ name: data.activityName, type: data.activityType.toUpperCase() });
            }
            client.user.setPresence(presenceData);
            socket.emit('status-update', { message: 'Durum başarıyla güncellendi.', type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi.', type: 'error' });
        }
    });
    
    // --- DM GÖNDERİCİ ---
    socket.on('send-dm', async ({ userId, content }) => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(content);
            socket.emit('status-update', { message: `${user.tag} adlı kullanıcıya mesaj gönderildi.`, type: 'success' });
        } catch (error) {
            console.error('DM gönderme hatası:', error);
            socket.emit('status-update', { message: 'Mesaj gönderilemedi. Kullanıcı ID\'sini kontrol edin veya DM\'leri kapalı olabilir.', type: 'error' });
        }
    });

    // --- WEBHOOK ---
    socket.on('send-webhook', async (data) => {
        try {
            if(!data.url || !data.url.startsWith('https://discord.com/api/webhooks/')) {
                 return socket.emit('status-update', { message: 'Geçersiz Webhook URL\'si.', type: 'error' });
            }
            const webhook = new WebhookClient({ url: data.url });
            
            const messageOptions = {};
            if (data.content) messageOptions.content = data.content;
            
            if (data.embed && (data.embed.title || data.embed.description)) {
                 messageOptions.embeds = [{
                    title: data.embed.title,
                    description: data.embed.description,
                    color: data.embed.color,
                }];
            }
            
            if (!messageOptions.content && !messageOptions.embeds?.length) {
                return socket.emit('status-update', { message: 'Gönderilecek bir mesaj veya embed içeriği yok.', type: 'error' });
            }
            
            await webhook.send(messageOptions);
            socket.emit('status-update', { message: 'Webhook mesajı başarıyla gönderildi.', type: 'success' });
        } catch(error) {
            console.error("Webhook gönderme hatası:", error);
            socket.emit('status-update', { message: 'Webhook mesajı gönderilemedi.', type: 'error' });
        }
    });
    
    // --- SES KONTROLÜ ---
    socket.on('join-voice', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isVoice()) return socket.emit('status-update', { message: 'Geçerli bir ses kanalı ID\'si bulunamadı.', type: 'error' });
            
            joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            socket.emit('status-update', { message: `${channel.name} kanalına katılındı.`, type: 'success' });
        } catch (error) {
            console.error("Sese katılma hatası:", error);
            socket.emit('status-update', { message: 'Ses kanalına katılamadı.', type: 'error' });
        }
    });

    socket.on('leave-voice', () => {
        const connection = getVoiceConnection(client.guilds.cache.first()?.id); // Basit bir yöntem, çoklu sunucu için geliştirilebilir
        if (connection) {
            connection.destroy();
            socket.emit('status-update', { message: 'Ses kanalından ayrılındı.', type: 'success' });
        } else {
            socket.emit('status-update', { message: 'Zaten bir ses kanalında değilsiniz.', type: 'error' });
        }
    });

    socket.on('toggle-mute', async ({ status }) => {
        const guild = client.guilds.cache.find(g => g.voiceStates.cache.has(client.user.id));
        if (!guild) return socket.emit('status-update', { message: 'Önce bir ses kanalına katılmalısınız.', type: 'error' });
        const voiceState = guild.voiceStates.cache.get(client.user.id);
        await voiceState.setMute(status);
        socket.emit('status-update', { message: `Mikrofon ${status ? 'kapatıldı' : 'açıldı'}.`, type: 'success' });
    });
    
    socket.on('toggle-deafen', async ({ status }) => {
        const guild = client.guilds.cache.find(g => g.voiceStates.cache.has(client.user.id));
        if (!guild) return socket.emit('status-update', { message: 'Önce bir ses kanalına katılmalısınız.', type: 'error' });
        const voiceState = guild.voiceStates.cache.get(client.user.id);
        await voiceState.setDeaf(status);
        socket.emit('status-update', { message: `Kulaklık ${status ? 'kapatıldı' : 'açıldı'}.`, type: 'success' });
    });

    socket.on('toggle-camera', async ({ status }) => {
         const guild = client.guilds.cache.find(g => g.voiceStates.cache.has(client.user.id));
        if (!guild) return socket.emit('status-update', { message: 'Önce bir ses kanalına katılmalısınız.', type: 'error' });
        const voiceState = guild.voiceStates.cache.get(client.user.id);
        await voiceState.setVideo(status);
        socket.emit('status-update', { message: `Kamera ${status ? 'açıldı (dönüyor)' : 'kapatıldı'}.`, type: 'success' });
    });
    
    // --- TROLL ---
    socket.on('ghost-ping', async ({ channelId, userId }) => {
        try {
            const channel = await client.channels.fetch(channelId);
            const msg = await channel.send(`<@${userId}>`);
            await msg.delete();
            socket.emit('status-update', { message: 'Ghost ping başarıyla gönderildi.', type: 'success' });
        } catch (error) {
            console.error('Ghost ping hatası:', error);
            socket.emit('status-update', { message: 'Ghost ping gönderilemedi. Kanal/Kullanıcı ID\'sini veya izinleri kontrol edin.', type: 'error' });
        }
    });

    socket.on('start-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.startTyping();
            socket.emit('status-update', { message: `'Yazıyor...' durumu başlatıldı. Durdurmak için tekrar basın.`, type: 'info' });
        } catch (error) {
            socket.emit('status-update', { message: 'Kanal bulunamadı.', type: 'error' });
        }
    });

    socket.on('stop-typing', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            channel.stopTyping(true);
            socket.emit('status-update', { message: `'Yazıyor...' durumu durduruldu.`, type: 'info' });
        } catch (error) {
            socket.emit('status-update', { message: 'Kanal bulunamadı.', type: 'error' });
        }
    });
    
    // --- DM SPAMMER ---
    socket.on('toggle-spam', async (data) => {
        if (spamInterval) { // Spam çalışıyorsa durdur
            clearInterval(spamInterval);
            spamInterval = null;
            if (spammerClient) spammerClient.destroy();
            spammerClient = null;
            socket.emit('spam-status-change', false);
            return socket.emit('status-update', { message: 'Spam durduruldu.', type: 'info' });
        }
        
        // Spam'i başlat
        spammerClient = new Client({ checkUpdate: false });
        
        spammerClient.login(data.token).then(async () => {
            try {
                const user = await spammerClient.users.fetch(data.userId);
                socket.emit('status-update', { message: `Spam ${user.tag} adlı kullanıcıya başlatıldı.`, type: 'success' });
                socket.emit('spam-status-change', true);

                spamInterval = setInterval(() => {
                    user.send(data.message).catch(err => {
                        console.error("Spam mesajı gönderilemedi:", err);
                        clearInterval(spamInterval);
                        spamInterval = null;
                        socket.emit('spam-status-change', false);
                        socket.emit('status-update', { message: 'Spam durduruldu: Mesaj gönderilemedi.', type: 'error' });
                    });
                }, 2000); // Discord rate limit'e takılmamak için 2 saniyede bir gönder.
            } catch (e) {
                socket.emit('status-update', { message: 'Spam başlatılamadı: Kullanıcı bulunamadı.', type: 'error' });
            }
        }).catch(err => {
            socket.emit('status-update', { message: 'Spam başlatılamadı: Geçersiz Token.', type: 'error' });
        });
    });
    
    // Sunucu kopyalayıcı gibi diğer fonksiyonlar (değişiklik yok)
    socket.on('clone-server', async ({ sourceGuildId, targetGuildId }) => {
        try {
            const sourceGuild = client.guilds.cache.get(sourceGuildId);
            const targetGuild = client.guilds.cache.get(targetGuildId);

            if (!sourceGuild || !targetGuild) return socket.emit('status-update', { message: 'Kaynak veya hedef sunucu bulunamadı.', type: 'error' });
            if (targetGuild.ownerId !== client.user.id) return socket.emit('status-update', { message: 'Bu işlemi yapmak için hedef sunucunun sahibi olmalısınız!', type: 'error' });

            socket.emit('status-update', { message: 'Kopyalama başladı... Bu işlem sunucunun büyüklüğüne göre zaman alabilir.', type: 'info' });
            
            for (const c of targetGuild.channels.cache.values()) await c.delete().catch(() => {});
            for (const r of targetGuild.roles.cache.values()) if (r.id !== targetGuild.id) await r.delete().catch(() => {});
            
            await targetGuild.setName(`${sourceGuild.name} (Kopya)`).catch(()=>{});
            await targetGuild.setIcon(sourceGuild.iconURL({dynamic: true})).catch(()=>{});

            const createdRoles = new Map();
            for (const role of [...sourceGuild.roles.cache.values()].sort((a,b) => b.position - a.position)) {
                 if (role.id === sourceGuild.id) continue;
                 const newRole = await targetGuild.roles.create({ name: role.name, color: role.color, permissions: role.permissions, position: role.position });
                 createdRoles.set(role.id, newRole);
            }

            const categories = [...sourceGuild.channels.cache.filter(c => c.type === 'GUILD_CATEGORY').values()].sort((a,b) => a.position - b.position);
            for (const category of categories) {
                const channelPermissions = category.permissionOverwrites.cache.map(po => ({
                    id: createdRoles.get(po.id)?.id || targetGuild.id,
                    allow: po.allow.toArray(),
                    deny: po.deny.toArray()
                }));
                const newCategory = await targetGuild.channels.create(category.name, { type: 'GUILD_CATEGORY', permissionOverwrites: channelPermissions });
                const children = [...sourceGuild.channels.cache.filter(c => c.parentId === category.id).values()].sort((a,b) => a.position - b.position);
                for (const child of children) {
                    const childPermissions = child.permissionOverwrites.cache.map(po => ({
                         id: createdRoles.get(po.id)?.id || targetGuild.id,
                         allow: po.allow.toArray(),
                         deny: po.deny.toArray()
                    }));
                    await targetGuild.channels.create(child.name, { type: child.type, parent: newCategory, permissionOverwrites: childPermissions });
                }
            }

            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı!', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı.', type: 'error' });
        }
    });
});

login(config.token);

server.listen(3000, () => console.log('Sunucu 3000 portunda başlatıldı. http://localhost:3000'));
                                          
