document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const toastContainer = document.getElementById('toast-container');
    const statusLight = document.querySelector('.status-light');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    
    // Bot Info
    const userAvatar = document.getElementById('user-avatar');
    const userTag = document.getElementById('user-tag');
    const userId = document.getElementById('user-id');
    const afkButton = document.getElementById('toggle-afk');

    // Streamer
    const toggleStreamBtn = document.getElementById('toggle-stream-btn');
    const streamChannelIdInput = document.getElementById('stream-voice-channel-id');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const cameraChannelIdInput = document.getElementById('camera-voice-channel-id');

    // Profile
    const avatarUrlInput = document.getElementById('avatar-url');
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    const statusTypeSelect = document.getElementById('status-type');
    const statusNameInput = document.getElementById('status-name');
    const customStatusInput = document.getElementById('custom-status');
    const changeStatusBtn = document.getElementById('change-status-btn');
    // Rich Presence Inputs
    const statusAppIdInput = document.getElementById('status-app-id');
    const statusLargeImageInput = document.getElementById('status-large-image');
    const statusLargeTextInput = document.getElementById('status-large-text');
    const statusSmallImageInput = document.getElementById('status-small-image');
    const statusSmallTextInput = document.getElementById('status-small-text');

    // Messaging
    const dmUserIdInput = document.getElementById('dm-user-id');
    const dmContentInput = document.getElementById('dm-content');
    const sendDmBtn = document.getElementById('send-dm-btn');
    const spamBtn = document.getElementById('spam-btn');
    const spammerTokenInput = document.getElementById('spammer-token');
    const spammerUserIdInput = document.getElementById('spammer-user-id');
    const spammerMessageInput = document.getElementById('spammer-message');
    const spammerPingCheckbox = document.getElementById('spammer-ping');
    const startDmCleanBtn = document.getElementById('start-dm-clean-btn');
    const dmCleanerUserIdInput = document.getElementById('dm-cleaner-user-id');

    // Tools
    const ghostPingBtn = document.getElementById('ghost-ping-btn');
    const ghostChannelIdInput = document.getElementById('ghost-channel-id');
    const ghostUserIdInput = document.getElementById('ghost-user-id');
    const startTypingBtn = document.getElementById('start-typing-btn');
    const typingChannelIdInput = document.getElementById('typing-channel-id');
    
    // Account
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const newTokenInput = document.getElementById('new-token');
    const showTokenGuideBtn = document.getElementById('show-token-guide');
    const tokenModal = document.getElementById('token-modal');
    const modalCloseBtn = tokenModal.querySelector('.modal-close');

    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };

    const switchPage = (hash) => {
        navLinks.forEach(link => link.classList.toggle('active', link.hash === hash));
        contentSections.forEach(section => {
            const isActive = `#${section.id}` === hash;
            section.style.display = isActive ? 'grid' : 'none';
            if(isActive) section.classList.add('active');
            else section.classList.remove('active');
        });
    };

    const updateToggleButton = (button, isActive, activeText, inactiveText) => {
        button.dataset.status = isActive ? 'true' : 'false';
        button.textContent = isActive ? activeText : inactiveText;
        button.classList.toggle('active', isActive);
    };

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
        userAvatar.src = data.avatar;
        userTag.textContent = data.tag;
        userId.textContent = data.id;
    });

    socket.on('status-update', ({ message, type }) => showToast(message, type));

    socket.on('stream-status-change', (data) => {
        if (data.type === 'camera') {
            updateToggleButton(toggleCameraBtn, data.isActive, 'Kamera Modunu Kapat', 'Kamera Modunu Aç');
            if (data.isActive) updateToggleButton(toggleStreamBtn, false, 'Yayını Başlat', 'Yayını Durdur');
        } else if (data.type === 'stream') {
            updateToggleButton(toggleStreamBtn, data.isActive, 'Yayını Durdur', 'Yayını Başlat');
            if (data.isActive) updateToggleButton(toggleCameraBtn, false, 'Kamera Modunu Aç', 'Kamera Modunu Kapat');
        }
    });

    socket.on('spam-status-change', (isActive) => {
        updateToggleButton(spamBtn, isActive, "Spam'ı Durdur", "Spam'ı Başlat");
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = link.hash; });
    });
    window.addEventListener('hashchange', () => switchPage(window.location.hash || '#home'));
    switchPage(window.location.hash || '#home');

    afkButton.addEventListener('click', () => {
        const newStatus = afkButton.dataset.status !== 'true';
        socket.emit('toggle-afk', newStatus);
        updateToggleButton(afkButton, newStatus, 'Aktif', 'Pasif');
    });
    
    toggleStreamBtn.addEventListener('click', () => {
        const channelId = streamChannelIdInput.value;
        if (!channelId) return showToast('Lütfen bir ses kanalı ID\'si girin.', 'error');
        const wantsToStart = toggleStreamBtn.dataset.status !== 'true';
        socket.emit('toggle-stream', { channelId, status: wantsToStart, type: 'stream' });
    });

    toggleCameraBtn.addEventListener('click', () => {
        const channelId = cameraChannelIdInput.value;
        if (!channelId) return showToast('Lütfen bir ses kanalı ID\'si girin.', 'error');
        const wantsToStart = toggleCameraBtn.dataset.status !== 'true';
        socket.emit('toggle-stream', { channelId, status: wantsToStart, type: 'camera' });
    });

    changeAvatarBtn.addEventListener('click', () => {
        const url = avatarUrlInput.value;
        if(!url) return showToast('Lütfen bir URL girin.', 'error');
        socket.emit('change-avatar', url);
    });

    changeStatusBtn.addEventListener('click', () => {
        const data = {
            activityType: statusTypeSelect.value,
            activityName: statusNameInput.value,
            customStatus: customStatusInput.value,
            applicationId: statusAppIdInput.value,
            largeImageKey: statusLargeImageInput.value,
            largeImageText: statusLargeTextInput.value,
            smallImageKey: statusSmallImageInput.value,
            smallImageText: statusSmallTextInput.value
        };
        socket.emit('change-status', data);
    });
    
    sendDmBtn.addEventListener('click', () => {
        const data = { userId: dmUserIdInput.value, content: dmContentInput.value };
        if (!data.userId || !data.content) return showToast('Lütfen kullanıcı ID ve mesaj girin.', 'error');
        socket.emit('send-dm', data);
    });

    startDmCleanBtn.addEventListener('click', () => {
        const userId = dmCleanerUserIdInput.value;
        if (!userId) return showToast('Lütfen bir kullanıcı ID\'si girin.', 'error');
        if (confirm(`Emin misiniz? Bu kullanıcıyla olan tüm mesajlarınız kalıcı olarak silinecek.`)) {
            socket.emit('clean-dm', { userId });
        }
    });

    spamBtn.addEventListener('click', () => {
        const isSpamming = spamBtn.dataset.status === 'true';
        const data = {
            token: spammerTokenInput.value,
            userId: spammerUserIdInput.value,
            message: spammerMessageInput.value,
            ping: spammerPingCheckbox.checked
        };
        if(!isSpamming && (!data.token || !data.userId || !data.message)) {
            return showToast('Lütfen tüm DM Spammer alanlarını doldurun.', 'error');
        }
        socket.emit('toggle-spam', data);
    });
    
    ghostPingBtn.addEventListener('click', () => {
        const data = { channelId: ghostChannelIdInput.value, userId: ghostUserIdInput.value };
        if (!data.channelId || !data.userId) return showToast('Kanal ve Kullanıcı ID\'si girin.', 'error');
        socket.emit('ghost-ping', data);
    });

    startTypingBtn.addEventListener('click', () => {
        const isTyping = startTypingBtn.dataset.status === 'true';
        const channelId = typingChannelIdInput.value;
        if (!channelId) return showToast('Lütfen bir kanal ID\'si girin.', 'error');
        socket.emit(isTyping ? 'stop-typing' : 'start-typing', channelId);
        updateToggleButton(startTypingBtn, !isTyping, 'Durdur', 'Başlat');
    });

    switchAccountBtn.addEventListener('click', () => {
        const token = newTokenInput.value;
        if (!token) return showToast('Lütfen yeni bir token girin.', 'error');
        if (confirm('Emin misiniz? Mevcut oturum kapatılıp yeni token ile giriş yapılacak.')) {
            socket.emit('switch-account', token);
        }
    });
    
    showTokenGuideBtn.addEventListener('click', () => tokenModal.style.display = 'flex');
    modalCloseBtn.addEventListener('click', () => tokenModal.style.display = 'none');
    tokenModal.addEventListener('click', (e) => { if (e.target === tokenModal) tokenModal.style.display = 'none'; });
});
        
