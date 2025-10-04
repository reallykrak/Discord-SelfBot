document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const mainContent = document.getElementById('main-content');
    const toastContainer = document.getElementById('toast-container');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    
    const templates = {
        home: document.getElementById('home-template').innerHTML,
        streamer: document.getElementById('streamer-template').innerHTML,
        profile: document.getElementById('profile-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        messaging: document.getElementById('messaging-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        tools: document.getElementById('tools-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
        account: document.getElementById('account-template')?.innerHTML || '<h2>Yükleniyor...</h2>',
    };

    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

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
            case 'streamer':
                document.getElementById('toggle-stream-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('toggle-camera-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('toggle-music-btn')?.addEventListener('click', handleStreamToggle);
                document.getElementById('skip-music-btn')?.addEventListener('click', () => socket.emit('music-control', 'skip'));
                document.querySelectorAll('.voice-btn').forEach(btn => {
                    btn.addEventListener('click', () => socket.emit('voice-state-change', { action: btn.dataset.action }));
                });
                break;
            case 'profile':
                document.getElementById('change-avatar-btn')?.addEventListener('click', handleChangeAvatar);
                document.getElementById('change-status-btn')?.addEventListener('click', handleChangeStatus);
                break;
            case 'messaging':
                document.getElementById('spam-btn')?.addEventListener('click', handleSpamToggle);
                document.getElementById('start-dm-clean-btn')?.addEventListener('click', handleDmClean);
                break;
            case 'tools':
                document.getElementById('ghost-ping-btn')?.addEventListener('click', handleGhostPing);
                document.getElementById('start-typing-btn')?.addEventListener('click', handleTyping('start'));
                document.getElementById('stop-typing-btn')?.addEventListener('click', handleTyping('stop'));
                document.getElementById('copy-server-btn')?.addEventListener('click', handleServerCopy);
                break;
            case 'account':
                document.getElementById('switch-account-btn')?.addEventListener('click', handleSwitchAccount);
                break;
        }
    };

    let botInfo = {};
    const updateDynamicContent = () => {
        if (botInfo.tag) {
            const userTag = document.getElementById('user-tag');
            const userId = document.getElementById('user-id');
            const userAvatar = document.getElementById('user-avatar');
            if(userTag) userTag.textContent = botInfo.tag;
            if(userId) userId.textContent = botInfo.id;
            if(userAvatar) userAvatar.src = botInfo.avatar;
        }
    };

    const handleAfkToggle = (e) => {
        const wantsToEnable = e.target.dataset.status !== 'true';
        socket.emit('toggle-afk', wantsToEnable);
        updateToggleButton(e.target, wantsToEnable, 'AFK Modu Aktif', 'AFK Modu Pasif');
    };
    
    const handleStreamToggle = (e) => {
        const type = e.target.dataset.type;
        const channelId = document.getElementById(`${type}-voice-channel-id`).value;
        
        if (!channelId) return showToast('Lütfen bir ses kanalı ID\'si girin.', 'error');
        
        const wantsToStart = e.target.dataset.status !== 'true';
        socket.emit('toggle-stream', { channelId, status: wantsToStart, type });
    };

    const handleChangeAvatar = () => {
        const url = document.getElementById('avatar-url').value;
        if (url) socket.emit('change-avatar', url);
    };

    const handleChangeStatus = () => {
        const status = document.getElementById('status-type').value;
        const activityType = document.getElementById('activity-type').value;
        const activityText = document.getElementById('activity-text').value;
        const streamingUrl = document.getElementById('streaming-url').value;

        const data = {
            status,
            activity: {
                name: activityText,
                type: activityType,
                url: streamingUrl,
            },
        };

        socket.emit('change-status', data);
    };

    const handleGhostPing = () => {
        const channelId = document.getElementById('ghost-ping-channel-id').value;
        const userId = document.getElementById('ghost-ping-user-id').value;
        if (channelId && userId) socket.emit('ghost-ping', { channelId, userId });
    };

    const handleTyping = (action) => () => {
        const channelId = document.getElementById('typing-channel-id').value;
        if (channelId) socket.emit(`${action}-typing`, channelId);
    };

    const handleSwitchAccount = () => {
        const token = document.getElementById('new-token').value;
        if (token) socket.emit('switch-account', token);
    };

    const handleDmClean = () => {
        const userId = document.getElementById('clean-dm-user-id').value;
        if (userId) socket.emit('clean-dm', { userId });
    };
    
    const handleServerCopy = () => {
        const sourceGuildId = document.getElementById('source-guild-id').value;
        const newGuildName = document.getElementById('new-guild-name').value;
        const copyChannels = document.getElementById('copy-channels').checked;
        const copyRoles = document.getElementById('copy-roles').checked;
        const copyEmojis = document.getElementById('copy-emojis').checked;
    
        if (sourceGuildId && newGuildName) {
            socket.emit('copy-server', { 
                sourceGuildId, 
                newGuildName,
                options: {
                    channels: copyChannels,
                    roles: copyRoles,
                    emojis: copyEmojis,
                }
            });
        }
    };

    const handleSpamToggle = (e) => {
        const isSpamming = e.target.dataset.status === 'true';
        const data = {
            token: document.getElementById('spammer-token').value,
            userId: document.getElementById('spammer-user-id').value,
            message: document.getElementById('spammer-message').value,
            delay: document.getElementById('spammer-delay').value,
            ping: document.getElementById('spammer-ping').checked,
            smartMode: document.getElementById('spammer-smart-mode').checked
        };
        if (!isSpamming && (!data.token || !data.userId || !data.message)) {
            return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
        }
        if (!isSpamming && (!data.delay || parseInt(data.delay) < 500)) {
             return showToast('API limitlerini önlemek için gecikme en az 500ms olmalıdır.', 'error');
        }
        socket.emit('toggle-spam', data);
    };

    socket.on('connect', () => { connectionStatusText.textContent = 'Bağlandı'; });
    socket.on('disconnect', () => { connectionStatusText.textContent = 'Bağlantı Kesildi'; });
    socket.on('bot-info', (data) => { botInfo = data; updateDynamicContent(); });
    socket.on('status-update', ({ message, type }) => showToast(message, type));
    
    socket.on('stream-status-change', (data) => {
        const streamBtn = document.getElementById('toggle-stream-btn');
        const cameraBtn = document.getElementById('toggle-camera-btn');
        const musicBtn = document.getElementById('toggle-music-btn');

        updateToggleButton(streamBtn, false, 'Yayını Başlat', 'Yayını Durdur');
        updateToggleButton(cameraBtn, false, 'Kamera Modunu Aç', 'Kamerayı Kapat');
        updateToggleButton(musicBtn, false, 'Müziği Başlat', 'Müziği Durdur');

        if (data.isActive) {
            if (data.type === 'stream') {
                updateToggleButton(streamBtn, true, 'Yayını Durdur', 'Yayını Başlat');
            } else if (data.type === 'camera') {
                updateToggleButton(cameraBtn, true, 'Kamerayı Kapat', 'Kamera Modunu Aç');
            } else if (data.type === 'music') {
                updateToggleButton(musicBtn, true, 'Müziği Durdur', 'Müziği Başlat');
            }
        }
    });

    socket.on('music-status-change', ({ isPlaying, songName }) => {
        const songDisplay = document.getElementById('current-song-display');
        if (songDisplay) {
            songDisplay.textContent = isPlaying ? `🎵 Şimdi Çalıyor: ${songName}` : '';
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

    switchPage(window.location.hash || '#home');
});
        
