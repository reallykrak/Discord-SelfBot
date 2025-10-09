document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const mainContent = document.getElementById('main-content');
    const toastContainer = document.getElementById('toast-container');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    const music = document.getElementById('background-music');
    const volumeBtn = document.getElementById('volume-control-btn');
    
    let botInfo = {};
    
    const templates = {
        home: document.getElementById('home-template')?.innerHTML,
        bot: document.getElementById('bot-template')?.innerHTML,
        streamer: document.getElementById('streamer-template')?.innerHTML,
        profile: document.getElementById('profile-template')?.innerHTML,
        messaging: document.getElementById('messaging-template')?.innerHTML,
        tools: document.getElementById('tools-template')?.innerHTML,
        raid: document.getElementById('raid-template')?.innerHTML,
        "server-copy": document.getElementById('server-copy-template')?.innerHTML,
        "troll-group": document.getElementById('troll-group-template')?.innerHTML,
        account: document.getElementById('account-template')?.innerHTML,
    };

    if (volumeBtn && music) {
        volumeBtn.addEventListener('click', () => {
            music.muted = !music.muted;
            const icon = volumeBtn.querySelector('i');
            icon.className = music.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        });
    }

    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.5s ease forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, 4000);
    };

    const updateToggleButton = (button, isActive, activeText, inactiveText) => {
        if (!button) return;
        button.dataset.status = isActive ? 'true' : 'false';
        button.classList.toggle('active', isActive);
        if (!button.classList.contains('toggle-switch')) {
             button.textContent = isActive ? activeText : inactiveText;
        }
    };
    
    const initializeTabs = (container) => {
        const tabNav = container.querySelector('.tab-nav');
        if (!tabNav) return;
        
        const tabButtons = tabNav.querySelectorAll('.tab-btn');
        const tabPanes = container.querySelectorAll('.tab-pane');

        tabNav.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.tab-btn');
            if (!clickedTab) return;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            clickedTab.classList.add('active');
            const targetTabId = 'tab-' + clickedTab.dataset.tab;
            tabPanes.forEach(pane => {
                pane.classList.toggle('active', pane.id === targetTabId);
            });
        });
    };

    const switchPage = (hash) => {
        const page = (hash || '#home').substring(1) || 'home';

        if (!templates[page] || !mainContent) {
            console.error(`'${page}' için template veya ana içerik alanı bulunamadı.`);
            mainContent.innerHTML = `<div class="card"><h3 style="color: var(--error-color);">Sayfa Yüklenemedi</h3><p>'${page}' adlı sayfanın içeriği bulunamadı. Lütfen script.js dosyasını kontrol edin.</p></div>`;
            return;
        }
        
        mainContent.innerHTML = templates[page];
        updateDynamicContent(); 
        addEventListenersForPage(page);

        if (page === 'streamer') {
            socket.emit('get-streamer-bots');
        }
        
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${page}`);
        });
    };
    
    const addEventListenersForPage = (page) => {
        switch (page) {
            case 'home':
                document.getElementById('toggle-afk')?.addEventListener('click', handleAfkToggle);
                break;
            case 'bot':
                document.getElementById('bot-install-btn')?.addEventListener('click', () => socket.emit('bot:install'));
                document.getElementById('bot-start-btn')?.addEventListener('click', () => socket.emit('bot:start'));
                document.getElementById('bot-stop-btn')?.addEventListener('click', () => socket.emit('bot:stop'));
                document.getElementById('bot-command-send-btn')?.addEventListener('click', handleBotCommandSend);
                break;
            case 'streamer':
                document.getElementById('streamer-bots-container')?.addEventListener('click', handleStreamerButtonClick);
                break;
            case 'profile':
                initializeTabs(document.querySelector('#profile .tab-container'));
                document.getElementById('change-status-btn')?.addEventListener('click', handleChangeStatus);
                break;
            case 'messaging':
                initializeTabs(document.querySelector('#messaging .tab-container'));
                document.getElementById('spam-btn')?.addEventListener('click', handleSpamToggle);
                document.getElementById('start-dm-clean-btn')?.addEventListener('click', handleDmClean);
                break;
            case 'tools':
                initializeTabs(document.querySelector('#tools .tab-container'));
                document.getElementById('ghost-ping-btn')?.addEventListener('click', handleGhostPing);
                document.getElementById('voice-join-btn')?.addEventListener('click', () => handleVoiceControl('join'));
                document.getElementById('voice-leave-btn')?.addEventListener('click', () => handleVoiceControl('leave'));
                document.getElementById('voice-play-btn')?.addEventListener('click', () => handleVoiceControl('play'));
                document.getElementById('voice-stop-btn')?.addEventListener('click', () => handleVoiceControl('stop'));
                break;
            case 'raid':
                document.getElementById('start-raid-btn')?.addEventListener('click', handleRaidStart);
                break;
            case 'server-copy':
                document.getElementById('start-copy-btn')?.addEventListener('click', handleServerCopy);
                break;
            case 'troll-group':
                document.getElementById('start-troll-group-btn')?.addEventListener('click', handleStartTrollGroup);
                document.getElementById('stop-troll-group-btn')?.addEventListener('click', () => socket.emit('stop-troll-group'));
                break;
            case 'account':
                document.getElementById('switch-account-btn')?.addEventListener('click', handleSwitchAccount);
                break;
        }
    };
    
    socket.on('connect', () => { if(connectionStatusText) connectionStatusText.textContent = 'Bağlandı'; });
    socket.on('disconnect', () => { if(connectionStatusText) connectionStatusText.textContent = 'Bağlantı Kesildi'; });
    socket.on('bot-info', (data) => { botInfo = data; updateDynamicContent(); });
    socket.on('status-update', ({ message, type }) => showToast(message, type));
    socket.on('spam-status-change', (isActive) => updateToggleButton(document.getElementById('spam-btn'), isActive, "Spam'ı Durdur", "Spam'ı Başlat"));
    socket.on('streamer-status-update', renderStreamerBots);
    
    socket.on('troll-group-status', ({ isActive }) => {
        const startBtn = document.getElementById('start-troll-group-btn');
        const stopBtn = document.getElementById('stop-troll-group-btn');
        if (startBtn) startBtn.disabled = isActive;
        if (stopBtn) stopBtn.disabled = !isActive;
    });

    socket.on('bot:log', (data) => {
        const consoleOutput = document.getElementById('bot-console-output');
        if (consoleOutput) {
            consoleOutput.textContent += data;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    });

    socket.on('bot:status', ({ isRunning }) => {
        const startBtn = document.getElementById('bot-start-btn');
        const stopBtn = document.getElementById('bot-stop-btn');
        const installBtn = document.getElementById('bot-install-btn');
        const cmdInput = document.getElementById('bot-command-input');
        const cmdSendBtn = document.getElementById('bot-command-send-btn');

        if(startBtn) startBtn.disabled = isRunning;
        if(stopBtn) stopBtn.disabled = !isRunning;
        if(installBtn) installBtn.disabled = isRunning;
        if(cmdInput) cmdInput.disabled = !isRunning;
        if(cmdSendBtn) cmdSendBtn.disabled = !isRunning;
    });

    function updateDynamicContent() {
        const userTag = document.getElementById('user-tag');
        const userId = document.getElementById('user-id');
        const userAvatar = document.getElementById('user-avatar');

        if (botInfo.tag && userTag) userTag.textContent = botInfo.tag;
        if (botInfo.id && userId) userId.textContent = botInfo.id;
        if (botInfo.avatar && userAvatar) userAvatar.src = botInfo.avatar;
    };
    
    function handleBotCommandSend() {
        const input = document.getElementById('bot-command-input');
        if (input && input.value) {
            socket.emit('bot:command', input.value);
            input.value = '';
        }
    };
    
    function handleRaidStart() {
        const serverId = document.getElementById('raid-server-id').value;
        const raidName = document.getElementById('raid-name').value;
        const amount = document.getElementById('raid-amount').value;
        if (!serverId || !raidName || !amount) { return showToast('Lütfen tüm Raid alanlarını doldurun.', 'error'); }
        const confirmation = confirm(`'${serverId}' ID'li sunucuya raid başlatmak istediğinizden emin misiniz? BU İŞLEM GERİ ALINAMAZ.`);
        if (confirmation) {
            showToast(`Raid başlatılıyor... Sunucu ID: ${serverId}`, 'warning');
            socket.emit('start-raid', { serverId, raidName, amount: parseInt(amount) });
        }
    };

    function handleStreamerButtonClick(e) {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        const token = button.dataset.token;
        if (action === 'start-stream' || action === 'start-camera') {
            socket.emit('start-streamer', { token, type: (action === 'start-camera') ? 'camera' : 'stream' });
        } else if (action === 'stop-stream') {
            socket.emit('stop-streamer', { token });
        }
    };

    function renderStreamerBots(bots) {
        const container = document.getElementById('streamer-bots-container');
        if (!container) return;
        container.innerHTML = bots.length > 0 ? '' : '<p>Config dosyasında yönetilecek bot bulunamadı.</p>';
        bots.forEach(bot => {
            const isOnline = bot.status === 'online';
            const statusColor = isOnline ? 'var(--success-color)' : 'var(--text-muted-color)';
            const botCardHTML = `
                <div class="card" style="flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 1rem; min-width: 250px; flex-grow: 1;">
                        <img src="${bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 40px; height: 40px; border-radius: 50%;">
                        <div>
                            <strong style="white-space: nowrap;">${bot.tag || 'Çevrimdışı'}</strong>
                            <p style="font-size: 0.8em; color: ${statusColor};">${bot.statusText || 'Durduruldu'}</p>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; min-width: 150px;">
                        <button style="border-color: var(--success-color);" data-action="start-stream" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Yayın Başlat</button>
                        <button style="border-color: var(--primary-color);" data-action="start-camera" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Kamera Aç</button>
                        <button style="border-color: var(--error-color);" data-action="stop-stream" data-token="${bot.token}" ${!isOnline ? 'disabled' : ''}>Durdur</button>
                    </div>
                </div>
            `;
            container.innerHTML += botCardHTML;
        });
    };

    function handleVoiceControl(action) {
        const channelIdInput = document.getElementById('voice-channel-id');
        const channelId = channelIdInput ? channelIdInput.value : null;
        socket.emit('voice-control', { action, channelId });
    };

    function handleAfkToggle(e) {
        const button = e.target.closest('.toggle-switch');
        if (!button) return;
        const wantsToEnable = button.dataset.status !== 'true';
        socket.emit('toggle-afk', wantsToEnable);
        updateToggleButton(button, wantsToEnable);
    };

    function handleChangeStatus() {
        const data = {
            status: document.getElementById('status-type').value,
            activity: {
                name: document.getElementById('activity-text').value,
                type: document.getElementById('activity-type').value,
                url: document.getElementById('streaming-url').value,
                applicationId: document.getElementById('presence-app-id').value,
                details: document.getElementById('presence-details').value,
                state: document.getElementById('presence-state').value,
                largeImageKey: document.getElementById('presence-large-key').value,
                largeImageText: document.getElementById('presence-large-text').value,
                smallImageKey: document.getElementById('presence-small-key').value,
                smallImageText: document.getElementById('presence-small-text').value,
            },
        };
        socket.emit('change-status', data);
    };

    function handleGhostPing() {
        const channelId = document.getElementById('ghost-ping-channel-id').value;
        const userId = document.getElementById('ghost-ping-user-id').value;
        if (channelId && userId) socket.emit('ghost-ping', { channelId, userId });
    };

    function handleSwitchAccount() {
        const token = document.getElementById('new-token').value;
        if (token) socket.emit('switch-account', token);
    };

    function handleDmClean() {
        const userId = document.getElementById('clean-dm-user-id').value;
        if (userId) socket.emit('clean-dm', { userId });
    };

    function handleSpamToggle(e) {
        const button = e.target.closest('button');
        if (!button) return;
        const isSpamming = button.dataset.status === 'true';
        
        const data = {
            token: document.getElementById('spammer-token').value,
            userId: document.getElementById('spammer-user-id').value,
            message: document.getElementById('spammer-message').value,
            delay: document.getElementById('spammer-delay').value,
            isSpamming: isSpamming
        };
    
        if (!isSpamming) {
            if (!data.token || !data.userId || !data.message) return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
            if (!data.delay || parseInt(data.delay) < 500) return showToast('API limitlerini önlemek için gecikme en az 500ms olmalıdır.', 'error');
        }

        socket.emit('toggle-spam', data);
    };
    
    function handleServerCopy() {
        const sourceGuildId = document.getElementById('source-guild-id').value;
        const newServerName = document.getElementById('new-guild-name').value;
        if (!sourceGuildId || !newServerName) {
            return showToast('Lütfen tüm alanları doldurun.', 'error');
        }
        socket.emit('server-copy', { sourceGuildId, newServerName });
    }

    function handleStartTrollGroup() {
        const userIds = [
            document.getElementById('troll-user-1').value,
            document.getElementById('troll-user-2').value,
            document.getElementById('troll-user-3').value,
        ];
        if (!userIds[0] || !userIds[1]) {
            return showToast('Lütfen en az ilk 2 kişi ID\'sini girin.', 'error');
        }
        socket.emit('start-troll-group', { userIds });
    }

    switchPage(window.location.hash);
    window.addEventListener('hashchange', () => switchPage(window.location.hash));
});
