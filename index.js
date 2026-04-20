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
const CHANNEL_ID = "1495460515911172136";
const LOG_CHANNEL = "1495466678136606942";
const ROLE_ID = "1360011347768774796";
const ADMIN_ROLE = "1495462892026200104";

let waitingAdd = {};
let waitingRemove = {};

// 🛡️ Queue + حماية
let updating = false;

async function updateBoardSafe() {
  if (updating) return;
  updating = true;

  try {
    await updateBoard();
  } catch (e) {
    console.log("❌ update error:", e);
  }

  updating = false;
}

// 🏆 البورد
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

  // 🔥 أول مرة فقط
  if (!messageId) {
    const msg = await channel.send({ embeds: [embed] });
    await db.set("leaderboardMessageId", msg.id);
    return;
  }

  // تحديث فقط
  try {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return;

    await msg.edit({ embeds: [embed] });
  } catch {
    console.log("❌ فشل تحديث البورد");
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

// 🛡️ حماية من الكراش
process.on("unhandledRejection", (err) => {
  console.log("Unhandled Rejection:", err);
});

// تشغيل
client.once("ready", () => {
  console.log(`✅ ${client.user.tag} شغال`);
});

// 📩 الأوامر
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== CHANNEL_ID) return;

  if (msg.content === "!panel") {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;
    msg.delete().catch(() => {});
    sendPanel(msg.channel);
  }

  if (msg.content === "!lb") {
    if (!msg.member.roles.cache.has(ADMIN_ROLE)) return;
    updateBoardSafe(); // 🔥 بدون أي رسالة إنشاء
  }

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
  }

  // ➕ إضافة
  if (waitingAdd[msg.author.id]) {
    const user = msg.mentions.users.first();
    const amount = parseInt(msg.content.split(" ")[1]);

    if (!user || isNaN(amount)) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points += amount;

    await db.set(`points_${user.id}`, points);

    client.channels.cache.get(LOG_CHANNEL)?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#3498db")
          .setTitle("➕ إضافة نقاط")
          .setDescription(`👑 الإدارة: <@${msg.author.id}>\n🎯 المستهدف: ${user}\n📊 العدد: ${amount}`)
          .setTimestamp()
      ]
    });

    delete waitingAdd[msg.author.id];
    msg.delete().catch(() => {});
    updateBoardSafe();
  }

  // ➖ حذف
  if (waitingRemove[msg.author.id]) {
    const user = msg.mentions.users.first();
    const amount = parseInt(msg.content.split(" ")[1]);

    if (!user || isNaN(amount)) return;

    let points = await db.get(`points_${user.id}`) || 0;
    points -= amount;

    if (points <= 0) await db.delete(`points_${user.id}`);
    else await db.set(`points_${user.id}`, points);

    client.channels.cache.get(LOG_CHANNEL)?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setTitle("➖ حذف نقاط")
          .setDescription(`👑 الإدارة: <@${msg.author.id}>\n🎯 المستهدف: ${user}\n📊 العدد: ${amount}`)
          .setTimestamp()
      ]
    });

    delete waitingRemove[msg.author.id];
    msg.delete().catch(() => {});
    updateBoardSafe();
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

    const last = await db.get(`lastClaim_${userId}`);
    if (last && now - last < 300000) {
      return interaction.reply({
        content: "❌ مكرر مرتين تحسبنا ماندري؟ لا تكرر",
        ephemeral: true
      });
    }

    await db.set(`lastClaim_${userId}`, now);

    let points = await db.get(`points_${userId}`) || 0;
    points++;

    await db.set(`points_${userId}`, points);

    client.channels.cache.get(LOG_CHANNEL)?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00ff99")
          .setTitle("📥 تسجيل استلام")
          .setDescription(`<@${userId}>\n📊 العدد: ${points}`)
          .setTimestamp()
      ]
    });

    await interaction.deferUpdate();
    updateBoardSafe();
  }

  // 🔴 إدارة فقط
  if (!member.roles.cache.has(ADMIN_ROLE)) {
    return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
  }

  if (interaction.customId === "add") {
    waitingAdd[userId] = true;
    return interaction.reply({ content: "اكتب: @user رقم", ephemeral: true });
  }

  if (interaction.customId === "remove") {
    waitingRemove[userId] = true;
    return interaction.reply({ content: "اكتب: @user رقم", ephemeral: true });
  }
});

client.login(TOKEN);
