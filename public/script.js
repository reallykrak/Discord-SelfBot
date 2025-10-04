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

        if (page === 'streamer') {
            socket.emit('get-streamer-bots');
        }

        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${page}`));
    };

    const addEventListenersForPage = (page) => {
        switch (page) {
            case 'home':
                document.getElementById('toggle-afk')?.addEventListener('click', handleAfkToggle);
                break;
            case 'streamer':
                const container = document.getElementById('streamer-bots-container');
                if (container) {
                    container.addEventListener('click', handleStreamerButtonClick);
                }
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

    const handleStreamerButtonClick = (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const token = button.dataset.token;

        if (action === 'start-stream' || action === 'start-camera') {
            const type = (action === 'start-camera') ? 'camera' : 'stream';
            socket.emit('start-streamer', { token, type });
        } else if (action === 'stop-stream') {
            socket.emit('stop-streamer', { token });
        }
    };

    const renderStreamerBots = (bots) => {
        const container = document.getElementById('streamer-bots-container');
        if (!container) return;

        container.innerHTML = bots.length > 0 ? '' : '<p>Config dosyasında yönetilecek bot bulunamadı.</p>';

        bots.forEach(bot => {
            const isOnline = bot.status === 'online';
            const statusColor = isOnline ? 'var(--success-color)' : 'var(--text-muted-color)';
            const botCard = `
                <div class="streamer-card" style="border: 1px solid var(--border-color); padding: 1rem; border-radius: 8px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 1rem; min-width: 250px;">
                        <img src="${bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 40px; height: 40px; border-radius: 50%;">
                        <div>
                            <strong style="white-space: nowrap;">${bot.tag || 'Çevrimdışı'}</strong>
                            <p style="font-size: 0.8em; color: ${statusColor};">${bot.statusText || 'Durduruldu'}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="toggle-btn" data-action="start-stream" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Yayın Başlat</button>
                        <button class="toggle-btn" data-action="start-camera" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Kamera Aç</button>
                        <button class="toggle-btn active" style="border-color: var(--error-color);" data-action="stop-stream" data-token="${bot.token}" ${!isOnline ? 'disabled' : ''}>Durdur</button>
                    </div>
                </div>
            `;
            container.innerHTML += botCard;
        });
    };

    const handleAfkToggle = (e) => {
        const wantsToEnable = e.target.dataset.status !== 'true';
        socket.emit('toggle-afk', wantsToEnable);
        updateToggleButton(e.target, wantsToEnable, 'AFK Modu Aktif', 'AFK Modu Pasif');
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
                options: { channels: copyChannels, roles: copyRoles, emojis: copyEmojis }
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
    
    socket.on('spam-status-change', (isActive) => {
        const spamBtn = document.getElementById('spam-btn');
        updateToggleButton(spamBtn, isActive, "Spam'ı Durdur", "Spam'ı Başlat");
    });
    
    socket.on('streamer-bots-list', renderStreamerBots);
    socket.on('streamer-status-update', renderStreamerBots);

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = link.hash; });
    });
    window.addEventListener('hashchange', () => switchPage(window.location.hash));

    switchPage(window.location.hash || '#home');
});
                                                                              
