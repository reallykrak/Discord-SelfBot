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
let typingIntervals = new Map(); // Kanal ID'lerini ve interval'ları saklamak için

function login(token) {
    if (client && client.readyAt) {
        client.destroy();
    }
    client = new Client({ checkUpdate: false });

    client.on('ready', () => {
        console.log(`${client.user.tag} olarak giriş yapıldı!`);
        console.log(`Web arayüzü http://localhost:3000 adresinde aktif.`);
        
        const friends = Array.from(client.users.cache.filter(u => u.isFriend()).values());
        
        io.emit('bot-info', {
            username: client.user.username,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
            id: client.user.id,
            createdAt: client.user.createdAt,
            serverCount: client.guilds.cache.size,
            friendCount: friends.length
        });
        io.emit('friend-list', friends.map(f => ({ id: f.id, tag: f.tag })));
    });

    client.login(token).catch(error => {
        console.error('Giriş yapılırken hata oluştu:', error.message);
        io.emit('status-update', { message: 'Geçersiz Token. Giriş yapılamadı.', type: 'error' });
    });
}

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');
    if (client.user) {
        const friends = Array.from(client.users.cache.filter(u => u.isFriend()).values());
        socket.emit('bot-info', {
            username: client.user.username,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
            id: client.user.id,
            createdAt: client.user.createdAt,
            serverCount: client.guilds.cache.size,
            friendCount: friends.length
        });
        socket.emit('friend-list', friends.map(f => ({ id: f.id, tag: f.tag })));
    }

    socket.on('switch-account', (newToken) => {
        console.log('Hesap değiştirme isteği alındı. Yeniden başlatılıyor...');
        socket.emit('status-update', { message: 'Hesap değiştiriliyor, arayüz yeniden başlatılacak...', type: 'info' });
        typingIntervals.forEach(clearInterval); // Tüm 'yazıyor' intervallerini temizle
        typingIntervals.clear();
        login(newToken);
    });

    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        socket.emit('status-update', { message: `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`, type: 'success' });
    });

    socket.on('change-status', (data) => {
        try {
            const activities = [];
            // Önce özel durumu (custom status) ekle
            if (data.customStatus) {
                activities.push({ type: 'CUSTOM', name: 'custom', state: data.customStatus });
            }
            // Sonra diğer aktiviteyi ekle
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
            
            const messageOptions = {
                username: data.username || client.user.username,
                avatarURL: data.avatarURL || client.user.displayAvatarURL()
            };
            if (data.content) messageOptions.content = data.content;
            
            if (data.embed && (data.embed.title || data.embed.description)) {
                 messageOptions.embeds = [{
                    title: data.embed.title,
                    description: data.embed.description,
                    color: data.embed.color,
                }];
            }
            
            if (!messageOptions.content && !messageOptions.embeds) {
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

            socket.emit('status-update', { message: 'Kopyalama başladı...', type: 'info' });
            
            // Temizleme işlemleri
            for (const c of targetGuild.channels.cache.values()) await c.delete().catch(() => {});
            for (const r of targetGuild.roles.cache.values()) if (r.id !== targetGuild.id) await r.delete().catch(() => {});
            
            await targetGuild.setName(`${sourceGuild.name} (Kopya)`).catch(()=>{});
            await targetGuild.setIcon(sourceGuild.iconURL({dynamic: true})).catch(()=>{});

            // Rolleri kopyala
            const createdRoles = new Map();
            for (const role of [...sourceGuild.roles.cache.values()].sort((a,b) => b.position - a.position)) {
                 if (role.id === sourceGuild.id) continue;
                 const newRole = await targetGuild.roles.create({ name: role.name, color: role.color, permissions: role.permissions, position: role.position });
                 createdRoles.set(role.id, newRole);
            }

            // Kanalları kopyala
            const categories = [...sourceGuild.channels.cache.filter(c => c.type === 'GUILD_CATEGORY').values()].sort((a,b) => a.position - b.position);
            for (const category of categories) {
                const newCategory = await targetGuild.channels.create(category.name, { type: 'GUILD_CATEGORY' });
                const children = [...sourceGuild.channels.cache.filter(c => c.parentId === category.id).values()].sort((a,b) => a.position - b.position);
                for (const child of children) {
                    await newCategory.createChannel(child.name, { type: child.type });
                }
            }

            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı!', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı.', type: 'error' });
        }
    });

    socket.on('send-dm', async ({ userId, content }) => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(content);
            socket.emit('status-update', { message: `${user.tag} adlı kullanıcıya mesaj gönderildi.`, type: 'success' });
        } catch (error) {
            console.error('DM gönderme hatası:', error);
            socket.emit('status-update', { message: 'Mesaj gönderilemedi.', type: 'error' });
        }
    });
    
    // Troll Özellikler
    socket.on('ghost-ping', async ({ channelId, userId }) => {
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.send(`<@${userId}>`);
            await message.delete();
            socket.emit('status-update', { message: 'Ghost ping başarıyla gönderildi.', type: 'success' });
        } catch {
            socket.emit('status-update', { message: 'Ghost ping gönderilemedi. Kanal ID\'sini kontrol edin.', type: 'error' });
        }
    });

    socket.on('start-typing', (channelId) => {
        if (typingIntervals.has(socket.id)) {
            clearInterval(typingIntervals.get(socket.id));
        }
        try {
            const channel = client.channels.cache.get(channelId);
            if (!channel) return socket.emit('status-update', { message: 'Kanal bulunamadı.', type: 'error' });
            
            channel.sendTyping();
            const interval = setInterval(() => {
                channel.sendTyping();
            }, 8000);
            typingIntervals.set(socket.id, interval);
            socket.emit('status-update', { message: `'Yazıyor...' durumu ${channel.name} kanalında başlatıldı.`, type: 'success' });
        } catch {
            socket.emit('status-update', { message: 'Yazma durumu başlatılamadı.', type: 'error' });
        }
    });

    socket.on('stop-typing', () => {
        if (typingIntervals.has(socket.id)) {
            clearInterval(typingIntervals.get(socket.id));
            typingIntervals.delete(socket.id);
            socket.emit('status-update', { message: `'Yazıyor...' durumu durduruldu.`, type: 'info' });
        }
    });

    socket.on('disconnect', () => {
        // Kullanıcı bağlantıyı kestiğinde 'yazıyor' interval'ını temizle
        if (typingIntervals.has(socket.id)) {
            clearInterval(typingIntervals.get(socket.id));
            typingIntervals.delete(socket.id);
        }
    });
});

// İlk başta config'deki token ile giriş yap
login(config.token);

server.listen(3000, () => console.log('Sunucu 3000 portunda başlatıldı. http://localhost:3000'));
                
