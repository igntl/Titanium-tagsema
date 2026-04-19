const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { QuickDB } = require("quick.db");
const db = new QuickDB();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔥 إعداداتك
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1483219896069525665";
const LOG_CHANNEL = "1490286354175758366";
const ROLE_ID = "1495426762971283528";
const ADMIN_ROLE = "1475334752436359320";

let waitingAdd = {};
let waitingRemove = {};

// 🏆 تحديث البورد
async function updateBoard() {
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) return;

  let messageId = await db.get("leaderboardMessageId");

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

  try {
    if (messageId) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] });
        return;
      }
    }

    const newMsg = await channel.send({ embeds: [embed] });
    await db.set("leaderboardMessageId", newMsg.id);

  } catch (err) {
    console.log("❌ خطأ تحديث البورد:", err);
  }
}

// 🎛️ البانل
function sendPanel(channel) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim").setLabel("استلام").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("add").setLabel("إضافة").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("remove").setLabel("حذف").setStyle(ButtonStyle.Danger)
  );

  channel.send({ content: "لوحة التحكم", components: [row] });
}

// تشغيل
client.once("ready", () => {
  console.log(`✅ ${client.user.tag} شغال`);
});

// 📩 الأوامر
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== CHANNEL_ID) return;

  // بانل
  if (msg.content === "!panel") {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;
    msg.delete().catch(() => {});
    sendPanel(msg.channel);
  }

  // عرض
  if (msg.content === "!lb") {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;
    updateBoard();
  }

  // تصفير
  if (msg.content === "!clr") {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;

    const all = await db.all();
    for (const entry of all) {
      if (entry.id.startsWith("points_")) {
        await db.delete(entry.id);
      }
    }

    await db.delete("leaderboardMessageId");

    msg.channel.send("تم تصفير اللائحة");
    updateBoard();
  }

  // ➕ إضافة
  if (waitingAdd[msg.author.id]) {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;

    const user = msg.mentions.users.first();
    const amount = parseInt(msg.content.split(" ")[1]);

    if (!user || isNaN(amount)) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points += amount;

    await db.set(`points_${user.id}`, points);

    // 🔥 لوق الإضافة
    const logChannel = client.channels.cache.get(LOG_CHANNEL);
    if (logChannel) {
      logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#3498db")
            .setTitle("➕ إضافة نقاط")
            .setDescription(`👑 الإدارة: <@${msg.author.id}>\n🎯 المستهدف: ${user}\n📊 العدد المضاف: ${amount}`)
            .setTimestamp()
        ]
      });
    }

    delete waitingAdd[msg.author.id];

    msg.delete().catch(() => {});
    updateBoard();
  }

  // ➖ حذف
  if (waitingRemove[msg.author.id]) {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;

    const user = msg.mentions.users.first();
    const amount = parseInt(msg.content.split(" ")[1]);

    if (!user || isNaN(amount)) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points -= amount;

    if (points <= 0) await db.delete(`points_${user.id}`);
    else await db.set(`points_${user.id}`, points);

    // 🔥 لوق الحذف
    const logChannel = client.channels.cache.get(LOG_CHANNEL);
    if (logChannel) {
      logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#e74c3c")
            .setTitle("➖ حذف نقاط")
            .setDescription(`👑 الإدارة: <@${msg.author.id}>\n🎯 المستهدف: ${user}\n📊 العدد المحذوف: ${amount}`)
            .setTimestamp()
        ]
      });
    }

    delete waitingRemove[msg.author.id];

    msg.delete().catch(() => {});
    updateBoard();
  }
});

// 🎯 الأزرار
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const member = interaction.member;
  const now = Date.now();

  // 🟢 استلام
  if (interaction.customId === "claim") {

    if (!member.roles.cache.has(ROLE_ID)) {
      return interaction.reply({ content: "❌ ليس لديك صلاحية", ephemeral: true });
    }

    const lastTime = await db.get(`lastClaim_${userId}`);

    if (lastTime && now - lastTime < 300000) {
      return interaction.reply({
        content: "❌ مكرر مرتين تحسبنا ماندري؟ لا تكرر",
        ephemeral: true
      });
    }

    await db.set(`lastClaim_${userId}`, now);

    let points = await db.get(`points_${userId}`) || 0;
    points++;

    await db.set(`points_${userId}`, points);

    // 🔥 لوق الاستلام
    const logChannel = client.channels.cache.get(LOG_CHANNEL);
    if (logChannel) {
      logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#00ff99")
            .setTitle("📥 تسجيل استلام")
            .setDescription(`<@${userId}>\n📊 العدد: ${points}`)
            .setTimestamp()
        ]
      });
    }

    await interaction.deferUpdate();
    await updateBoard();
  }

  // 👑 إدارة
  if (!member.roles.cache.has(ADMIN_ROLE)) {
    return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
  }

  // ➕
  if (interaction.customId === "add") {
    waitingAdd[userId] = true;

    return interaction.reply({
      content: "اكتب: @user رقم",
      ephemeral: true
    });
  }

  // ➖
  if (interaction.customId === "remove") {
    waitingRemove[userId] = true;

    return interaction.reply({
      content: "اكتب: @user رقم",
      ephemeral: true
    });
  }
});

client.login(TOKEN);
