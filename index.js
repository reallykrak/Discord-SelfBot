const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.js');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const client = new Client({
    checkUpdate: false,
});

let afkEnabled = true;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Web arayüzüne bir kullanıcı bağlandı.');

    socket.on('toggle-afk', (status) => {
        afkEnabled = status;
        console.log(`AFK modu ${afkEnabled ? 'aktif' : 'pasif'} edildi.`);
        socket.emit('status-update', `AFK modu başarıyla ${afkEnabled ? 'aktif' : 'pasif'} edildi.`);
    });

    socket.on('generate-nitro', async (channelId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                await channel.send('https://discord.gift/ABCDEFGHIJKLMNOPQRSTUVWXYZ');
                socket.emit('status-update', `Sahte Nitro, ${channel.name} kanalına gönderildi.`);
            } else {
                socket.emit('status-update', 'Hata: Kanal bulunamadı.');
            }
        } catch (error) {
            console.error('Nitro gönderme hatası:', error);
            socket.emit('status-update', 'Hata: Sahte Nitro gönderilemedi.');
        }
    });

    socket.on('clone-server', async (guildId) => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                socket.emit('status-update', 'Hata: Kopyalanacak sunucu bulunamadı.');
                return;
            }

            const newGuild = await client.guilds.create(`Clone of ${guild.name}`, {
                icon: guild.iconURL({ dynamic: true }),
            });

            // Kanalları ve kategorileri kopyala
            const channels = guild.channels.cache.sort((a, b) => a.position - b.position);
            for (const channel of channels.values()) {
                await newGuild.channels.create(channel.name, {
                    type: channel.type,
                    topic: channel.topic,
                    parent: channel.parent ? newGuild.channels.cache.find(c => c.name === channel.parent.name) : null,
                    permissionOverwrites: channel.permissionOverwrites.cache,
                });
            }
            
            // Rolleri kopyala (limitli)
            const roles = guild.roles.cache.filter(r => !r.managed && r.name !== '@everyone');
            for(const role of roles.values()){
                await newGuild.roles.create({
                    name: role.name,
                    color: role.color,
                    permissions: role.permissions,
                    hoist: role.hoist,
                    mentionable: role.mentionable,
                });
            }

            socket.emit('status-update', `${guild.name} sunucusu başarıyla kopyalandı! Yeni sunucu: ${newGuild.name}`);
        } catch (error) {
            console.error('Sunucu kopyalama hatası:', error);
            socket.emit('status-update', 'Hata: Sunucu kopyalanamadı.');
        }
    });

    socket.on('clean-dm', async (userId) => {
        try {
            const user = await client.users.fetch(userId);
            if (!user) {
                socket.emit('status-update', 'Hata: Kullanıcı bulunamadı.');
                return;
            }
            const dmChannel = await user.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === client.user.id);
            
            let deletedCount = 0;
            for (const message of userMessages.values()) {
                await message.delete();
                deletedCount++;
            }
            
            socket.emit('status-update', `${user.tag} ile olan DM'deki ${deletedCount} mesajınız silindi.`);
        } catch (error) {
            console.error('DM temizleme hatası:', error);
            socket.emit('status-update', 'Hata: DM mesajları silinemedi.');
        }
    });
});

client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    console.log('Web arayüzü http://localhost:3000 adresinde aktif.');
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

client.login(config.token).catch(error => {
    console.error('Giriş yapılırken hata oluştu:', error.message);
    console.log('Lütfen config.js dosyasındaki token\'ı kontrol edin.');
});

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda başlatıldı.');
});
                            
