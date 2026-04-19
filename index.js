const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { QuickDB } = require("quick.db");

const db = new QuickDB();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ⚙️ عدل هنا
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1483219896069525665"; // روم الاستلام
const LOG_CHANNEL = "1490286354175758366"; // روم اللوق
const ROLE_ID = "1495426762971283528"; // رتبة مسؤولي التقسيمات
const ADMIN_ROLE = "1475334752436359320"; // رتبة الإدارة العليا

let leaderboardMessageId = null;
let lastClaim = {};

async function updateBoard(channel) {
  const data = await db.all();

  const filtered = data
    .filter(x => x.id.startsWith("points_"))
    .map(x => [x.id.replace("points_", ""), x.value])
    .sort((a, b) => b[1] - a[1]);

  const text = filtered.length
    ? filtered.map((p, i) => `${i + 1}- <@${p[0]}> — ${p[1]}`).join("\n")
    : "لا يوجد بيانات";

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🏆 لوحة مسؤولي التقسيمات")
    .setDescription(text)
    .setFooter({ text: "TITANIUM DIVISION SYSTEM" })
    .setTimestamp();

  if (!leaderboardMessageId) {
    const msg = await channel.send({ embeds: [embed] });
    leaderboardMessageId = msg.id;
  } else {
    try {
      const msg = await channel.messages.fetch(leaderboardMessageId);
      await msg.edit({ embeds: [embed] });
    } catch {
      const msg = await channel.send({ embeds: [embed] });
      leaderboardMessageId = msg.id;
    }
  }
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // 👇 فقط الروم المحدد
  if (msg.channel.id !== CHANNEL_ID) return;

  // 👇 تحقق الرتبة
  if (!msg.member.roles.cache.has(ROLE_ID)) return;

  const userId = msg.author.id;
  const now = Date.now();

  // 🎯 تسجيل استلام
  if (msg.content === "!claim") {

    // ❌ منع التكرار
    if (lastClaim[userId] && now - lastClaim[userId] < 300000) {
      return msg.reply("❌ مكرر مرتين تحسبنا ماندري؟ لا تكرر");
    }

    lastClaim[userId] = now;

    let points = await db.get(`points_${userId}`) || 0;
    points++;

    await db.set(`points_${userId}`, points);

    msg.reply(`تم تسجيل التقسيمة لك\nعدد مرات الاستلام: ${points}`);

    // 🟢 لوق
    const logChannel = client.channels.cache.get(LOG_CHANNEL);
    if (logChannel) {
      logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#00ff99")
            .setTitle("📥 تسجيل استلام تقسيمة")
            .setDescription(`👤 <@${userId}>\n📊 العدد: ${points}`)
            .setTimestamp()
        ]
      });
    }

    updateBoard(msg.channel);
  }

  // 👑 أوامر الإدارة
  if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;

  // ➕ إضافة
  if (msg.content.startsWith("!give")) {
    const user = msg.mentions.users.first();
    if (!user) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points++;

    await db.set(`points_${user.id}`, points);

    msg.reply(`تمت الإضافة لـ ${user}`);
    updateBoard(msg.channel);
  }

  // ➖ حذف
  if (msg.content.startsWith("!remove")) {
    const user = msg.mentions.users.first();
    if (!user) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points--;

    if (points <= 0) await db.delete(`points_${user.id}`);
    else await db.set(`points_${user.id}`, points);

    msg.reply(`تم الحذف من ${user}`);
    updateBoard(msg.channel);
  }

  // 🔘 زر الإدارة
  if (msg.content === "!panel") {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("add").setLabel("➕ إضافة").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("remove").setLabel("➖ حذف").setStyle(ButtonStyle.Danger)
    );

    msg.channel.send({ content: "لوحة التحكم", components: [row] });
  }

});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
    return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
  }

  if (interaction.customId === "add") {
    interaction.reply({ content: "استخدم الأمر !give @user", ephemeral: true });
  }

  if (interaction.customId === "remove") {
    interaction.reply({ content: "استخدم الأمر !remove @user", ephemeral: true });
  }
});

client.once("ready", () => {
  console.log(`✅ ${client.user.tag} شغال`);
});

client.login(TOKEN);
