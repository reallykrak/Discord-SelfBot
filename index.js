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

// Web Arayüzü Sunucusu
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Socket.IO Bağlantı Mantığı
io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');
    socket.emit('bot-status', { username: client.user.tag, avatar: client.user.displayAvatarURL() });

    // AFK Modu
    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        const message = `AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`;
        console.log(message);
        socket.emit('status-update', { message, type: 'success' });
    });

    // Durum Değiştirici
    socket.on('change-status', (data) => {
        try {
            client.user.setActivity(data.name, { type: data.type.toUpperCase() });
            const message = `Durum güncellendi: ${data.type} ${data.name}`;
            console.log(message);
            socket.emit('status-update', { message, type: 'success' });
        } catch (error) {
            console.error('Durum değiştirme hatası:', error);
            socket.emit('status-update', { message: 'Durum değiştirilemedi.', type: 'error' });
        }
    });

    // Embed Mesaj Gönderici
    socket.on('send-embed', async (data) => {
        try {
            const channel = await client.channels.fetch(data.channelId);
            if (!channel) {
                return socket.emit('status-update', { message: 'Kanal bulunamadı.', type: 'error' });
            }
            // Alanları (fields) doğru formata çevir
            const fields = data.embed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline || false })).filter(f => f.name && f.value);

            const embedToSend = {
                title: data.embed.title,
                description: data.embed.description,
                color: data.embed.color,
                fields: fields,
                footer: data.embed.footer ? { text: data.embed.footer } : null,
            };

            await channel.send({ embeds: [embedToSend] });
            socket.emit('status-update', { message: `Embed mesajı #${channel.name} kanalına gönderildi.`, type: 'success' });
        } catch (error) {
            console.error('Embed gönderme hatası:', error);
            socket.emit('status-update', { message: 'Embed mesajı gönderilemedi.', type: 'error' });
        }
    });

    // Gelişmiş Sunucu Kopyalayıcı
    socket.on('clone-server', async ({ sourceGuildId, targetGuildId }) => {
        try {
            const sourceGuild = client.guilds.cache.get(sourceGuildId);
            const targetGuild = client.guilds.cache.get(targetGuildId);

            if (!sourceGuild || !targetGuild) {
                return socket.emit('status-update', { message: 'Kaynak veya hedef sunucu bulunamadı.', type: 'error' });
            }
            if (targetGuild.ownerId !== client.user.id) {
                return socket.emit('status-update', { message: 'Bu işlemi yapmak için hedef sunucunun sahibi olmalısınız!', type: 'error' });
            }

            socket.emit('status-update', { message: 'Kopyalama başladı... Hedef sunucu temizleniyor.', type: 'info' });

            // Hedef sunucuyu temizle
            for (const channel of targetGuild.channels.cache.values()) await channel.delete();
            for (const role of targetGuild.roles.cache.values()) {
                if (role.id !== targetGuild.id) await role.delete().catch(() => {});
            }
            for (const emoji of targetGuild.emojis.cache.values()) await emoji.delete();
            
            await targetGuild.setName(sourceGuild.name).catch(()=>{});
            await targetGuild.setIcon(sourceGuild.iconURL({dynamic: true})).catch(()=>{});


            socket.emit('status-update', { message: 'Roller kopyalanıyor...', type: 'info' });
            const createdRoles = new Map();
            for (const role of [...sourceGuild.roles.cache.values()].sort((a,b) => a.position - b.position)) {
                 if (role.id === sourceGuild.id) continue;
                 const newRole = await targetGuild.roles.create({
                     name: role.name,
                     color: role.color,
                     permissions: role.permissions,
                     hoist: role.hoist,
                     mentionable: role.mentionable,
                 });
                 createdRoles.set(role.id, newRole);
            }

            socket.emit('status-update', { message: 'Kanallar kopyalanıyor...', type: 'info' });
            for (const channel of [...sourceGuild.channels.cache.values()].sort((a,b) => a.position - b.position)) {
                 const options = {
                     type: channel.type,
                     permissionOverwrites: channel.permissionOverwrites.cache.map(p => {
                         const role = createdRoles.get(p.id);
                         return role ? { id: role.id, allow: p.allow, deny: p.deny } : { id: p.id, allow: p.allow, deny: p.deny };
                     })
                 };
                 if(channel.parent) {
                    const parent = targetGuild.channels.cache.find(c => c.name === channel.parent.name && c.type === 'GUILD_CATEGORY');
                    if(parent) options.parent = parent.id;
                 }
                const newChannel = await targetGuild.channels.create(channel.name, options);
                if(channel.topic) await newChannel.setTopic(channel.topic).catch(()=>{});
            }

            socket.emit('status-update', { message: 'Sunucu başarıyla kopyalandı!', type: 'success' });
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', { message: 'Sunucu kopyalanamadı. Konsolu kontrol edin.', type: 'error' });
        }
    });

    // DM Temizleyici
    socket.on('clean-dm', async (userId) => {
        try {
            const user = await client.users.fetch(userId);
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
            if(error.code === 10013) { // Unknown User
                 socket.emit('status-update', { message: 'Hata: Kullanıcı bulunamadı. Lütfen geçerli bir ID girin.', type: 'error' });
            } else {
                 socket.emit('status-update', { message: 'DM mesajları silinemedi.', type: 'error' });
            }
        }
    });
});

// Discord Bot Olayları
client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    console.log(`Web arayüzü http://localhost:3000 adresinde aktif.`);
});

client.on('messageCreate', async (message) => {
    if (!afkEnabled || message.author.id === client.user.id || message.author.bot) return;

    if (message.mentions.users.has(client.user.id) || message.channel.type === 'DM') {
        try {
            await message.channel.send(config.afkMessage);
            console.log(`${message.author.tag} kullanıcısına AFK mesajı gönderildi.`);
        } catch (error) {
            console.error('AFK mesajı gönderilemedi:', error);
        }
    }
});

// Başlatma
client.login(config.token).catch(error => {
    console.error('Giriş yapılırken hata oluştu:', error.message);
    console.log('Lütfen config.js dosyasındaki token\'ı kontrol edin.');
});

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda başlatıldı.');
});
                                     
