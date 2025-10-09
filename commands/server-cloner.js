const { Collection } = require('discord.js-selfbot-v13');

// API limitlerine takılmamak için bekleme fonksiyonu
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Discord Kanal Türleri için sabitler
const CHANNEL_TYPES = {
    GUILD_TEXT: 0,
    GUILD_VOICE: 2,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    GUILD_STAGE_VOICE: 13,
    GUILD_FORUM: 15,
};

// Klonlanmasını istemediğimiz veya klonlanamayan kanal türleri (örn: thread'ler)
const IGNORED_CHANNEL_TYPES = [10, 11, 12, 14];


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
            if (!role.managed && role.id !== newGuild.id) {
                await role.delete().catch(() => {});
                await wait(350);
            }
        }

        // 3. Rolleri kopyala
        socket.emit('status-update', { message: 'Roller kopyalanıyor...', type: 'info' });
        const roleMap = new Collection();
        const sourceRoles = [...sourceGuild.roles.cache.values()]
            .sort((a, b) => a.position - b.position)
            .filter(r => !r.managed && r.id !== sourceGuild.id);

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

        // 4. Kanalları kopyala (En Akıllı Yöntem)
        socket.emit('status-update', { message: 'Kanallar ve kategoriler kopyalanıyor...', type: 'info' });
        const categoryMap = new Collection();
        const sourceChannels = [...sourceGuild.channels.cache.values()]
            .filter(c => !IGNORED_CHANNEL_TYPES.includes(c.type))
            .sort((a, b) => a.position - b.position);
        
        // Önce Kategorileri oluştur
        for (const sourceChannel of sourceChannels.filter(c => c.type === CHANNEL_TYPES.GUILD_CATEGORY)) {
            try {
                const permissionOverwrites = sourceChannel.permissionOverwrites?.cache.map(ow => ({
                    id: roleMap.get(ow.id)?.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                })).filter(ow => ow.id);
                
                const newCategory = await newGuild.channels.create(sourceChannel.name, {
                    type: CHANNEL_TYPES.GUILD_CATEGORY,
                    permissionOverwrites,
                    position: sourceChannel.position,
                });
                categoryMap.set(sourceChannel.id, newCategory.id);
                await wait(350);
            } catch (e) { console.error(`Kategori kopyalanamadı: ${sourceChannel.name}`, e.message); }
        }

        // Sonra diğer tüm kanalları türlerine göre işle
        for (const sourceChannel of sourceChannels.filter(c => c.type !== CHANNEL_TYPES.GUILD_CATEGORY)) {
             try {
                const permissionOverwrites = sourceChannel.permissionOverwrites?.cache.map(ow => ({
                    id: roleMap.get(ow.id)?.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                })).filter(ow => ow.id);

                const channelOptions = {
                    name: sourceChannel.name,
                    position: sourceChannel.position,
                    permissionOverwrites,
                };
                
                // Kanal türüne göre özellikleri ayarla
                switch (sourceChannel.type) {
                    case CHANNEL_TYPES.GUILD_ANNOUNCEMENT: // Duyuru kanalı ise, normal metin kanalı olarak oluştur
                        channelOptions.type = CHANNEL_TYPES.GUILD_TEXT;
                        channelOptions.topic = sourceChannel.topic;
                        channelOptions.nsfw = sourceChannel.nsfw;
                        channelOptions.rateLimitPerUser = sourceChannel.rateLimitPerUser;
                        socket.emit('status-update', { message: `Duyuru kanalı '${sourceChannel.name}' normal metin kanalı olarak kopyalandı.`, type: 'warning' });
                        break;
                    
                    case CHANNEL_TYPES.GUILD_TEXT:
                        channelOptions.type = CHANNEL_TYPES.GUILD_TEXT;
                        channelOptions.topic = sourceChannel.topic;
                        channelOptions.nsfw = sourceChannel.nsfw;
                        channelOptions.rateLimitPerUser = sourceChannel.rateLimitPerUser;
                        break;
                    
                    case CHANNEL_TYPES.GUILD_VOICE:
                        channelOptions.type = CHANNEL_TYPES.GUILD_VOICE;
                        // Sunucu boost'u kaynaklı bitrate hatasını önle
                        channelOptions.bitrate = Math.min(sourceChannel.bitrate, newGuild.maximumBitrate || 96000);
                        channelOptions.userLimit = sourceChannel.userLimit;
                        break;
                        
                    case CHANNEL_TYPES.GUILD_STAGE_VOICE:
                         channelOptions.type = CHANNEL_TYPES.GUILD_STAGE_VOICE;
                         channelOptions.bitrate = Math.min(sourceChannel.bitrate, newGuild.maximumBitrate || 96000);
                         channelOptions.userLimit = sourceChannel.userLimit;
                         break;

                    case CHANNEL_TYPES.GUILD_FORUM:
                        channelOptions.type = CHANNEL_TYPES.GUILD_FORUM;
                        channelOptions.topic = sourceChannel.topic;
                        channelOptions.nsfw = sourceChannel.nsfw;
                        break;
                        
                    default: // Bilinmeyen veya desteklenmeyen türleri atla
                        console.log(`Atlanan kanal türü: ${sourceChannel.name} (${sourceChannel.type})`);
                        continue; 
                }

                const newChannel = await newGuild.channels.create(sourceChannel.name, channelOptions);
                
                if (sourceChannel.parentId) {
                    const newParentId = categoryMap.get(sourceChannel.parentId);
                    if (newParentId) {
                        await newChannel.setParent(newParentId);
                    }
                }
                await wait(400);
            } catch(e) { console.error(`Kanal kopyalanamadı: ${sourceChannel.name}`, e.message, e.stack); }
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
        
