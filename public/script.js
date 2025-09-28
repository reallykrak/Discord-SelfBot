const socket = io();

const afkButton = document.getElementById('toggle-afk');
const nitroButton = document.getElementById('generate-nitro');
const cloneButton = document.getElementById('clone-server');
const cleanDmButton = document.getElementById('clean-dm');
const statusBox = document.getElementById('status-box');

let afkStatus = true;

afkButton.addEventListener('click', () => {
    afkStatus = !afkStatus;
    socket.emit('toggle-afk', afkStatus);
    updateAfkButton();
});

function updateAfkButton() {
    if (afkStatus) {
        afkButton.textContent = "AFK'yı Kapat";
        afkButton.classList.remove('off');
        afkButton.classList.add('on');
    } else {
        afkButton.textContent = "AFK'yı Aç";
        afkButton.classList.remove('on');
        afkButton.classList.add('off');
    }
}

nitroButton.addEventListener('click', () => {
    const channelId = document.getElementById('nitro-channel').value;
    if (channelId) {
        socket.emit('generate-nitro', channelId);
    } else {
        alert('Lütfen bir kanal ID\'si girin.');
    }
});

cloneButton.addEventListener('click', () => {
    const guildId = document.getElementById('clone-guild').value;
    if (guildId) {
        socket.emit('clone-server', guildId);
    } else {
        alert('Lütfen bir sunucu ID\'si girin.');
    }
});

cleanDmButton.addEventListener('click', () => {
    const userId = document.getElementById('clean-user').value;
    if (userId) {
        socket.emit('clean-dm', userId);
    } else {
        alert('Lütfen bir kullanıcı ID\'si girin.');
    }
});

socket.on('status-update', (message) => {
    statusBox.textContent = message;
    setTimeout(() => {
        statusBox.textContent = '';
    }, 5000);
});
