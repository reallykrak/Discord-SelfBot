const { Collection } = require('discord.js-selfbot-v13');

// API limitlerine takılmamak için bekleme fonksiyonu
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cloneServer = async (client, sourceGuildId, newServerName, socket) => {
    try {
        const sourceGuild = await client.guilds.fetch(sourceGuildId);
        if (!sourceGuild) {
            return socket.emit('status-update', { message: 'Kopyalanacak kaynak sunucu bulunamadı.', type: 'error' });
        }
        socket.emit('status-update', { message: `Kaynak sunucu bulundu: ${sourceGuild.name}. Yeni sunucu oluşturuluyor...`, type: 'info' });

        // 1. Yeni sunucuyu oluştur
        let newGuild;
        try {
            const iconURL = sourceGuild.iconURL({ dynamic: true, format: 'png' });
            newGuild = await client.guilds.create(newServerName, { icon: iconURL });
        } catch (error) {
            if (error.code === 30001) {
                return socket.emit('status-update', { message: 'Sunucu oluşturulamadı: 100 sunucu limitine ulaştınız.', type: 'error' });
            }
            console.error('Sunucu oluşturma hatası:', error);
            return socket.emit('status-update', { message: `Yeni sunucu oluşturulurken hata: ${error.message}`, type: 'error' });
        }
        
        await wait(2000); // Sunucunun tam olarak oluşturulmasını bekle

        // 2. Varsayılan içeriği temizle
        socket.emit('status-update', { message: 'Varsayılan kanallar ve roller temizleniyor...', type: 'info' });
        for (const channel of (await newGuild.channels.fetch()).values()) {
            await channel.delete().catch(() => {});
            await wait(350);
        }
        for (const role of (await newGuild.roles.fetch()).values()) {
            if (role.id !== newGuild.id) { // @everyone rolünü silme
                await role.delete().catch(() => {});
                await wait(350);
            }
        }

        // 3. Rolleri kopyala
        socket.emit('status-update', { message: 'Roller kopyalanıyor...', type: 'info' });
        const roleMap = new Collection();
        const sourceRoles = [...sourceGuild.roles.cache.values()]
            .sort((a, b) => b.position - a.position)
            .filter(r => r.id !== sourceGuild.id);

        roleMap.set(sourceGuild.id, newGuild.roles.everyone);

        for (const sourceRole of sourceRoles) {
            try {
                const newRole = await newGuild.roles.create({
                    name: sourceRole.name,
                    color: sourceRole.color,
                    hoist: sourceRole.hoist,
                    permissions: sourceRole.permissions,
                    mentionable: sourceRole.mentionable,
                    position: sourceRole.position
                });
                roleMap.set(sourceRole.id, newRole);
                await wait(350);
            } catch (e) { console.error(`Rol kopyalanamadı: ${sourceRole.name}`, e.message); }
        }
        socket.emit('status-update', { message: 'Roller başarıyla kopyalandı.', type: 'success' });

        // 4. Kanalları kopyala (ÖNCE KATEGORİLER, SONRA DİĞERLERİ)
        socket.emit('status-update', { message: 'Kanallar ve kategoriler kopyalanıyor...', type: 'info' });
        const categoryMap = new Collection();
        const sourceChannels = [...sourceGuild.channels.cache.values()].sort((a, b) => a.position - b.position);
        
        // Önce Kategorileri oluştur
        for (const sourceChannel of sourceChannels.filter(c => c.type === 4 /* GuildCategory */)) {
            try {
                const permissionOverwrites = sourceChannel.permissionOverwrites.cache.map(ow => ({
                    id: roleMap.get(ow.id)?.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                })).filter(ow => ow.id);
                
                const newCategory = await newGuild.channels.create(sourceChannel.name, {
                    type: 4, // GuildCategory
                    permissionOverwrites,
                    position: sourceChannel.position,
                });
                categoryMap.set(sourceChannel.id, newCategory.id);
                await wait(350);
            } catch (e) { console.error(`Kategori kopyalanamadı: ${sourceChannel.name}`, e.message); }
        }

        // Sonra diğer kanalları oluştur
        for (const sourceChannel of sourceChannels.filter(c => c.type !== 4 /* GuildCategory */)) {
             try {
                const permissionOverwrites = sourceChannel.permissionOverwrites.cache.map(ow => ({
                    id: roleMap.get(ow.id)?.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                })).filter(ow => ow.id);

                const channelOptions = {
                    type: sourceChannel.type,
                    topic: sourceChannel.topic,
                    nsfw: sourceChannel.nsfw,
                    position: sourceChannel.position,
                    bitrate: sourceChannel.bitrate,
                    userLimit: sourceChannel.userLimit,
                    permissionOverwrites,
                    parent: categoryMap.get(sourceChannel.parentId),
                };
                await newGuild.channels.create(sourceChannel.name, channelOptions);
                await wait(350);
            } catch(e) { console.error(`Kanal kopyalanamadı: ${sourceChannel.name}`, e.message); }
        }
        socket.emit('status-update', { message: 'Kanallar ve izinler başarıyla kopyalandı.', type: 'success' });
        
        // 5. Emojileri kopyala
        socket.emit('status-update', { message: 'Emojiler kopyalanıyor...', type: 'info' });
        for (const emoji of sourceGuild.emojis.cache.values()) {
            try {
                await newGuild.emojis.create(emoji.url, emoji.name);
                await wait(500);
            } catch (e) { console.error(`Emoji kopyalanamadı: ${emoji.name}`, e.message); }
        }
        socket.emit('status-update', { message: 'Emojiler başarıyla kopyalandı.', type: 'success' });
        
        socket.emit('status-update', { message: `Sunucu kopyalama tamamlandı! Yeni sunucu: ${newGuild.name}`, type: 'success' });

    } catch (error) {
        console.error('Sunucu kopyalama sırasında kritik bir hata oluştu:', error);
        socket.emit('status-update', { message: `Kopyalama başarısız oldu: ${error.message}`, type: 'error' });
    }
};

module.exports = cloneServer;
                                      
