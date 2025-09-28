document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Elementler
    const botAvatar = document.getElementById('bot-avatar');
    const botUsername = document.getElementById('bot-username');
    const statusLight = document.querySelector('.status-light');
    const toastContainer = document.getElementById('toast-container');
    
    const afkButton = document.getElementById('toggle-afk');
    const statusTypeSelect = document.getElementById('status-type');
    const statusNameInput = document.getElementById('status-name');
    const changeStatusBtn = document.getElementById('change-status-btn');
    const cloneServerBtn = document.getElementById('clone-server-btn');
    const sourceGuildInput = document.getElementById('source-guild');
    const targetGuildInput = document.getElementById('target-guild');
    const cleanDmBtn = document.getElementById('clean-dm-btn');
    const cleanUserInput = document.getElementById('clean-user');
    const sendEmbedBtn = document.getElementById('send-embed-btn');
    const addFieldBtn = document.getElementById('add-field-btn');


    // Tost Bildirim Fonksiyonu
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.5s forwards';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    // Soket Bağlantı Durumu
    socket.on('connect', () => {
        statusLight.classList.remove('disconnected');
    });
    socket.on('disconnect', () => {
        statusLight.classList.add('disconnected');
        showToast('Bağlantı kesildi!', 'error');
    });
    
    // Bot Bilgilerini Al
    socket.on('bot-status', (data) => {
        botAvatar.src = data.avatar;
        botUsername.textContent = data.username;
    });

    // Genel Durum Güncellemeleri
    socket.on('status-update', ({ message, type }) => {
        showToast(message, type);
    });

    // AFK Butonu
    afkButton.addEventListener('click', () => {
        const currentStatus = afkButton.dataset.status === 'true';
        const newStatus = !currentStatus;
        socket.emit('toggle-afk', newStatus);
        afkButton.dataset.status = newStatus;
        afkButton.textContent = newStatus ? 'Aktif' : 'Pasif';
        afkButton.classList.toggle('active', newStatus);
    });

    // Durum Değiştirici
    changeStatusBtn.addEventListener('click', () => {
        const type = statusTypeSelect.value;
        const name = statusNameInput.value;
        if (name) {
            socket.emit('change-status', { type, name });
        } else {
            showToast('Lütfen bir aktivite adı girin.', 'error');
        }
    });
    
    // Sunucu Kopyalayıcı
    cloneServerBtn.addEventListener('click', () => {
        const sourceGuildId = sourceGuildInput.value;
        const targetGuildId = targetGuildInput.value;
        if (sourceGuildId && targetGuildId) {
             if (confirm('UYARI: Hedef sunucudaki TÜM kanallar, roller ve emojiler kalıcı olarak silinecektir. Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?')) {
                socket.emit('clone-server', { sourceGuildId, targetGuildId });
            }
        } else {
            showToast('Lütfen kaynak ve hedef sunucu ID\'lerini girin.', 'error');
        }
    });
    
    // DM Temizleyici
    cleanDmBtn.addEventListener('click', () => {
        const userId = cleanUserInput.value;
        if (userId) {
            socket.emit('clean-dm', userId);
        } else {
            showToast('Lütfen bir kullanıcı ID\'si girin.', 'error');
        }
    });

    // Embed Gönderici
    addFieldBtn.addEventListener('click', () => {
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'embed-field-group';
        fieldContainer.innerHTML = `
            <input type="text" class="embed-field-name" placeholder="Alan Adı">
            <input type="text" class="embed-field-value" placeholder="Alan Değeri">
            <button class="remove-field-btn">X</button>
        `;
        document.getElementById('embed-fields').appendChild(fieldContainer);
        fieldContainer.querySelector('.remove-field-btn').addEventListener('click', () => fieldContainer.remove());
    });
    
    sendEmbedBtn.addEventListener('click', () => {
        const embed = {
            title: document.getElementById('embed-title').value,
            description: document.getElementById('embed-desc').value,
            color: document.getElementById('embed-color').value,
            footer: document.getElementById('embed-footer').value,
            fields: []
        };
        document.querySelectorAll('.embed-field-group').forEach(group => {
            const name = group.querySelector('.embed-field-name').value;
            const value = group.querySelector('.embed-field-value').value;
            if(name && value) {
                embed.fields.push({ name, value, inline: false });
            }
        });
        
        const channelId = document.getElementById('embed-channel').value;
        if(channelId) {
            socket.emit('send-embed', { channelId, embed });
        } else {
            showToast('Lütfen bir kanal ID\'si girin.', 'error');
        }
    });
});
                                
