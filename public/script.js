document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Elementler ---
    const toastContainer = document.getElementById('toast-container');
    const statusLight = document.querySelector('.status-light');
    
    // Navigasyon
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    // Ana Sayfa
    const botAvatar = document.getElementById('bot-avatar');
    const botUsername = document.getElementById('bot-username');
    const userAvatar = document.getElementById('user-avatar');
    const userTag = document.getElementById('user-tag');
    const userId = document.getElementById('user-id');
    const userCreated = document.getElementById('user-created');
    const serverCount = document.getElementById('server-count');
    const friendCount = document.getElementById('friend-count');
    const afkButton = document.getElementById('toggle-afk');

    // Durum Değiştirici
    const statusTypeSelect = document.getElementById('status-type');
    const statusNameInput = document.getElementById('status-name');
    const customStatusInput = document.getElementById('custom-status');
    const changeStatusBtn = document.getElementById('change-status-btn');
    
    // Sunucu Kopyalayıcı
    const cloneServerBtn = document.getElementById('clone-server-btn');
    const sourceGuildInput = document.getElementById('source-guild');
    const targetGuildInput = document.getElementById('target-guild');

    // DM Gönderici
    const friendSelect = document.getElementById('friend-select');
    const dmContentInput = document.getElementById('dm-content');
    const sendDmBtn = document.getElementById('send-dm-btn');

    // Webhook Gönderici
    const sendWebhookBtn = document.getElementById('send-webhook-btn');
    const webhookUrlInput = document.getElementById('webhook-url');
    const webhookUsernameInput = document.getElementById('webhook-username');
    const webhookAvatarInput = document.getElementById('webhook-avatar');
    const webhookContentInput = document.getElementById('webhook-content');
    const webhookEmbedTitleInput = document.getElementById('webhook-embed-title');
    const webhookEmbedDescInput = document.getElementById('webhook-embed-desc');
    const webhookEmbedColorInput = document.getElementById('webhook-embed-color');

    // Troll Özellikler
    const ghostPingBtn = document.getElementById('ghost-ping-btn');
    const ghostChannelIdInput = document.getElementById('ghost-channel-id');
    const ghostUserIdInput = document.getElementById('ghost-user-id');
    const startTypingBtn = document.getElementById('start-typing-btn');
    const typingChannelIdInput = document.getElementById('typing-channel-id');
    
    // Hesap Yönetimi
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const newTokenInput = document.getElementById('new-token');


    // --- Fonksiyonlar ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function switchPage(hash) {
        navLinks.forEach(link => link.classList.toggle('active', link.hash === hash));
        contentSections.forEach(section => section.classList.toggle('active', `#${section.id}` === hash));
    }

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
        userId.textContent = `ID: ${data.id}`;
        userCreated.textContent = `Hesap Oluşturma: ${new Date(data.createdAt).toLocaleDateString('tr-TR')}`;
        serverCount.textContent = data.serverCount;
        friendCount.textContent = data.friendCount;
    });

    socket.on('friend-list', (friends) => {
        friendSelect.innerHTML = '<option value="">Arkadaş seç...</option>';
        friends.forEach(friend => {
            const option = document.createElement('option');
            option.value = friend.id;
            option.textContent = friend.tag;
            friendSelect.appendChild(option);
        });
    });

    socket.on('status-update', ({ message, type }) => showToast(message, type));

    // --- Olay Dinleyicileri (Event Listeners) ---

    // Navigasyon
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = link.hash;
            switchPage(link.hash);
        });
    });
    // Sayfa yüklendiğinde doğru sekmeyi aç
    switchPage(window.location.hash || '#home');


    // Ana Sayfa
    afkButton.addEventListener('click', () => {
        const newStatus = afkButton.dataset.status !== 'true';
        socket.emit('toggle-afk', newStatus);
        afkButton.dataset.status = newStatus;
        afkButton.textContent = newStatus ? 'Aktif' : 'Pasif';
        afkButton.classList.toggle('active', newStatus);
    });

    // Durum Değiştirici
    changeStatusBtn.addEventListener('click', () => {
        const activityType = statusTypeSelect.value;
        const activityName = statusNameInput.value;
        const customStatus = customStatusInput.value;
        if (!activityName && !customStatus) {
            return showToast('Lütfen bir aktivite adı veya özel durum girin.', 'error');
        }
        socket.emit('change-status', { activityType, activityName, customStatus });
    });

    // Sunucu Kopyalayıcı
    cloneServerBtn.addEventListener('click', () => {
        const sourceGuildId = sourceGuildInput.value;
        const targetGuildId = targetGuildInput.value;
        if (!sourceGuildId || !targetGuildId) {
            return showToast('Lütfen kaynak ve hedef sunucu ID\'lerini girin.', 'error');
        }
        if (confirm('UYARI: Hedef sunucudaki TÜM kanallar ve roller kalıcı olarak silinecektir. Devam etmek istiyor musunuz?')) {
            socket.emit('clone-server', { sourceGuildId, targetGuildId });
        }
    });
    
    // DM Gönderici
    sendDmBtn.addEventListener('click', () => {
        const userId = friendSelect.value;
        const content = dmContentInput.value;
        if (!userId) return showToast('Lütfen bir arkadaş seçin.', 'error');
        if (!content) return showToast('Lütfen bir mesaj yazın.', 'error');
        socket.emit('send-dm', { userId, content });
        dmContentInput.value = '';
    });
    
    // Webhook Gönderici
    sendWebhookBtn.addEventListener('click', () => {
        const data = {
            url: webhookUrlInput.value,
            username: webhookUsernameInput.value,
            avatarURL: webhookAvatarInput.value,
            content: webhookContentInput.value,
            embed: {
                title: webhookEmbedTitleInput.value,
                description: webhookEmbedDescInput.value,
                color: webhookEmbedColorInput.value
            }
        };
        if (!data.url) return showToast('Webhook URL\'si zorunludur.', 'error');
        socket.emit('send-webhook', data);
    });

    // Troll Özellikler
    ghostPingBtn.addEventListener('click', () => {
        const channelId = ghostChannelIdInput.value;
        const userId = ghostUserIdInput.value;
        if (!channelId || !userId) return showToast('Kanal ve Kullanıcı ID\'si girin.', 'error');
        socket.emit('ghost-ping', { channelId, userId });
    });

    startTypingBtn.addEventListener('click', () => {
        const isTyping = startTypingBtn.dataset.status === 'true';
        const channelId = typingChannelIdInput.value;
        if (!channelId && !isTyping) return showToast('Lütfen bir kanal ID\'si girin.', 'error');
        
        socket.emit(isTyping ? 'stop-typing' : 'start-typing', channelId);
        
        const newStatus = !isTyping;
        startTypingBtn.dataset.status = newStatus;
        startTypingBtn.textContent = newStatus ? 'Durdur' : 'Başlat';
        startTypingBtn.classList.toggle('active', newStatus);
    });
    
    // Hesap Yönetimi
    switchAccountBtn.addEventListener('click', () => {
        const token = newTokenInput.value;
        if (!token) return showToast('Lütfen yeni bir token girin.', 'error');
        if (confirm('Emin misiniz? Mevcut oturum kapatılıp yeni token ile giriş yapılmaya çalışılacak.')) {
            socket.emit('switch-account', token);
        }
    });
});
            
