const { MessageActionRow, MessageButton } = require("discord.js");

module.exports = {
  name: "help",
  description: "Tüm mevcut komutları göster (butonla komut çalıştırır)",
  async execute(message, args, client) {
    if (!message.guild) {
      return message.reply("Bu komut sadece sunucu içinde kullanılabilir!");
    }

    // Embed mesaj
    const yardimEmbed = {
      color: 0xff0000,
      title: "Raider - Komut Paneli",
      description:
        "Aşağıdaki butonlara tıklayarak komutları çalıştırabilirsin ⚙️\n\n⚠️ *Bazı komutlar tehlikeli olabilir!*",
      footer: { text: "reallykrak." },
      timestamp: new Date(),
    };

    // Butonlar
    const row = new MessageActionRow().addComponents(
      new MessageButton()
        .setCustomId("ban")
        .setLabel("🔨 .ban")
        .setStyle("DANGER"),
      new MessageButton()
        .setCustomId("kick")
        .setLabel("👢 .kick")
        .setStyle("DANGER"),
      new MessageButton()
        .setCustomId("nuke")
        .setLabel("💥 .nuke")
        .setStyle("DANGER"),
      new MessageButton()
        .setCustomId("dm")
        .setLabel("📩 .dm")
        .setStyle("PRIMARY")
    );

    // Mesaj gönder
    const sent = await message.reply({
      embeds: [yardimEmbed],
      components: [row],
    });

    // Filtre — sadece komutu yazan kişi butonları kullanabilsin
    const filter = (i) => i.user.id === message.author.id;
    const collector = sent.createMessageComponentCollector({
      filter,
      time: 60000,
    });

    collector.on("collect", async (interaction) => {
      const id = interaction.customId;

      await interaction.deferReply({ ephemeral: true });

      try {
        // Butona göre komutu bul ve çalıştır
        const cmd = client.commands.get(id);
        if (!cmd) {
          return interaction.editReply({
            content: `❌ Komut bulunamadı: ${id}`,
          });
        }

        // Komutu çalıştır
        await cmd.execute(message, args, client);

        await interaction.editReply({
          content: `✅ **.${id}** komutu başarıyla çalıştırıldı!`,
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply({
          content: `⚠️ **.${id}** komutu çalıştırılırken bir hata oluştu.`,
        });
      }
    });

    collector.on("end", () => {
      row.components.forEach((btn) => btn.setDisabled(true));
      sent.edit({ components: [row] }).catch(() => {});
    });
  },
};
