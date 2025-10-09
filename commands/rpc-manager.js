/**
 * Mevcut RPC aktivitesini temizler.
 */
function stopRichPresence(client) {
    if (!client || !client.user) return;
    try {
        client.user.setActivity(null);
        console.log('[RPC] Rich Presence temizlendi.');
    } catch (error) {
        console.error('[RPC] RPC temizlenirken hata oluştu:', error);
    }
}

/**
 * ZAMANLAYICILI RPC: "Spotify dinliyor" olarak görünen, uzun süreli aktiviteyi ayarlar.
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları.
 */
function setListeningRpc(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }
    stopRichPresence(client);

    const hours = 3563;
    const minutes = 52;
    const seconds = 5;
    const pastMilliseconds = (hours * 3600 + minutes * 60 + seconds) * 1000;
    const startTime = Date.now() - pastMilliseconds;

    const activity = {
        details: "The Walking Dead", // Ana Başlık
        // Alt başlıkları sildik.
        state: null,
        timestamps: {
            start: startTime,
        },
        assets: {
            large_image: options.largeImageKey,
            large_text: "The Ones Who Live", // Resim üzerine gelince çıkan yazı
        },
        type: 'LISTENING', // Zamanlayıcı için 'LISTENING' olmalı
        name: 'Spotify',
    };

    try {
        client.user.setActivity(activity);
        console.log(`[RPC] Zamanlayıcılı 'The Walking Dead' RPC ayarlandı.`);
    } catch (error) {
        console.error('[RPC] Dinleme RPC ayarlanırken hata oluştu:', error);
    }
}

/**
 * "İZLİYOR" YAZAN RPC: Zamanlayıcısız, "İzliyor" olarak görünen aktiviteyi ayarlar.
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları.
 */
function setWatchingRpc(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }
    stopRichPresence(client);

    const activity = {
        name: "The Walking Dead", // Ana aktivite adı
        details: "Son Sezon",      // Detaylar
        state: "Bölüm: Rest in Peace", // Durum
        assets: {
            large_image: options.largeImageKey,
            large_text: "Final Sezonu",
        },
        type: 'WATCHING', // 'İzliyor' olarak görünmesi için
    };

    try {
        client.user.setActivity(activity);
        console.log(`[RPC] 'İzliyor' tipli 'The Walking Dead' RPC ayarlandı.`);
    } catch (error) {
        console.error('[RPC] İzleme RPC ayarlanırken hata oluştu:', error);
    }
}


module.exports = {
    stopRichPresence,
    setListeningRpc,
    setWatchingRpc
};
            
