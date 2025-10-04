document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const statusLight = document.querySelector('.status-light');
    const connectionStatusText = document.getElementById('connection-status-text');
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    
    // Genel
    const userAvatar = document.getElementById('user-avatar');
    const userTag = document.getElementById('user-tag');
    const userId = document.getElementById('user-id');
    const afkButton = document.getElementById('toggle-afk');

    // Yayıncı
    const toggleStreamBtn = document.getElementById('toggle-stream-btn');
    const streamChannelIdInput = document.getElementById('stream-voice-channel-id');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const cameraChannelIdInput = document.getElementById('camera-voice-channel-id');

    // Profil
    const avatarUrlInput = document.getElementById('avatar-url');
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    
    // Hesap
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const newTokenInput = document.getElementById('new-token');

    const showToast = (message, type = 'info') => {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };

    const switchPage = (hash) => {
        navLinks.forEach(link => link.classList.toggle('active', link.hash === hash));
        contentSections.forEach(section => {
            section.classList.toggle('active', `#${section.id}` === hash);
        });
    };

    const updateToggleButton = (button, isActive, activeText, inactiveText) => {
        if (!button) return;
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
        if(data.avatar) userAvatar.src = data.avatar;
        if(data.tag) userTag.textContent = data.tag;
        if(data.id) userId.textContent = data.id;
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

    switchAccountBtn.addEventListener('click', () => {
        const token = newTokenInput.value;
        if (!token) return showToast('Lütfen yeni bir token girin.', 'error');
        if (confirm('Emin misiniz? Mevcut oturum kapatılıp yeni token ile giriş yapılacak.')) {
            socket.emit('switch-account', token);
        }
    });
});
        
