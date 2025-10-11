/**
 * Mevcut tüm RPC aktivitelerini temizler.
 * @param {Client} client - Discord client nesnesi.
 */
function stopRichPresence(client) {
    if (!client || !client.user) return;
    try {
        // En güvenilir yöntem, aktiviteler dizisini boş olarak ayarlamaktır.
        client.user.setPresence({ activities: [] });
        console.log('[RPC] Rich Presence temizlendi.');
    } catch (error) {
        console.error('[RPC] RPC temizlenirken hata oluştu:', error);
    }
}

/**
 * ESKİ RPC: Sadece "Spotify dinliyor" olarak görünen aktiviteyi ayarlar. (.twdlisten komutu için)
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları.
 */
function setListeningRpc(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }
    
    // Geçmişte bir zaman belirleyerek zamanlayıcının ilerlemiş görünmesini sağlıyoruz.
    const hours = 3563;
    const minutes = 52;
    const seconds = 5;
    const pastMilliseconds = (hours * 3600 + minutes * 60 + seconds) * 1000;
    const startTime = Date.now() - pastMilliseconds;

    const activity = {
        name: 'Spotify',
        type: 'LISTENING',
        details: "The Walking Dead",
        state: null,
        timestamps: {
            start: startTime,
        },
        assets: {
            large_image: options.largeImageKey,
            large_text: "The Ones Who Live", 
        },
    };

    try {
        // setActivity, tek bir aktivite ayarlar.
        client.user.setActivity(activity);
        console.log(`[RPC] Zamanlayıcılı 'The Walking Dead' Dinliyor RPC ayarlandı.`);
    } catch (error) {
        console.error('[RPC] Dinleme RPC ayarlanırken hata oluştu:', error);
    }
}

/**
 * YENİ RPC: "The Walking Dead İzliyor" ve altında Spotify zamanlayıcısı gösterir. (.twdwatch komutu için)
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları.
 */
function setWatchingRpc(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }

    // Zamanlayıcı için geçmişte sabit bir zaman noktası
    const startTime = Date.now() - (3563 * 3600 + 52 * 60 + 5) * 1000;

    // Discord'a gönderilecek iki aktiviteyi bir dizi içinde tanımlıyoruz.
    const activities = [
        {
            // 1. Aktivite: Görünen ana aktivite
            name: "The Walking Dead",         // Bu, en üstte "The Walking Dead izliyor" yazısını oluşturur.
            type: 'WATCHING',                 // Aktivite tipi: İzliyor
            details: "The Walking Dead",      // Bu, büyük beyaz ana metin olacak.
            state: null,                      // "Bölüm", "Sezon" gibi alt metinleri kaldırdık.
            assets: {
                large_image: options.largeImageKey,
                large_text: "Final Sezonu",   // Resmin üzerine gelince çıkan yazı
            },
        },
        {
            // 2. Aktivite: Sadece Spotify zamanlayıcı çubuğunu eklemek için.
            // Bu aktivitenin diğer detayları genellikle görünmez.
            name: 'Spotify',
            type: 'LISTENING',
            timestamps: {
                start: startTime, // Zamanlayıcıyı başlat
            },
        }
    ];

    try {
        // setPresence metodu ile birden fazla aktiviteyi aynı anda ayarlıyoruz.
        client.user.setPresence({ activities: activities });
        console.log(`[RPC] Zamanlayıcılı 'The Walking Dead' İzliyor RPC ayarlandı.`);
    } catch (error)
        {
        console.error('[RPC] İzleme RPC ayarlanırken hata oluştu:', error);
    }
}

module.exports = {
    stopRichPresence,
    setListeningRpc,
    setWatchingRpc
};
