const { Client, WebhookClient } = require('discord.js-selfbot-v13');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const client = new Client({ checkUpdate: false });
let afkEnabled = true;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');
    if (client.user) {
        socket.emit('bot-status', { username: client.user.tag, avatar: client.user.displayAvatarURL() });
    }

    // AFK Modu
    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        socket.emit('status-update', { message: `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`, type: 'success' });
    });

    // Geliştirilmiş Durum Değiştirici
    socket.on('change-status', (data) => {
        try {
            const activities = [];
            if (data.activityName) {
                activities.push({ name: data.activityName, type: data.activityType.toUpperCase() });
            }
            if (data.customStatus) {
                activities.push({ type: 'CUSTOM', name: data.customStatus, state: data.customStatus });
            }
            client.user.setPresence({ activities });
            socket.emit('status-update', { message: 'Durum başarıyla güncellendi.', type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi.', type: 'error' });
        }
    });

    // Profil Düzenleyici (Avatar)
    socket.on('change-avatar', async (url) => {
        try {
            await client.user.setAvatar(url);
            socket.emit('status-update', { message: 'Profil fotoğrafı başarıyla değiştirildi.', type: 'success' });
             // Arayüzdeki avatarı da güncelle
            socket.emit('bot-status', { username: client.user.tag, avatar: client.user.displayAvatarURL() });
        } catch (error) {
            console.error('Avatar değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Avatar değiştirilemedi. URL\'yi kontrol edin.', type: 'error' });
        }
    });
    
    // Webhook Gönderici
    socket.on('send-webhook', async (data) => {
        try {
            if(!data.url.startsWith('https://discord.com/api/webhooks/')) {
                 return socket.emit('status-update', { message: 'Geçersiz Webhook URL\'si.', type: 'error' });
            }
            const webhook = new WebhookClient({ url: data.url });
            
            const messageOptions = {};
            if (data.content) messageOptions.content = data.content;
            
            const embed = data.embed;
            if (embed && (embed.title || embed.description)) {
                 const fields = embed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline || false })).filter(f => f.name && f.value);
                 messageOptions.embeds = [{
                    title: embed.title,
                    description: embed.description,
                    color: embed.color,
                    fields: fields,
                    footer: embed.footer ? { text: embed.footer } : null,
                }];
            }
            
            if (!messageOptions.content && !messageOptions.embeds) {
                return socket.emit('status-update', { message: 'Gönderilecek bir mesaj veya embed içeriği yok.', type: 'error' });
            }
            
            await webhook.send(messageOptions);
            socket.emit('status-update', { message: 'Webhook mesajı başarıyla gönderildi.', type: 'success' });
            
        } catch(error) {
            console.error("Webhook gönderme hatası:", error);
            socket.emit('status-update', { message: 'Webhook mesajı gönderilemedi. URL\'yi veya içeriği kontrol edin.', type: 'error' });
        }
    });

    // Hata Düzeltmeli Sunucu Kopyalayıcı
    socket.on('clone-server', async ({ sourceGuildId, targetGuildId }) => {
        try {
            const sourceGuild = client.guilds.cache.get(sourceGuildId);
            const targetGuild = client.guilds.cache.get(targetGuildId);

            if (!sourceGuild || !targetGuild) return socket.emit('status-update', { message: 'Kaynak veya hedef sunucu bulunamadı.', type: 'error' });
            if (targetGuild.ownerId !== client.user.id) return socket.emit('status-update', { message: 'Bu işlemi yapmak için hedef sunucunun sahibi olmalısınız!', type: 'error' });

            socket.emit('status-update', { message: 'Kopyalama başladı: Hedef sunucu temizleniyor...', type: 'info' });
            for (const c of targetGuild.channels.cache.values()) await c.delete().catch(() => {});
            for (const r of targetGuild.roles.cache.values()) if (r.id !== targetGuild.id) await r.delete().catch(() => {});
            for (const e of targetGuild.emojis.cache.values()) await e.delete().catch(() => {});
            
            await targetGuild.setName(`${sourceGuild.name} (Kopya)`).catch(()=>{});
            await targetGuild.setIcon(sourceGuild.iconURL({dynamic: true})).catch(()=>{});

            socket.emit('status-update', { message: 'Emojiler kopyalanıyor...', type: 'info' });
            for (const emoji of sourceGuild.emojis.cache.values()) {
                await targetGuild.emojis.create(emoji.url, emoji.name).catch(() => {});
            }

            socket.emit('status-update', { message: 'Roller kopyalanıyor...', type: 'info' });
            const createdRoles = new Map();
            for (const role of [...sourceGuild.roles.cache.values()].sort((a,b) => b.position - a.position)) {
                 if (role.id === sourceGuild.id) continue;
                 const newRole = await targetGuild.roles.create({ name: role.name, color: role.color, permissions: role.permissions, hoist: role.hoist, mentionable: role.mentionable, position: role.position });
                 createdRoles.set(role.id, newRole);
            }

            socket.emit('status-update', { message: 'Kanallar kopyalanıyor...', type: 'info' });
            const categories = [...sourceGuild.channels.cache.filter(c => c.type === 'GUILD_CATEGORY').values()].sort((a,b) => a.position - b.position);
            for (const category of categories) {
                const newCategory = await targetGuild.channels.create(category.name, { type: 'GUILD_CATEGORY' });
                const children = [...sourceGuild.channels.cache.filter(c => c.parentId === category.id).values()].sort((a,b) => a.position - b.position);
                for (const child of children) {
                    const permissionOverwrites = [];
                    for (const p of child.permissionOverwrites.cache.values()) {
                        let newId = p.id;
                        if (p.type === 'role') {
                            if (p.id === sourceGuild.id) newId = targetGuild.id;
                            else {
                                const newRole = createdRoles.get(p.id);
                                if (newRole) newId = newRole.id;
                            }
                        }
                        permissionOverwrites.push({ id: newId, type: p.type, allow: p.allow, deny: p.deny });
                    }
                    await newCategory.createChannel(child.name, { type: child.type, topic: child.topic, permissionOverwrites });
                }
            }

            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı!', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı. Konsolu kontrol edin.', type: 'error' });
        }
    });

    // Hata Düzeltmeli DM Temizleyici
    socket.on('clean-dm', async (userId) => {
        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if(!user) return socket.emit('status-update', { message: 'Hata: Kullanıcı bulunamadı. Lütfen geçerli bir ID girin.', type: 'error' });
            
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === client.user.id);
            
            let deletedCount = 0;
            for (const message of userMessages.values()) {
                await message.delete();
                deletedCount++;
            }
            socket.emit('status-update', { message: `${user.tag} ile olan DM'deki ${deletedCount} mesajınız silindi.`, type: 'success' });
        } catch (error) {
            console.error('DM temizleme hatası:', error);
            socket.emit('status-update', { message: 'DM mesajları silinemedi.', type: 'error' });
        }
    });
});

client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    console.log(`Web arayüzü http://localhost:3000 adresinde aktif.`);
    io.emit('bot-status', { username: client.user.tag, avatar: client.user.displayAvatarURL() });
});

client.login(config.token).catch(error => {
    console.error('Giriş yapılırken hata oluştu:', error.message);
});
server.listen(3000, () => console.log('Sunucu 3000 portunda başlatıldı.'));

    
