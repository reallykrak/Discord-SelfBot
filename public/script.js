document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const mainContent = document.getElementById('main-content');
    const toastContainer = document.getElementById('toast-container');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    
    // --- YENİ EKLENEN MOBİL MENÜ KODLARI ---
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    const appContainer = document.getElementById('app-container');
    const mainContentWrapper = document.getElementById('main-content-wrapper');

    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            appContainer.classList.toggle('menu-open');
        });
    }

    // Mobilde bir linke tıklayınca menüyü kapat
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 992 && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                appContainer.classList.remove('menu-open');
            }
        });
    });

    // Mobilde içerik alanına tıklayınca menüyü kapat
    if (mainContentWrapper) {
         mainContentWrapper.addEventListener('click', (e) => {
            if (window.innerWidth <= 992 && sidebar.classList.contains('open') && !e.target.closest('#sidebar')) {
                sidebar.classList.remove('open');
                appContainer.classList.remove('menu-open');
            }
         });
    }
    // --- MOBİL MENÜ KODLARI BİTİŞİ ---

    let botInfo = {};
    let allCommands = []; // Tüm komutları saklamak için
    
    const templates = {
        home: document.getElementById('home-template')?.innerHTML,
        commands: document.getElementById('commands-template')?.innerHTML,
        bot: document.getElementById('bot-template')?.innerHTML,
        streamer: document.getElementById('streamer-template')?.innerHTML,
        profile: document.getElementById('profile-template')?.innerHTML,
        messaging: document.getElementById('messaging-template')?.innerHTML,
        tools: document.getElementById('tools-template')?.innerHTML,
        webhook: document.getElementById('webhook-template')?.innerHTML, // YENİ
        raid: document.getElementById('raid-template')?.innerHTML,
        "server-copy": document.getElementById('server-copy-template')?.innerHTML,
        "troll-group": document.getElementById('troll-group-template')?.innerHTML,
        account: document.getElementById('account-template')?.innerHTML,
    };
    
    // Arka plan müziği kodları kasmaya neden olduğu için kaldırıldı.

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

        // toggle-switch class'ı olmayan butonların metnini değiştir
        if (!button.classList.contains('toggle-switch')) {
             button.textContent = isActive ? activeText : inactiveText;
             // Yeni tasarıma uygun class ekleme/çıkarma
             button.classList.toggle('btn-danger', isActive); // Durdur butonu kırmızı olsun
             button.classList.toggle('btn-success', !isActive); // Başlat butonu yeşil olsun (Opsiyonel, duruma göre ayarlanabilir)
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
            mainContent.innerHTML = `<div class="card"><h3 class="text-error">Sayfa Yüklenemedi</h3><p>'${page}' adlı sayfanın içeriği bulunamadı. Lütfen script.js dosyasını kontrol edin.</p></div>`;
            return;
        }
        
        mainContent.innerHTML = templates[page];
        updateDynamicContent(); 
        addEventListenersForPage(page);

        if (page === 'streamer') {
            socket.emit('get-streamer-bots');
        }
        if (page === 'commands') {
            socket.emit('get-commands');
        }
        
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${page}`);
        });
    };
    
    // Tüm event listener'lar ID'ler üzerinden çalıştığı için sorunsuz çalışmaya devam eder.
    const addEventListenersForPage = (page) => {
        switch (page) {
            case 'home':
                document.getElementById('toggle-afk')?.addEventListener('click', handleAfkToggle);
                document.getElementById('kill-selfbot-btn')?.addEventListener('click', () => {
                    if (confirm('Paneli tamamen durdurmak istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
                        socket.emit('panel:kill');
                    }
                });
                break;
            case 'commands':
                document.getElementById('command-search-input')?.addEventListener('input', handleCommandSearch);
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
                // Diğer ses butonları (mute, deafen) için ID'ler HTML'de olmadığı için listener eklenmedi.
                break;
            case 'webhook': // YENİ
                document.getElementById('send-webhook-btn')?.addEventListener('click', handleSendWebhook);
                // Webhook timestamp toggle butonu için listener
                document.getElementById('webhook-embed-timestamp')?.addEventListener('click', (e) => {
                    const button = e.target.closest('.toggle-switch');
                    if(button) {
                        const isActive = button.dataset.status !== 'true';
                        updateToggleButton(button, isActive);
                    }
                });
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
    socket.on('command-list', (commands) => {
        allCommands = commands;
        renderCommands(allCommands);
    });

    // YENİ: Ana sayfa istatistiklerini güncelle
    socket.on('system-stats', (data) => {
        const serversEl = document.getElementById('dash-servers');
        const pingEl = document.getElementById('dash-ping');
        const uptimeEl = document.getElementById('dash-uptime');

        if (serversEl) serversEl.textContent = data.servers || '...';
        if (pingEl) pingEl.textContent = `${data.ping || '...'}ms`;
        
        if (uptimeEl) {
            const s = data.uptime;
            const d = Math.floor(s / (3600*24));
            const h = Math.floor(s % (3600*24) / 3600);
            const m = Math.floor(s % 3600 / 60);
            
            uptimeEl.textContent = `${d}g ${h}s ${m}d`;
        }
    });
    
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
        // Eski ana sayfa elemanları
        const userTag = document.getElementById('user-tag');
        const userId = document.getElementById('user-id');
        const userAvatar = document.getElementById('user-avatar');

        if (botInfo.tag && userTag) userTag.textContent = botInfo.tag;
        if (botInfo.id && userId) userId.textContent = botInfo.id;
        if (botInfo.avatar && userAvatar) userAvatar.src = botInfo.avatar;
        
        // YENİ: Yeni ana sayfa dashboard elemanları
        const dashUserTag = document.getElementById('dash-user-tag');
        const dashServers = document.getElementById('dash-servers');
        
        if (botInfo.tag && dashUserTag) dashUserTag.textContent = botInfo.tag;
        if (botInfo.servers && dashServers) dashServers.textContent = botInfo.servers;
    };
    
    function renderCommands(commandsToRender) {
        const container = document.getElementById('command-list-container');
        if (!container) return;

        if (commandsToRender.length === 0) {
            container.innerHTML = '<p>Aramanızla eşleşen komut bulunamadı.</p>';
            return;
        }

        container.innerHTML = '';
        commandsToRender.forEach(cmd => {
            const commandDiv = document.createElement('div');
            commandDiv.className = 'command-item';
            commandDiv.innerHTML = `
                <strong>.${cmd.name}</strong>
                <p>${cmd.desc}</p>
            `;
            container.appendChild(commandDiv);
        });
    }

    function handleCommandSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const filteredCommands = allCommands.filter(cmd => 
            cmd.name.toLowerCase().includes(searchTerm) || 
            cmd.desc.toLowerCase().includes(searchTerm)
        );
        renderCommands(filteredCommands);
    }

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
            
            const botCard = document.createElement('div');
            botCard.className = 'streamer-bot-card';
            
            botCard.innerHTML = `
                <div class="streamer-bot-info">
                    <img src="${bot.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}">
                    <div>
                        <strong>${bot.tag || 'Çevrimdışı'}</strong>
                        <p style="color: ${statusColor};">${bot.statusText || 'Durduruldu'}</p>
                    </div>
                </div>
                <div class="streamer-bot-actions">
                    <button class="btn-success" data-action="start-stream" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Yayın Başlat</button>
                    <button data-action="start-camera" data-token="${bot.token}" ${isOnline ? 'disabled' : ''}>Kamera Aç</button>
                    <button class="btn-danger" data-action="stop-stream" data-token="${bot.token}" ${!isOnline ? 'disabled' : ''}>Durdur</button>
                </div>
            `;
            container.appendChild(botCard);
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

    // GÜNCELLENDİ: Gelişmiş RPC verilerini topla
    function handleChangeStatus() {
        const data = {
            status: document.getElementById('status-type').value,
            activity: {
                name: document.getElementById('activity-text').value,
                type: document.getElementById('activity-type').value,
                url: document.getElementById('streaming-url').value,
                // Yeni RPC alanları
                details: document.getElementById('rpc-details').value,
                state: document.getElementById('rpc-state').value,
                largeImageKey: document.getElementById('rpc-large-image-key').value,
                largeImageText: document.getElementById('rpc-large-image-text').value,
                smallImageKey: document.getElementById('rpc-small-image-key').value,
                smallImageText: document.getElementById('rpc-small-image-text').value,
                button1_label: document.getElementById('rpc-btn1-label').value,
                button1_url: document.getElementById('rpc-btn1-url').value,
                button2_label: document.getElementById('rpc-btn2-label').value,
                button2_url: document.getElementById('rpc-btn2-url').value,
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

    // YENİ: Webhook gönderici
    function handleSendWebhook() {
        const url = document.getElementById('webhook-url').value;
        const username = document.getElementById('webhook-username').value;
        const avatarURL = document.getElementById('webhook-avatar').value;
        const content = document.getElementById('webhook-content').value;

        // Embed verilerini topla
        const embed = {};
        const title = document.getElementById('webhook-embed-title').value;
        if (title) embed.title = title;
        
        const urlLink = document.getElementById('webhook-embed-url').value;
        if (urlLink) embed.url = urlLink;
        
        const description = document.getElementById('webhook-embed-description').value;
        if (description) embed.description = description;
        
        const color = document.getElementById('webhook-embed-color').value;
        if (color) embed.color = color;
        
        const image = document.getElementById('webhook-embed-image').value;
        if (image) embed.image = { url: image };
        
        const thumbnail = document.getElementById('webhook-embed-thumbnail').value;
        if (thumbnail) embed.thumbnail = { url: thumbnail };
        
        const footerText = document.getElementById('webhook-embed-footer-text').value;
        const footerIcon = document.getElementById('webhook-embed-footer-icon').value;
        if (footerText) embed.footer = { text: footerText, icon_url: footerIcon || undefined };
        
        const timestamp = document.getElementById('webhook-embed-timestamp').dataset.status === 'true';
        if (timestamp) embed.timestamp = new Date().toISOString();

        const payload = {
            url,
            username,
            avatarURL,
            content,
            embeds: (Object.keys(embed).length > 0) ? [embed] : []
        };
        
        if (!url) return showToast('Webhook URL\'si zorunludur.', 'error');
        if (!content && payload.embeds.length === 0) return showToast('Gönderilecek bir mesaj veya embed girmelisiniz.', 'error');
        
        socket.emit('send-webhook', payload);
    }

    // Başlangıç sayfası
    switchPage(window.location.hash);
    window.addEventListener('hashchange', () => switchPage(window.location.hash));
});
