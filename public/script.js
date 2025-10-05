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
        home: document.getElementById('home-template').innerHTML,
        bot: document.getElementById('bot-template')?.innerHTML,
        owo: document.getElementById('owo-template')?.innerHTML,
        streamer: document.getElementById('streamer-template').innerHTML,
        profile: document.getElementById('profile-template')?.innerHTML,
        messaging: document.getElementById('messaging-template')?.innerHTML,
        tools: document.getElementById('tools-template')?.innerHTML,
        raid: document.getElementById('raid-template')?.innerHTML,
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
    }

    const switchPage = (hash) => {
        const page = hash.substring(1) || 'home';
        if (!templates[page]) return;
        
        mainContent.innerHTML = templates[page];
        updateDynamicContent();
        addEventListenersForPage(page);

        if (page === 'streamer') socket.emit('get-streamer-bots');
        
        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${page}`));
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
            case 'owo':
                document.getElementById('owo-setup-btn')?.addEventListener('click', () => {
                    const repoUrl = document.getElementById('owo-repo-url').value;
                    if (repoUrl) socket.emit('owo:setup', { repoUrl });
                    else showToast('Lütfen bir GitHub repository URLsi girin.', 'error');
                });
                document.getElementById('owo-install-btn')?.addEventListener('click', () => socket.emit('owo:install'));
                document.getElementById('owo-start-btn')?.addEventListener('click', () => socket.emit('owo:start'));
                document.getElementById('owo-stop-btn')?.addEventListener('click', () => socket.emit('owo:stop'));
                document.getElementById('owo-load-file-btn')?.addEventListener('click', () => {
                    const filename = document.getElementById('owo-filename').value;
                    if (filename) socket.emit('owo:getfile', { filename });
                });
                document.getElementById('owo-save-file-btn')?.addEventListener('click', () => {
                    const filename = document.getElementById('owo-filename').value;
                    const content = document.getElementById('owo-file-content').value;
                    if (filename) socket.emit('owo:savefile', { filename, content });
                });
                break;
            case 'streamer':
                document.getElementById('streamer-bots-container')?.addEventListener('click', handleStreamerButtonClick);
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
                initializeTabs(document.getElementById('tools'));
                document.getElementById('ghost-ping-btn')?.addEventListener('click', handleGhostPing);
                document.getElementById('start-typing-btn')?.addEventListener('click', handleTyping('start'));
                document.getElementById('stop-typing-btn')?.addEventListener('click', handleTyping('stop'));
                document.getElementById('voice-join-btn')?.addEventListener('click', () => handleVoiceControl('join'));
                document.getElementById('voice-leave-btn')?.addEventListener('click', () => handleVoiceControl('leave'));
                document.getElementById('voice-play-btn')?.addEventListener('click', () => handleVoiceControl('play'));
                document.getElementById('voice-stop-btn')?.addEventListener('click', () => handleVoiceControl('stop'));
                document.getElementById('voice-mute-btn')?.addEventListener('click', () => handleVoiceControl('mute'));
                document.getElementById('voice-deafen-btn')?.addEventListener('click', () => handleVoiceControl('deafen'));
                break;
            case 'raid':
                document.getElementById('start-raid-btn')?.addEventListener('click', handleRaidStart);
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
    
    const setupConsole = (logEvent, statusEvent, elements) => {
        socket.on(logEvent, (data) => {
            const consoleOutput = document.getElementById(elements.console);
            if (consoleOutput) {
                consoleOutput.textContent += data;
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        });

        socket.on(statusEvent, ({ isRunning }) => {
            const startBtn = document.getElementById(elements.start);
            const stopBtn = document.getElementById(elements.stop);
            const installBtn = document.getElementById(elements.install);
            if (startBtn && stopBtn) {
                startBtn.disabled = isRunning;
                stopBtn.disabled = !isRunning;
                if(installBtn) installBtn.disabled = isRunning;
                if(elements.commandInput) document.getElementById(elements.commandInput).disabled = !isRunning;
                if(elements.commandBtn) document.getElementById(elements.commandBtn).disabled = !isRunning;
                if(elements.setup) document.getElementById(elements.setup).disabled = isRunning;
            }
        });
    };

    setupConsole('bot:log', 'bot:status', {
        console: 'bot-console-output', start: 'bot-start-btn', stop: 'bot-stop-btn',
        install: 'bot-install-btn', commandInput: 'bot-command-input', commandBtn: 'bot-command-send-btn'
    });
    setupConsole('owo:log', 'owo:status', {
        console: 'owo-console-output', start: 'owo-start-btn', stop: 'owo-stop-btn',
        install: 'owo-install-btn', setup: 'owo-setup-btn'
    });

    socket.on('owo:filecontent', ({ content }) => {
        const fileContentEl = document.getElementById('owo-file-content');
        if (fileContentEl) fileContentEl.value = content;
        showToast('Dosya içeriği başarıyla yüklendi.', 'success');
    });
    
    navLinks.forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = link.hash; }));
    window.addEventListener('hashchange', () => switchPage(window.location.hash));
    switchPage(window.location.hash || '#home');

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
    
    const handleBotCommandSend = () => {
        const input = document.getElementById('bot-command-input');
        if (input && input.value) {
            socket.emit('bot:command', input.value);
            input.value = '';
        }
    };
    
    const handleRaidStart = () => {
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

    const handleStreamerButtonClick = (e) => {
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

    const renderStreamerBots = (bots) => {
        const container = document.getElementById('streamer-bots-container');
        if (!container) return;
        container.innerHTML = bots.length > 0 ? '' : '<p>Config dosyasında yönetilecek bot bulunamadı.</p>';
        bots.forEach(bot => {
            const isOnline = bot.status === 'online';
            const statusColor = isOnline ? 'var(--success-color)' : 'var(--text-muted-color)';
            const botCard = `
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
                </div>`;
            container.innerHTML += botCard;
        });
    };

    const handleVoiceControl = (action) => {
        const channelId = document.getElementById('voice-channel-id')?.value;
        socket.emit('voice-control', { action, channelId });
    };

    const handleAfkToggle = (e) => {
        const button = e.target.closest('.toggle-switch');
        const wantsToEnable = button.dataset.status !== 'true';
        socket.emit('toggle-afk', wantsToEnable);
        updateToggleButton(button, wantsToEnable);
    };

    const handleChangeAvatar = () => {
        const url = document.getElementById('avatar-url').value;
        if (url) socket.emit('change-avatar', url);
    };

    const handleChangeStatus = () => {
        const data = {
            status: document.getElementById('status-type').value,
            activity: {
                name: document.getElementById('activity-text').value,
                type: document.getElementById('activity-type').value,
                url: document.getElementById('streaming-url').value,
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

    const handleSpamToggle = (e) => {
        const isSpamming = e.target.dataset.status === 'true';
        const data = {
            token: document.getElementById('spammer-token').value,
            userId: document.getElementById('spammer-user-id').value,
            message: document.getElementById('spammer-message').value,
            delay: document.getElementById('spammer-delay').value,
        };
        if (!isSpamming) {
            if (!data.token || !data.userId || !data.message) return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
            if (!data.delay || parseInt(data.delay) < 500) return showToast('API limitlerini önlemek için gecikme en az 500ms olmalıdır.', 'error');
        }
        socket.emit('toggle-spam', data);
    };
});
                   
