const { Client, WebhookClient } = require('discord.js-selfbot-v13');
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
            avatar: client.user.displayAvatarURL(),
        });
    });

    client.login(token).catch(error => {
        console.error('Giriş yapılırken hata oluştu:', error.message);
        io.emit('status-update', { message: 'Geçersiz Token. Giriş yapılamadı.', type: 'error' });
    });
}

// 'public' klasöründen statik dosyaları sunmak için güncellendi
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');
    if (client.user) {
        socket.emit('bot-info', {
            username: client.user.username,
            avatar: client.user.displayAvatarURL(),
        });
    }

    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        socket.emit('status-update', { message: `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`, type: 'success' });
    });

    socket.on('change-avatar', async (url) => {
        try {
            if (!url || !url.startsWith('http')) {
                return socket.emit('status-update', { message: 'Lütfen geçerli bir resim URL\'si girin.', type: 'error' });
            }
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Avatar başarıyla değiştirildi.', type: 'success' });
            // Arayüzdeki avatarı anında güncelle
            socket.emit('bot-info', {
                username: client.user.username,
                avatar: client.user.displayAvatarURL(),
            });
        } catch (error) {
            console.error('Avatar değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Avatar değiştirilemedi. URL\'yi kontrol edin.', type: 'error' });
        }
    });

    socket.on('change-status', (data) => {
        try {
            const activities = [];
            if (data.customStatus) {
                activities.push({ type: 'CUSTOM', name: 'custom', state: data.customStatus });
            }
            if (data.activityName) {
                activities.push({ name: data.activityName, type: data.activityType.toUpperCase() });
            }
            
            client.user.setPresence({ activities });
            socket.emit('status-update', { message: 'Durum başarıyla güncellendi.', type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi.', type: 'error' });
        }
    });

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
                    await newCategory.createChannel(child.name, { type: child.type, permissionOverwrites: childPermissions });
                }
            }

            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı!', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı.', type: 'error' });
        }
    });

    socket.on('clean-dm', async (userId) => {
        try {
            const user = await client.users.fetch(userId);
            if (!user) return socket.emit('status-update', { message: 'Kullanıcı bulunamadı.', type: 'error' });
    
            const dmChannel = await user.createDM();
            socket.emit('status-update', { message: `${user.tag} ile olan mesajlarınız siliniyor...`, type: 'info' });
    
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === client.user.id);
            let deletedCount = 0;
    
            for (const message of userMessages.values()) {
                await message.delete();
                deletedCount++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit için bekle
            }
    
            socket.emit('status-update', { message: `Son 100 mesaj içinden size ait ${deletedCount} mesaj silindi.`, type: 'success' });
    
        } catch (error) {
            console.error('DM temizleme hatası:', error);
            socket.emit('status-update', { message: 'Mesajlar temizlenemedi.', type: 'error' });
        }
    });
});

login(config.token);

server.listen(3000, () => console.log('Sunucu 3000 portunda başlatıldı. http://localhost:3000'));
            
