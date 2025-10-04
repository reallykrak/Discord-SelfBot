document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const mainContent = document.getElementById('main-content');
    const toastContainer = document.getElementById('toast-container');
    const statusLight = document.querySelector('.status-light');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    const tokenModal = document.getElementById('token-modal');
    
    const templates = {
        home: document.getElementById('home-template').innerHTML,
        audio: document.getElementById('audio-template').innerHTML,
        profile: document.getElementById('profile-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        messaging: document.getElementById('messaging-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        tools: document.getElementById('tools-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        account: document.getElementById('account-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
    };

    const showToast = (message, type = 'info') => { /* Değişiklik Yok */ };

    const updateToggleButton = (button, isActive, activeText, inactiveText) => {
        if (!button) return;
        button.dataset.status = isActive ? 'true' : 'false';
        button.textContent = isActive ? activeText : inactiveText;
        button.classList.toggle('active', isActive);
    };

    const switchPage = (hash) => {
        const page = hash.substring(1) || 'home';
        if (!templates[page]) return;
        
        mainContent.innerHTML = templates[page];
        addEventListenersForPage(page);
        updateDynamicContent();

        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${page}`));
    };

    const addEventListenersForPage = (page) => {
        switch (page) {
            case 'home':
                document.getElementById('toggle-afk')?.addEventListener('click', handleAfkToggle);
                break;
            case 'audio':
                document.getElementById('toggle-music-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('toggle-stream-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('toggle-camera-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('skip-music-btn')?.addEventListener('click', () => socket.emit('music-control', 'skip'));
                document.querySelectorAll('.voice-btn').forEach(btn => {
                    btn.addEventListener('click', () => socket.emit('voice-state-change', { action: btn.dataset.action }));
                });
                break;
            case 'profile': /* Değişiklik Yok */ break;
            case 'messaging':
                document.getElementById('send-dm-btn')?.addEventListener('click', handleSendDm);
                document.getElementById('start-dm-clean-btn')?.addEventListener('click', handleDmClean);
                document.getElementById('spam-btn')?.addEventListener('click', handleSpamToggle);
                break;
            case 'tools': /* Değişiklik Yok */ break;
            case 'account': /* Değişiklik Yok */ break;
        }
    };

    let botInfo = {};
    const updateDynamicContent = () => { /* Değişiklik Yok */ };

    const handleAfkToggle = (e) => { /* Değişiklik Yok */ };
    
    const handleStreamToggle = (e) => {
        const type = e.target.dataset.type;
        const channelId = document.getElementById(
            type === 'music' ? 'music-channel-id' : 'stream-channel-id'
        ).value;
        
        if (!channelId) return showToast('Lütfen bir ses kanalı ID\'si girin.', 'error');
        
        const wantsToStart = e.target.dataset.status !== 'true';
        socket.emit('toggle-stream', { channelId, status: wantsToStart, type });
    };
    
    // Diğer handle fonksiyonları (handleChangeAvatar, handleSendDm vb.) değişmedi.

    const handleSpamToggle = (e) => {
        const isSpamming = e.target.dataset.status === 'true';
        const data = {
            token: document.getElementById('spammer-token').value,
            userId: document.getElementById('spammer-user-id').value,
            message: document.getElementById('spammer-message').value,
            delay: document.getElementById('spammer-delay').value,
            ping: document.getElementById('spammer-ping').checked,
            smartMode: document.getElementById('spammer-smart-mode').checked // Yeni Akıllı Mod
        };
        if (!isSpamming && (!data.token || !data.userId || !data.message)) {
            return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
        }
        if (!isSpamming && (!data.delay || parseInt(data.delay) < 500)) {
             return showToast('API limitlerini önlemek için gecikme en az 500ms olmalıdır.', 'error');
        }
        socket.emit('toggle-spam', data);
    };

    socket.on('connect', () => { /* Değişiklik Yok */ });
    socket.on('disconnect', () => { /* Değişiklik Yok */ });
    socket.on('bot-info', (data) => { /* Değişiklik Yok */ });
    socket.on('status-update', ({ message, type }) => showToast(message, type));
    
    socket.on('stream-status-change', (data) => {
        const streamBtn = document.getElementById('toggle-stream-btn');
        const cameraBtn = document.getElementById('toggle-camera-btn');
        const musicBtn = document.getElementById('toggle-music-btn');

        // Reset all buttons first
        updateToggleButton(streamBtn, false, 'Rastgele Yayın Aç', 'Rastgele Yayın Aç');
        updateToggleButton(cameraBtn, false, 'Kamera Modu Aç', 'Kamera Modu Aç');
        updateToggleButton(musicBtn, false, 'Müziği Başlat', 'Müziği Başlat');

        // Activate the correct button
        if (data.isActive) {
            if (data.type === 'stream') {
                updateToggleButton(streamBtn, true, 'Yayını Durdur', 'Yayını Durdur');
            } else if (data.type === 'camera') {
                updateToggleButton(cameraBtn, true, 'Kamerayı Kapat', 'Kamerayı Kapat');
            } else if (data.type === 'music') {
                updateToggleButton(musicBtn, true, 'Müziği Durdur', 'Müziği Durdur');
            }
        }
    });

    socket.on('music-status-change', ({ isPlaying, songName }) => {
        const songTicker = document.getElementById('current-song');
        if (songTicker) {
            songTicker.querySelector('span').textContent = isPlaying ? `🎵 ${songName}` : 'Müzik Çalar Pasif';
        }
    });

    socket.on('spam-status-change', (isActive) => {
        const spamBtn = document.getElementById('spam-btn');
        updateToggleButton(spamBtn, isActive, "Spam'ı Durdur", "Spam'ı Başlat");
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = link.hash; });
    });
    window.addEventListener('hashchange', () => switchPage(window.location.hash));
    
    // Modal listeners değişmedi

    switchPage(window.location.hash || '#home');
});
            
