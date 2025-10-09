const { Collection, ChannelType } = require('discord.js-selfbot-v13');

// API limitlerine takılmamak için bekleme fonksiyonu
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cloneServer = async (client, sourceGuildId, newServerName, socket) => {
    try {
        // 1. Kaynak sunucuyu al
        const sourceGuild = await client.guilds.fetch(sourceGuildId);
        if (!sourceGuild) {
            socket.emit('status-update', { message: 'Kopyalanacak kaynak sunucu bulunamadı.', type: 'error' });
            return;
        }
        socket.emit('status-update', { message: `Kaynak sunucu bulundu: ${sourceGuild.name}. Yeni sunucu oluşturuluyor...`, type: 'info' });
        
        // HATA DÜZELTMESİ: 100 sunucu limitini kontrol et
        let newGuild;
        try {
            newGuild = await client.guilds.create(newServerName, {
                icon: sourceGuild.iconURL({ dynamic: true, format: 'png' })
            });
        } catch (error) {
            if (error.code === 30001) { // 100 sunucu limiti hata kodu
                socket.emit('status-update', { message: 'Sunucu oluşturulamadı: 100 sunucu limitine ulaştınız.', type: 'error' });
            } else {
                socket.emit('status-update', { message: `Yeni sunucu oluşturulurken hata: ${error.message}`, type: 'error' });
            }
            console.error('Sunucu oluşturma hatası:', error);
            return; // İşlemi durdur
        }
        
        await wait(2000); // Sunucunun tam olarak oluşturulması için bekle

        // 2. Yeni sunucudaki varsayılanları temizle
        const defaultChannels = await newGuild.channels.fetch();
        for (const channel of defaultChannels.values()) {
            await channel.delete().catch(() => {});
            await wait(500);
        }
        const defaultRoles = await newGuild.roles.fetch();
        for (const role of defaultRoles.values()) {
            if (role.id !== newGuild.id) { // @everyone rolü hariç
                await role.delete().catch(() => {});
                await wait(500);
            }
        }
        socket.emit('status-update', { message: 'Varsayılan kanallar ve roller temizlendi. Kopyalama başlıyor...', type: 'info' });

        // 3. Rolleri kopyala
        const roleMap = new Collection();
        const sourceRoles = [...sourceGuild.roles.cache.values()].sort((a, b) => b.position - a.position);
        
        for (const sourceRole of sourceRoles) {
            if (sourceRole.id === sourceGuild.id) { // @everyone rolünü atla
                roleMap.set(sourceRole.id, newGuild.roles.everyone);
                continue;
            }
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
                await wait(500);
            } catch (e) { console.error(`Rol kopyalanamadı: ${sourceRole.name}`, e.message); }
        }
        socket.emit('status-update', { message: 'Roller başarıyla kopyalandı.', type: 'success' });
        
        // 4. Kanalları ve kategorileri kopyala
        // HATA DÜZELTMESİ: Sadece self-bot'ların oluşturabileceği kanal türlerini kopyala
        const creatableChannelTypes = [
            ChannelType.GuildText,
            ChannelType.GuildVoice,
            ChannelType.GuildCategory,
            ChannelType.GuildStageVoice
        ];

        const sourceChannels = [...sourceGuild.channels.cache.values()]
            .filter(c => creatableChannelTypes.includes(c.type)) // Sadece geçerli türleri filtrele
            .sort((a, b) => a.position - b.position);

        const categoryMap = new Collection();

        for (const sourceChannel of sourceChannels) {
            // HATA DÜZELTMESİ: permissionOverwrites.cache tanımsız olabileceğinden 'optional chaining' kullan
            const permissionOverwrites = sourceChannel.permissionOverwrites?.cache?.map(overwrite => ({
                id: roleMap.get(overwrite.id)?.id,
                allow: overwrite.allow.toArray(),
                deny: overwrite.deny.toArray()
            })).filter(ow => ow.id) ?? []; // Eğer sonuç tanımsızsa boş bir dizi kullan

            const channelOptions = {
                type: sourceChannel.type,
                topic: sourceChannel.topic,
                nsfw: sourceChannel.nsfw,
                position: sourceChannel.position,
                permissionOverwrites: permissionOverwrites
            };
            
            if (sourceChannel.parent) {
                channelOptions.parent = categoryMap.get(sourceChannel.parent.id);
            }

            try {
                const newChannel = await newGuild.channels.create(sourceChannel.name, channelOptions);
                if (sourceChannel.type === ChannelType.GuildCategory) {
                    categoryMap.set(sourceChannel.id, newChannel);
                }
                await wait(500);
            } catch(e) { console.error(`Kanal kopyalanamadı: ${sourceChannel.name}`, e.message); }
        }
        socket.emit('status-update', { message: 'Kanallar ve izinler başarıyla kopyalandı.', type: 'success' });
        
        // 5. Emojileri kopyala
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
            
