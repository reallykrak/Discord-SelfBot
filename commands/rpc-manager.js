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
 * @param {object} options - RPC ayarları (largeImageKey, largeImageText, smallImageKey, smallImageText, details, state, buttons)
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
        details: options.details || "The Walking Dead", // Değiştirilebilir
        state: options.state || null,                   // Değiştirilebilir
        timestamps: {
            start: startTime,
        },
        assets: {
            large_image: options.largeImageKey,
            large_text: options.largeImageText || "The Ones Who Live", 
            small_image: options.smallImageKey || undefined,
            small_text: options.smallImageText || undefined,
        },
        buttons: [
            ...(options.buttons || []) // [{ label: "İzle", url: "..." }]
        ]
    };

    try {
        // setActivity, tek bir aktivite ayarlar.
        client.user.setActivity(activity);
        console.log(`[RPC] Gelişmiş 'Dinliyor' RPC ayarlandı.`);
    } catch (error) {
        console.error('[RPC] Dinleme RPC ayarlanırken hata oluştu:', error);
    }
}

/**
 * YENİ RPC: "The Walking Dead İzliyor" ve altında Spotify zamanlayıcısı gösterir. (.twdwatch komutu için)
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları (largeImageKey, largeImageText, smallImageKey, smallImageText, details, state, buttons)
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
            name: "The Walking Dead",
            type: 'WATCHING',
            details: options.details || "The Walking Dead",
            state: options.state || null,
            assets: {
                large_image: options.largeImageKey,
                large_text: options.largeImageText || "Final Sezonu",
                small_image: options.smallImageKey || undefined,
                small_text: options.smallImageText || undefined,
            },
            buttons: [
                ...(options.buttons || []) // [{ label: "İzle", url: "..." }]
            ]
        },
        {
            // 2. Aktivite: Sadece Spotify zamanlayıcı çubuğunu eklemek için.
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
        console.log(`[RPC] Gelişmiş ve Zamanlayıcılı 'İzliyor' RPC ayarlandı.`);
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
