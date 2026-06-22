const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= IDs =================
const TOKEN = process.env.TOKEN;

const PANEL_CHANNEL_ID = "1495460515911172136";
const LOG_CHANNEL_ID = "1495466678136606942";

const ADMIN_ROLE = "1495462892026200104";
const DIV_ROLE = "1360011347768774796";

// ================= DATA =================
const FILE = "./data.json";

function load() {
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// ================= اللوحة =================
function buildBoard(data) {

  const sorted = Object.entries(data.users || {})
    .sort((a, b) => b[1] - a[1]);

  let text = "";

  if (!sorted.length) text = "لا يوجد مستلمين";

  else {
    sorted.forEach(([id, count], i) => {
      text += `${i + 1}- <@${id}> — ${count}\n`;
    });
  }

  return new EmbedBuilder()
    .setTitle("🏆 لوحة استلام التقسيمة")
    .setDescription(text)
    .setColor(0x00ff99);
}

// ================= تحديث =================
async function updateBoard(guild) {

  const data = load();
  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const msg = await channel.messages.fetch({ limit: 1 }).then(m => m.first()).catch(() => null);

  const embed = buildBoard(data);

  if (msg) msg.edit({ embeds: [embed] });
  else channel.send({ embeds: [embed] });
}

// ================= تشغيل =================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================= أوامر الإدارة (بسيطة) =================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const data = load();

  // ================= استلام =================
  if (message.content.startsWith("!claim")) {

    if (!message.member.roles.cache.has(DIV_ROLE)) return;

    data.users[message.author.id] = (data.users[message.author.id] || 0) + 1;

    save(data);
    await updateBoard(message.guild);
  }

  // ================= تشغيل النظام =================
  if (message.content === "!39fpanel") {
    await updateBoard(message.guild);
    return message.reply("تم تشغيل النظام ✅");
  }

  // ================= ADD / REMOVE SYSTEM =================
  if (
    message.content.startsWith("<@") ||
    message.content.includes("&")
  ) {

    // مثال: @user 5
    const args = message.content.split(" ");
    const userMention = args[0];
    const amount = parseInt(args[1]);

    if (!amount) return;

    const member = message.mentions.users.first();
    if (!member) return;

    if (!message.member.roles.cache.has(ADMIN_ROLE)) return;

    const data = load();

    if (!data.users[member.id]) data.users[member.id] = 0;

    const isRemove = message.content.includes("-");

    if (isRemove) {
      data.users[member.id] -= amount;
    } else {
      data.users[member.id] += amount;
    }

    if (data.users[member.id] <= 0) delete data.users[member.id];

    save(data);

    // ================= لوق =================
    const log = await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(isRemove ? "➖ حذف نقاط" : "➕ إضافة نقاط")
          .setDescription(
            `👤 الإداري: <@${message.author.id}>\n` +
            `🎯 الشخص: <@${member.id}>\n` +
            `⭐ العدد: ${amount}`
          )
          .setColor(isRemove ? 0xff0000 : 0x00ff00)
      ]
    });

    // ================= حذف رسالة الإدارة =================
    await message.delete().catch(() => {});

    await updateBoard(message.guild);
  }
});

client.login(TOKEN);
