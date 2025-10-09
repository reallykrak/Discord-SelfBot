async function cleanDmMessages(client, userId, socket) {
    if (!client || !client.user) {
        return socket.emit('status-update', { message: 'Panel botu aktif değil.', type: 'error' });
    }
    try {
        const user = await client.users.fetch(userId);
        const dmChannel = await user.createDM();
        
        socket.emit('status-update', { message: `${user.tag} ile olan DM'ler siliniyor...`, type: 'info' });

        let deletedCount = 0;
        let fetched;
        let lastId = null;

        while (true) {
            const options = { limit: 100 };
            if (lastId) {
                options.before = lastId;
            }

            fetched = await dmChannel.messages.fetch(options);
            const userMessages = fetched.filter(msg => msg.author.id === client.user.id);
            
            if (userMessages.size > 0) {
                 for (const message of userMessages.values()) {
                    await message.delete();
                    deletedCount++;
                    await new Promise(res => setTimeout(res, 350)); // Her silme arasında bekle
                }
            }
            
            if (fetched.size < 100) {
                break;
            }
            lastId = fetched.last().id;
        }

        socket.emit('status-update', { message: `Temizlik tamamlandı! ${deletedCount} mesaj silindi.`, type: 'success' });

    } catch (error) {
        console.error('DM Temizleme Hatası:', error);
        socket.emit('status-update', { message: `Mesajlar silinemedi: ${error.message}`, type: 'error' });
    }
}

module.exports = cleanDmMessages;
                      
