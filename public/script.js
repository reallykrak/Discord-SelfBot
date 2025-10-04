document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const mainContent = document.getElementById('main-content');
    const toastContainer = document.getElementById('toast-container');
    const statusLight = document.querySelector('.status-light');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    const tokenModal = document.getElementById('token-modal');
    
    // TEMPLATES
    const templates = {
        home: document.getElementById('home-template').innerHTML,
        streamer: document.getElementById('streamer-template').innerHTML,
        profile: document.getElementById('profile-template').innerHTML,
        messaging: document.getElementById('messaging-template').innerHTML,
        tools: document.getElementById('tools-template').innerHTML,
        account: document.getElementById('account-template').innerHTML,
    };

    // --- HELPER FUNCTIONS ---
    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.5s forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, 4000);
    };

    const updateToggleButton = (button, isActive, activeText, inactiveText) => {
        if (!button) return;
        button.dataset.status = isActive ? 'true' : 'false';
        button.textContent = isActive ? activeText : inactiveText;
        button.classList.toggle('active', isActive);
    };

    // --- PAGE SWITCHING LOGIC ---
    const switchPage = (hash) => {
        const page = hash.substring(1) || 'home';
        if (!templates[page]) return;

        const oldSection = mainContent.querySelector('.content-section');
        if (oldSection) {
            oldSection.style.animation = 'fadeOut 0.3s forwards';
            oldSection.addEventListener('animationend', () => {
                renderPage(page);
            }, { once: true });
        } else {
            renderPage(page);
        }

        navLinks.forEach(link => link.classList.toggle('active', link.hash === `#${page}`));
    };

    const renderPage = (page) => {
        mainContent.innerHTML = templates[page];
        addEventListenersForPage(page);
        updateDynamicContent(); // Update user info if page has it
    };

    // --- EVENT LISTENERS ---
    const addEventListenersForPage = (page) => {
        switch (page) {
            case 'home':
                document.getElementById('toggle-afk')?.addEventListener('click', handleAfkToggle);
                break;
            case 'streamer':
                document.getElementById('toggle-stream-btn')?.addEventListener('click', () => handleStreamToggle('stream'));
                document.getElementById('toggle-camera-btn')?.addEventListener('click', () => handleStreamToggle('camera'));
                break;
            case 'profile':
                 document.getElementById('change-avatar-btn')?.addEventListener('click', handleChangeAvatar);
                 document.getElementById('change-status-btn')?.addEventListener('click', handleChangeStatus);
                break;
            case 'messaging':
                document.getElementById('send-dm-btn')?.addEventListener('click', handleSendDm);
                document.getElementById('start-dm-clean-btn')?.addEventListener('click', handleDmClean);
                document.getElementById('spam-btn')?.addEventListener('click', handleSpamToggle);
                break;
            case 'tools':
                document.getElementById('ghost-ping-btn')?.addEventListener('click', handleGhostPing);
                document.getElementById('start-typing-btn')?.addEventListener('click', handleTypingToggle);
                break;
            case 'account':
                document.getElementById('switch-account-btn')?.addEventListener('click', handleSwitchAccount);
                document.getElementById('show-token-guide')?.addEventListener('click', () => tokenModal.style.display = 'flex');
                break;
        }
    };

    // --- DYNAMIC CONTENT & STATE ---
    let botInfo = {};
    const updateDynamicContent = () => {
        if (!botInfo.id) return;
        const userAvatar = document.getElementById('user-avatar');
        const userTag = document.getElementById('user-tag');
        const userId = document.getElementById('user-id');

        if (userAvatar) userAvatar.src = botInfo.avatar;
        if (userTag) userTag.textContent = botInfo.tag;
        if (userId) userId.textContent = botInfo.id;
    };


    // --- EVENT HANDLERS ---
    const handleAfkToggle = (e) => {
        const newStatus = e.target.dataset.status !== 'true';
        socket.emit('toggle-afk', newStatus);
        updateToggleButton(e.target, newStatus, 'Aktif', 'Pasif');
    };
    
    const handleStreamToggle = (type) => {
        const input = document.getElementById(type === 'stream' ? 'stream-voice-channel-id' : 'camera-voice-channel-id');
        const button = document.getElementById(type === 'stream' ? 'toggle-stream-btn' : 'toggle-camera-btn');
        const channelId = input.value;
        if (!channelId) return showToast('Lütfen bir ses kanalı ID\'si girin.', 'error');
        const wantsToStart = button.dataset.status !== 'true';
        socket.emit('toggle-stream', { channelId, status: wantsToStart, type });
    };
    
    const handleChangeAvatar = () => {
        const url = document.getElementById('avatar-url').value;
        if (!url) return showToast('Lütfen bir URL girin.', 'error');
        socket.emit('change-avatar', url);
    };

    const handleChangeStatus = () => {
        const data = {
            activityType: document.getElementById('status-type').value,
            activityName: document.getElementById('status-name').value,
            customStatus: document.getElementById('custom-status').value,
            applicationId: document.getElementById('status-app-id').value,
            largeImageKey: document.getElementById('status-large-image').value,
            largeImageText: document.getElementById('status-large-text').value,
            smallImageKey: document.getElementById('status-small-image').value,
            smallImageText: document.getElementById('status-small-text').value
        };
        socket.emit('change-status', data);
    };
    
    const handleSendDm = () => {
        const data = { 
            userId: document.getElementById('dm-user-id').value, 
            content: document.getElementById('dm-content').value 
        };
        if (!data.userId || !data.content) return showToast('Lütfen kullanıcı ID ve mesaj girin.', 'error');
        socket.emit('send-dm', data);
    };
    
    const handleDmClean = () => {
        const userId = document.getElementById('dm-cleaner-user-id').value;
        if (!userId) return showToast('Lütfen bir kullanıcı ID\'si girin.', 'error');
        if (confirm(`Emin misiniz? Bu kullanıcıyla olan tüm mesajlarınız kalıcı olarak silinecek.`)) {
            socket.emit('clean-dm', { userId });
        }
    };
    
    const handleSpamToggle = (e) => {
        const isSpamming = e.target.dataset.status === 'true';
        const data = {
            token: document.getElementById('spammer-token').value,
            userId: document.getElementById('spammer-user-id').value,
            message: document.getElementById('spammer-message').value,
            ping: document.getElementById('spammer-ping').checked
        };
        if (!isSpamming && (!data.token || !data.userId || !data.message)) {
            return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
        }
        socket.emit('toggle-spam', data);
    };

    const handleGhostPing = () => {
        const data = {
            channelId: document.getElementById('ghost-channel-id').value,
            userId: document.getElementById('ghost-user-id').value
        };
        if (!data.channelId || !data.userId) return showToast('Kanal ve Kullanıcı ID\'si girin.', 'error');
        socket.emit('ghost-ping', data);
    };
    
    const handleTypingToggle = (e) => {
        const isTyping = e.target.dataset.status === 'true';
        const channelId = document.getElementById('typing-channel-id').value;
        if (!channelId) return showToast('Lütfen bir kanal ID\'si girin.', 'error');
        socket.emit(isTyping ? 'stop-typing' : 'start-typing', channelId);
        updateToggleButton(e.target, !isTyping, 'Durdur', 'Başlat');
    };
    
    const handleSwitchAccount = () => {
        const token = document.getElementById('new-token').value;
        if (!token) return showToast('Lütfen yeni bir token girin.', 'error');
        if (confirm('Emin misiniz? Mevcut oturum kapatılıp yeni token ile giriş yapılacak.')) {
            socket.emit('switch-account', token);
        }
    };


    // --- SOCKET.IO LISTENERS ---
    socket.on('connect', () => {
        statusLight.classList.remove('disconnected');
        connectionStatusText.textContent = 'Bağlanıldı';
    });
    socket.on('disconnect', () => {
        statusLight.classList.add('disconnected');
        connectionStatusText.textContent = 'Bağlantı Kesildi';
        showToast('Bağlantı kesildi!', 'error');
    });
    socket.on('bot-info', (data) => {
        botInfo = data;
        updateDynamicContent();
    });
    socket.on('status-update', ({ message, type }) => showToast(message, type));
    socket.on('stream-status-change', (data) => {
        const streamBtn = document.getElementById('toggle-stream-btn');
        const cameraBtn = document.getElementById('toggle-camera-btn');
        if (data.type === 'camera') {
            updateToggleButton(cameraBtn, data.isActive, 'Kamera Modunu Kapat', 'Kamera Modunu Aç');
            if (data.isActive) updateToggleButton(streamBtn, false, 'Yayını Başlat', 'Yayını Durdur');
        } else if (data.type === 'stream') {
            updateToggleButton(streamBtn, data.isActive, 'Yayını Durdur', 'Yayını Başlat');
            if (data.isActive) updateToggleButton(cameraBtn, false, 'Kamera Modunu Aç', 'Kamera Modunu Kapat');
        }
    });
    socket.on('spam-status-change', (isActive) => {
        const spamBtn = document.getElementById('spam-btn');
        updateToggleButton(spamBtn, isActive, "Spam'ı Durdur", "Spam'ı Başlat");
    });


    // --- INITIALIZATION ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = link.hash; });
    });
    window.addEventListener('hashchange', () => switchPage(window.location.hash));
    
    tokenModal.querySelector('.modal-close').addEventListener('click', () => tokenModal.style.display = 'none');
    tokenModal.addEventListener('click', (e) => { if (e.target === tokenModal) tokenModal.style.display = 'none'; });

    switchPage(window.location.hash || '#home');
});
        
