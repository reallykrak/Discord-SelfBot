document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Elementler ---
    const toastContainer = document.getElementById('toast-container');
    const statusLight = document.querySelector('.status-light');
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    const botAvatar = document.getElementById('bot-avatar');
    const botUsername = document.getElementById('bot-username');
    const userAvatar = document.getElementById('user-avatar');
    const userTag = document.getElementById('user-tag');
    const afkButton = document.getElementById('toggle-afk');
    const avatarUrlInput = document.getElementById('avatar-url');
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    const statusTypeSelect = document.getElementById('status-type');
    const statusNameInput = document.getElementById('status-name');
    const customStatusInput = document.getElementById('custom-status');
    const changeStatusBtn = document.getElementById('change-status-btn');
    const dmUserIdInput = document.getElementById('dm-user-id');
    const dmContentInput = document.getElementById('dm-content');
    const sendDmBtn = document.getElementById('send-dm-btn');
    const spamBtn = document.getElementById('spam-btn');
    const spammerTokenInput = document.getElementById('spammer-token');
    const spammerUserIdInput = document.getElementById('spammer-user-id');
    const spammerMessageInput = document.getElementById('spammer-message');
    const spammerPingCheckbox = document.getElementById('spammer-ping');
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const newTokenInput = document.getElementById('new-token');
    const ghostPingBtn = document.getElementById('ghost-ping-btn');
    const ghostChannelIdInput = document.getElementById('ghost-channel-id');
    const ghostUserIdInput = document.getElementById('ghost-user-id');
    const startTypingBtn = document.getElementById('start-typing-btn');
    const typingChannelIdInput = document.getElementById('typing-channel-id');
    const startStreamBtn = document.getElementById('start-stream-btn');
    const stopStreamBtn = document.getElementById('stop-stream-btn');
    const streamChannelIdInput = document.getElementById('stream-voice-channel-id');
    const streamFileInput = document.getElementById('stream-file-name');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const cameraChannelIdInput = document.getElementById('camera-voice-channel-id');

    // --- Fonksiyonlar ---
    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };

    const switchPage = (hash) => {
        navLinks.forEach(link => link.classList.toggle('active', link.hash === hash));
        contentSections.forEach(section => section.classList.toggle('active', `#${section.id}` === hash));
    };

    // --- Soket Olayları ---
    socket.on('connect', () => statusLight.classList.remove('disconnected'));
    socket.on('disconnect', () => {
        statusLight.classList.add('disconnected');
        showToast('Bağlantı kesildi!', 'error');
    });
    socket.on('bot-info', (data) => {
        botAvatar.src = data.avatar;
        userAvatar.src = data.avatar;
        botUsername.textContent = data.username;
        userTag.textContent = data.tag;
    });
    socket.on('status-update', ({ message, type }) => showToast(message, type));
    socket.on('spam-status-change', (isSpamming) => {
        spamBtn.dataset.status = isSpamming;
        spamBtn.textContent = isSpamming ? "Spam'ı Durdur" : "Spam'ı Başlat";
        spamBtn.classList.toggle('active', isSpamming);
    });
    socket.on('camera-status-change', (isStreaming) => {
        toggleCameraBtn.dataset.status = isStreaming;
        toggleCameraBtn.textContent = isStreaming ? "Fake Kamerayı Kapat" : "Fake Kamerayı Aç";
        toggleCameraBtn.classList.toggle('active', isStreaming);
    });

    // --- Olay Dinleyicileri ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = link.hash;
            switchPage(link.hash);
        });
    });
    switchPage(window.location.hash || '#home');

    afkButton.addEventListener('click', () => {
        const newStatus = afkButton.dataset.status !== 'true';
        socket.emit('toggle-afk', newStatus);
        afkButton.dataset.status = newStatus;
        afkButton.textContent = newStatus ? 'Aktif' : 'Pasif';
        afkButton.classList.toggle('active', newStatus);
    });
    
    changeAvatarBtn.addEventListener('click', () => {
        const url = avatarUrlInput.value;
        if(!url) return showToast('Lütfen bir URL girin.', 'error');
        socket.emit('change-avatar', url);
    });

    changeStatusBtn.addEventListener('click', () => {
        const activityType = statusTypeSelect.value;
        const activityName = statusNameInput.value;
        const customStatus = customStatusInput.value;
        if (!activityName && !customStatus) return showToast('Lütfen bir aktivite adı veya özel durum girin.', 'error');
        socket.emit('change-status', { activityType, activityName, customStatus });
    });
    
    startStreamBtn.addEventListener('click', () => {
        const channelId = streamChannelIdInput.value;
        const fileName = streamFileInput.value;
        if(!channelId || !fileName) return showToast('Lütfen kanal ID ve dosya adını girin.', 'error');
        socket.emit('start-stream', { channelId, fileName });
    });

    stopStreamBtn.addEventListener('click', () => socket.emit('stop-stream'));
    
    toggleCameraBtn.addEventListener('click', () => {
        const channelId = cameraChannelIdInput.value;
        if(!channelId) return showToast('Lütfen kameranın açılacağı ses kanalı ID\'sini girin.', 'error');
        const newStatus = toggleCameraBtn.dataset.status !== 'true';
        socket.emit('toggle-camera', { channelId, status: newStatus });
    });

    sendDmBtn.addEventListener('click', () => {
        const userId = dmUserIdInput.value;
        const content = dmContentInput.value;
        if (!userId || !content) return showToast('Lütfen kullanıcı ID ve mesaj girin.', 'error');
        socket.emit('send-dm', { userId, content });
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
        const channelId = ghostChannelIdInput.value;
        const userId = ghostUserIdInput.value;
        if (!channelId || !userId) return showToast('Kanal ve Kullanıcı ID\'si girin.', 'error');
        socket.emit('ghost-ping', { channelId, userId });
    });

    startTypingBtn.addEventListener('click', () => {
        const isTyping = startTypingBtn.dataset.status === 'true';
        const channelId = typingChannelIdInput.value;
        if (!channelId) return showToast('Lütfen bir kanal ID\'si girin.', 'error');
        socket.emit(isTyping ? 'stop-typing' : 'start-typing', channelId);
        const newStatus = !isTyping;
        startTypingBtn.dataset.status = newStatus;
        startTypingBtn.textContent = newStatus ? 'Durdur' : 'Başlat';
        startTypingBtn.classList.toggle('active', newStatus);
    });

    switchAccountBtn.addEventListener('click', () => {
        const token = newTokenInput.value;
        if (!token) return showToast('Lütfen yeni bir token girin.', 'error');
        if (confirm('Emin misiniz? Mevcut oturum kapatılıp yeni token ile giriş yapılacak.')) {
            socket.emit('switch-account', token);
        }
    });

    // Sayfa ilk yüklendiğinde butonların varsayılan durumunu ayarla
    afkButton.classList.toggle('active', afkButton.dataset.status === 'true');
});
        
