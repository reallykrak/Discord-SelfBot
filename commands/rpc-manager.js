/**
 * Mevcut RPC aktivitesini temizler.
 * @param {Client} client - Discord client nesnesi.
 */
function stopRichPresence(client) {
    if (!client || !client.user) return;
    try {
        client.user.setActivity(null); // Aktiviteyi null yaparak temizler
        console.log('[RPC] Rich Presence temizlendi.');
    } catch (error) {
        console.error('[RPC] RPC temizlenirken hata oluştu:', error);
    }
}

/**
 * Discord Rich Presence (RPC) aktivitesini ayarlar.
 * Kullanıcının girdiği bilgilere göre dinamik bir RPC oluşturur.
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları.
 */
function setRichPresence(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }
    stopRichPresence(client);
    const startTime = Date.now();
    const activity = {
        details: options.details,
        state: options.state,
        timestamps: { start: startTime },
        assets: {
            large_image: options.largeImageKey,
            large_text: options.largeImageText,
        },
        type: 'LISTENING',
        name: 'Spotify',
    };
    try {
        client.user.setActivity(activity);
        console.log(`[RPC] Rich Presence ayarlandı: ${options.details}`);
    } catch (error) {
        console.error('[RPC] RPC ayarlanırken hata oluştu:', error);
    }
}

/**
 * Fotoğraftaki gibi, önceden ayarlanmış ve çok uzun süreli bir RPC başlatır.
 * Zamanlayıcıyı 3563 saat öncesinden başlatır.
 * @param {Client} client - Discord client nesnesi.
 * @param {object} options - RPC ayarları (sadece resim anahtarı yeterli).
 */
function setPredefinedRpc(client, options) {
    if (!client || !client.user) {
        console.error('[RPC] Panel botu aktif değil, RPC ayarlanamadı.');
        return;
    }
    stopRichPresence(client);

    // İstenen süreyi (3563 saat, 50 dakika, 59 saniye) geçmişe ayarla
    const hours = 3563;
    const minutes = 50;
    const seconds = 59;
    const pastMilliseconds = (hours * 3600 + minutes * 60 + seconds) * 1000;
    const startTime = Date.now() - pastMilliseconds;

    const activity = {
        details: "Bleach", // Ana Başlık
        state: "Thousand-Year Blood War Arc", // Alt Başlık
        timestamps: {
            start: startTime,
        },
        assets: {
            large_image: options.largeImageKey,
            large_text: "Since the beginning...", // Resim üzerine gelince çıkan yazı
        },
        type: 'LISTENING', // Zamanlayıcı için 'LISTENING' olmalı
        name: 'Spotify',
    };

    try {
        client.user.setActivity(activity);
        console.log(`[RPC] Önceden tanımlanmış 'Bleach' RPC ayarlandı.`);
    } catch (error) {
        console.error('[RPC] Önceden tanımlanmış RPC ayarlanırken hata oluştu:', error);
    }
}

module.exports = {
    setRichPresence,
    stopRichPresence,
    setPredefinedRpc
};
