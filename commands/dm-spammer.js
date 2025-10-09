const { Client } = require("discord.js-selfbot-v13");
let spamInterval = null;
let spamClient = null;

async function startSpam(data, socket) {
    if (spamInterval) {
        return socket.emit('status-update', { message: 'Zaten aktif bir spam işlemi var.', type: 'warning' });
    }

    spamClient = new Client({ checkUpdate: false });

    spamClient.on('ready', async () => {
        socket.emit('status-update', { message: `${spamClient.user.tag} ile spam başlatılıyor.`, type: 'info' });
        const user = await spamClient.users.fetch(data.userId).catch(() => null);
        if (!user) {
            socket.emit('status-update', { message: 'Mesaj gönderilecek kullanıcı bulunamadı.', type: 'error' });
            stopSpam(socket);
            return;
        }

        spamInterval = setInterval(() => {
            user.send(data.message).catch(err => {
                console.error("Spam mesajı gönderilemedi:", err.message);
                socket.emit('status-update', { message: `Mesaj gönderilemedi: ${err.message}`, type: 'error' });
                stopSpam(socket);
            });
        }, parseInt(data.delay));

        socket.emit('spam-status-change', true);
    });

    spamClient.login(data.token).catch(err => {
        socket.emit('status-update', { message: `Spammer token ile giriş yapılamadı: ${err.message}`, type: 'error' });
        stopSpam(socket);
    });
}

function stopSpam(socket) {
    if (spamInterval) {
        clearInterval(spamInterval);
        spamInterval = null;
    }
    if (spamClient) {
        spamClient.destroy();
        spamClient = null;
    }
    socket.emit('status-update', { message: 'Spam durduruldu.', type: 'info' });
    socket.emit('spam-status-change', false);
}

module.exports = { startSpam, stopSpam };
              
