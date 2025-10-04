module.exports = {
    // Web paneli yönetecek olan ANA Discord hesabınızın token'ı
    panel_token: 'BURAYA_ANA_PANEL_HESABINIZIN_TOKENINI_GIRIN',

    // AFK modunda gönderilecek otomatik mesaj
    afkMessage: 'Şu anda meşgulüm, daha sonra döneceğim.',

    // Yayın yapacak olan bot hesaplarının bilgileri
    // İstediğiniz kadar bot ekleyebilirsiniz.
    streamer_configs: [
        {
            token: 'YAYINCI_BOT_1_TOKENINI_BURAYA_GIRIN',
            voice_channel_id: 'YAYIN_YAPACAGI_SES_KANALI_IDsini_GIRIN'
        },
        {
            token: 'YAYINCI_BOT_2_TOKENINI_BURAYA_GIRIN',
            voice_channel_id: 'YAYIN_YAPACAGI_SES_KANALI_IDsini_GIRIN'
        }
        // Daha fazla bot eklemek için bu bloğu kopyalayıp altına yapıştırabilirsiniz.
        /*
        ,{
            token: 'YAYINCI_BOT_3_TOKENINI_BURAYA_GIRIN',
            voice_channel_id: 'YAYIN_YAPACAGI_SES_KANALI_IDsini_GIRIN'
        }
        */
    ]
};
