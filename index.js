const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.js');

const client = new Client({
    checkUpdate: false,
    autoRedeemNitro: false,
    ws: { properties: { browser: 'Discord Client' } }
});

const messageQueue = [];
const cooldownUsers = new Map();
let isProcessingQueue = false;
let lastMessageTime = 0;

client.on('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
    console.log('AFK modu aktif - Etiketlendiğinizde veya DM aldığınızda otomatik yanıt verilecek.');
});

async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
        const messageData = messageQueue.shift();
        const now = Date.now();
        
        const timeSinceLastMessage = now - lastMessageTime;
        if (timeSinceLastMessage < 10000) {
            const waitTime = 10000 - timeSinceLastMessage;
            console.log(`${waitTime}ms bekleniyor...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        try {
            await messageData.channel.send(config.afkMessage);
            lastMessageTime = Date.now();
            
            cooldownUsers.set(messageData.userId, now);
            
            console.log(`${messageData.authorTag} kullanıcısına AFK mesajı gönderildi. (Sıra: ${messageQueue.length + 1} kaldı)`);
            
        } catch (error) {
            console.error('Mesaj gönderilirken hata oluştu:', error.message);
        }
    }
    
    isProcessingQueue = false;
}

client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;
    
    if (message.author.bot) return;
    
    let shouldRespond = false;
    let responseChannel = null;
    
    if (message.channel.type === 'DM') {
        shouldRespond = true;
        responseChannel = message.channel;
    }
    else if (message.guild) {
        if (message.mentions.users.has(client.user.id)) {
            shouldRespond = true;
            responseChannel = message.channel;
        }
        else if (message.reference && message.reference.messageId) {
            try {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (referencedMessage.author.id === client.user.id) {
                    shouldRespond = true;
                    responseChannel = message.channel;
                }
            } catch (error) {
                console.log('Referans mesajı alınamadı:', error.message);
            }
        }
    }
    
    if (shouldRespond && responseChannel) {
        const userId = message.author.id;
        const now = Date.now();
        
        if (cooldownUsers.has(userId)) {
            const lastResponse = cooldownUsers.get(userId);
            if (now - lastResponse < config.settings.cooldownTime) {
                return;
            }
        }
        
        messageQueue.push({
            userId: userId,
            authorTag: message.author.tag,
            channel: responseChannel,
            timestamp: now
        });
        
        console.log(`${message.author.tag} kullanıcısının mesajı sıraya eklendi. (Sıra: ${messageQueue.length})`);
        
        processMessageQueue();
    }
});

client.on('error', (error) => {
    console.error('Discord client hatası:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('İşlenmeyen hata:', error);
});

client.login(config.token).catch(error => {
    console.error('Giriş yapılırken hata oluştu:', error.message);
    console.log('Lütfen config.js dosyasındaki token\'ı kontrol edin.');
});
