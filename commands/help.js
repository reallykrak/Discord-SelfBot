const { MessageEmbed } = require('discord.js-selfbot-v13');

// Komutların tam listesi. Yeni komutları buraya ekleyebilirsin.
const commands = [
    { name: 'help [sayfa]', desc: 'Bu yardım menüsünü sayfa olarak gösterir.' },
    { name: 'ping', desc: 'Botun gecikme süresini gösterir.' },
    { name: 'yazıtura', desc: 'Yazı tura atar.' },
    { name: 'tersyaz <yazı>', desc: 'Yazdığınız metni tersten yazar.' },
    { name: 'avatar [@kullanıcı]', desc: 'Etiketlediğiniz kişinin veya kendi avatarınızı gösterir.' },
    { name: 'dmall <mesaj>', desc: 'Sunucudaki herkese belirttiğiniz mesajı gönderir.' },
    { name: 'twdwatch <resim_key>', desc: 'Zamanlayıcılı "The Walking Dead" RPC\'si başlatır.' },
    { name: 'twdlisten <resim_key>', desc: '"Spotify Dinliyor" RPC\'si başlatır.' },
    { name: 'stoprpc', desc: 'Aktif olan tüm RPC aktivitelerini durdurur.' },
    { name: 'ascii <yazı>', desc: 'Yazdığınız metni ASCII sanatına dönüştürür.' },
    { name: 'hesapla <işlem>', desc: 'Basit matematiksel işlemler yapar. Örn: .hesapla 5*5' },
    { name: 'sunucubilgi', desc: 'Bulunulan sunucu hakkında detaylı bilgi verir.' },
    { name: 'kullanıcıbilgi [@kullanıcı]', desc: 'Belirtilen kullanıcı hakkında bilgi verir.' },
    { name: 'say <mesaj>', desc: 'Yazdığınız mesajı botun ağzından tekrar gönderir ve komutu siler.' },
    { name: 'embed <başlık> | <mesaj>', desc: 'Basit bir embed mesajı oluşturur.' },
    { name: 'zar', desc: '1-6 arasında rastgele bir zar atar.' },
    { name: 'alkış <yazı>', desc: 'Yazdığınız metnin aralarına alkış emojisi koyar.' },
    { name: 'havadurumu <şehir>', desc: 'Belirtilen şehrin hava durumunu (sahte) esprili bir dille söyler.' },
    { name: 'espri', desc: 'Soğuk bir espri yapar.' },
    { name: 'token', desc: 'Kullanıcının tokenini (sahte) gösterir.' },
    { name: 'hack [@kullanıcı]', desc: 'Belirtilen kullanıcıyı "hackler" (animasyon).' },
    { name: 'sevgiölçer [@kullanıcı]', desc: 'Etiketlediğiniz kişiyle aranızdaki sevgi oranını ölçer.' },
    { name: 'aşkölçer [@kullanıcı1] [@kullanıcı2]', desc: 'İki kişi arasındaki aşkı ölçer.' },
    { name: 'fal', desc: 'Günün falına bakar.' },
    { name: 'öldür [@kullanıcı]', desc: 'Etiketlediğiniz kişiyi "öldürür".' },
    { name: 'taklit [@kullanıcı]', desc: 'Belirtilen kullanıcının son söylediği mesajı taklit eder.' },
    { name: 'sor', desc: 'Bota evet/hayır sorusu sorarsınız.' },
    { name: 'kaçcm', desc: 'Malafatını ölçer.' },
    { name: 'yıldızlar', desc: 'Gökyüzündeki yıldızları sayar.' },
    { name: 'temizle [sayı]', desc: 'Kendi mesajlarınızdan belirtilen sayıda siler (max 100).' },
    { name: 'rusruleti', desc: 'Ya yaşarsın ya ölürsün.' },
    { name: 'spotify [@kullanıcı]', desc: 'Kişinin o an dinlediği Spotify şarkısını gösterir.' },
    { name: 'renk <renk_kodu>', desc: 'Belirtilen hex kodundaki rengi gösterir.' },
    { name: 'kısalt <link>', desc: 'Verilen linki kısaltır.' },
    { name: 'emojibilgi <emoji>', desc: 'Belirtilen emoji hakkında bilgi verir.' },
    { name: 'döviz', desc: 'Güncel döviz kurlarını gösterir.' },
    { name: 'imdb <film_adı>', desc: 'Belirtilen film hakkında bilgi getirir.' },
    { name: 'youtube <arama>', desc: 'YouTube\'da arama yapar ve ilk sonucu getirir.' },
    { name: 'steam <oyun_adı>', desc: 'Steam\'de oyun arar ve bilgilerini getirir.' },
    { name: 'mcskin <oyuncu_adı>', desc: 'Minecraft oyuncu skinini gösterir.' },
    { name: 'github <kullanıcı_adı>', desc: 'GitHub kullanıcı profilini gösterir.' },
    { name: 'atatürksözü', desc: 'Atatürk\'ün rastgele bir sözünü gönderir.' },
    { name: 'şiir', desc: 'Rastgele bir şiir dörtlüğü gönderir.' },
    { name: 'atasözü', desc: 'Rastgele bir atasözü gönderir.' },
    { name: 'notal <not>', desc: 'Kendinize özel bir not alırsınız.' },
    { name: 'notlarım', desc: 'Aldığınız notları listeler.' },
    { name: 'çevir <dil> <metin>', desc: 'Metni belirtilen dile çevirir. Örn: .çevir en Merhaba' },
    { name: 'kahve', desc: 'Bir fincan kahve ısmarlar.' },
    { name: 'çay', desc: 'Bir bardak çay ısmarlar.' },
    { name: 'wasted [@kullanıcı]', desc: 'Kullanıcının avatarına wasted efekti uygular.' },
    { name: 'gay [@kullanıcı]', desc: 'Kullanıcının avatarına gay bayrağı ekler.' },
    { name: 'sniper', desc: 'Son silinen mesajı yakalar ve gösterir.' },
    { name: 'rolbilgi <rol_adı>', desc: 'Sunucudaki bir rol hakkında bilgi verir.' },
    { name: 'emojiyükle <link> <isim>', desc: 'Verilen linkteki resmi sunucuya emoji olarak ekler.' },
    { name: 'afk [sebep]', desc: 'AFK moduna girersiniz. Size DM atanlara sebep iletilir.' },
    { name: 'stresçarkı', desc: 'Stres çarkı çevirir.' },
    { name: 'balıktut', desc: 'Denize olta atıp balık tutmaya çalışırsınız.' },
    { name: 'kripto <coin>', desc: 'Belirtilen kripto paranın değerini gösterir. Örn: .kripto btc' },
    { name: 'rastgelesayı <min> <max>', desc: 'Belirtilen aralıkta rastgele bir sayı seçer.' },
    { name: 'tarihtebugün', desc: 'Tarihte bugün yaşanan olayları listeler.' },
    { name: 'google <arama>', desc: 'Google\'da arama yapar ve ilk 5 sonucu listeler.' },
    { name: 'deprem', desc: 'Türkiye\'deki son depremleri listeler.' },
    { name: 'korona', desc: 'Türkiye\'nin güncel korona tablosunu gösterir.' },
    { name: 'nobetçieczane <ilçe>', desc: 'Belirtilen ilçedeki nöbetçi eczaneleri listeler.' },
    { name: 'kimlik', desc: 'Rastgele bir TC kimlik bilgisi oluşturur.' },
    { name: 'kart', desc: 'Rastgele bir kredi kartı bilgisi oluşturur.' },
    { name: 'sansür <yazı>', desc: 'Yazdığınız yazıyı sansürler.' },
    { name: 'spamsız', desc: 'Yavaş mod olan kanallarda hızlı mesaj gönderir.' },
    { name: 'fbi [@kullanıcı]', desc: 'FBI baskını yapar.' },
    { name: 'ara155', desc: 'Polisi arar.' },
    { name: 'atatürk', desc: 'Rastgele bir Atatürk fotoğrafı gönderir.' },
    { name: 'kedi', desc: 'Rastgele bir kedi fotoğrafı gönderir.' },
    { name: 'köpek', desc: 'Rastgele bir köpek fotoğrafı gönderir.' },
    { name: 'kuş', desc: 'Rastgele bir kuş fotoğrafı gönderir.' },
    { name: 'yılan', desc: 'Rakibini korkutmak için yılan gönderir.' },
    { name: 'yumruk [@kullanıcı]', desc: 'Etiketlediğiniz kişiye sağlam bir yumruk atar.' },
    { name: 'tokat [@kullanıcı]', desc: 'Etiketlediğiniz kişiyi tokatlar.' },
    { name: 'öp [@kullanıcı]', desc: 'Etiketlediğiniz kişiyi öper.' },
    { name: 'sarıl [@kullanıcı]', desc: 'Etiketlediğiniz kişiye sarılır.' },
    { name: 'dans', desc: 'Dans edersiniz.' },
    { name: 'sigara', desc: 'Bir sigara yakarsınız.' },
    { name: 'rip [@kullanıcı]', desc: 'Kullanıcının mezar taşını yapar.' },
    { name: 'kanalbilgi', desc: 'Bulunduğunuz kanal hakkında bilgi verir.' },
    { name: 'büyükharf <yazı>', desc: 'Yazıyı büyük harflere çevirir.' },
    { name: 'küçükharf <yazı>', desc: 'Yazıyı küçük harflere çevirir.' },
    { name: 'emojiler', desc: 'Sunucudaki tüm emojileri listeler.' },
    { name: 'roller', desc: 'Sunucudaki tüm rolleri listeler.' },
    { name: 'vikipedi <arama>', desc: 'Vikipedi\'de arama yapar.' },
    { name: 'netflix <film>', desc: 'Netflix\'te film arar.' },
    { name: 'söz', desc: 'Rastgele anlamlı bir söz gönderir.' },
    { name: 'şifre <uzunluk>', desc: 'Belirtilen uzunlukta güvenli bir şifre oluşturur.' },
    { name: 'qr <yazı>', desc: 'Yazdığınız metin veya link için QR kod oluşturur.' },
    { name: 'bitcoin', desc: 'Anlık Bitcoin fiyatını gösterir.' },
    { name: 'dolar', desc: 'Anlık Dolar/TL kurunu gösterir.' },
    { name: 'euro', desc: 'Anlık Euro/TL kurunu gösterir.' },
    { name: 'intihar', desc: 'İntihar edersiniz.' },
    { name: 'söv', desc: 'Rastgele bir küfür eder.' },
];

/**
 * Komut listesini sayfalara bölünmüş bir Discord embed formatında oluşturur.
 * @param {Client} client - Discord client nesnesi.
 * @param {number} page - Gösterilecek sayfa numarası.
 * @returns {MessageEmbed | string}
 */
function createHelpEmbed(client, page = 1) {
    const commandsPerPage = 20; // Her sayfada gösterilecek komut sayısı
    const totalPages = Math.ceil(commands.length / commandsPerPage);

    if (page < 1 || page > totalPages) {
        return `Geçersiz sayfa numarası. Lütfen 1 ile ${totalPages} arasında bir sayı girin.`;
    }

    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = commands.slice(startIndex, endIndex);

    const embed = new MessageEmbed()
        .setTitle(`${client.user.username} Komut Menüsü`)
        .setColor('#8A2BE2')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: `Sayfa ${page} / ${totalPages} | Toplam ${commands.length} komut` })
        .setTimestamp();
    
    let description = '';
    pageCommands.forEach(cmd => {
        description += `**.${cmd.name}** - ${cmd.desc}\n`;
    });

    embed.setDescription(description);
    
    return embed;
}

module.exports = {
    commands,
    createHelpEmbed,
};
    
