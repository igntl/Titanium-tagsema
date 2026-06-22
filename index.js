const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
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

// ================= IDS =================
const TOKEN = process.env.TOKEN;

const PANEL_CHANNEL_ID = "1495460515911172136";
const LOG_CHANNEL_ID = "1495466678136606942";

const ADMIN_ROLE = "1495462892026200104";
const DIV_ROLE = "1360011347768774796";

// ================= DATA =================
const FILE = "./data.json";

function load() {
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ users: {}, panelId: null }, null, 2));
  }
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// ================= الوقت =================
function getTime() {
  return new Date().toLocaleString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
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

// ================= تحديث اللوحة =================
async function updatePanel(guild) {

  const data = load();
  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("panel")
    .setPlaceholder("لوحة التقسيمة")
    .addOptions([
      { label: "استلام", value: "claim" },
      { label: "إضافة نقاط", value: "add" },
      { label: "حذف نقاط", value: "remove" }
    ]);

  let msg;

  if (!data.panelId) {
    msg = await channel.send({
      embeds: [buildBoard(data)],
      components: [new ActionRowBuilder().addComponents(menu)]
    });

    data.panelId = msg.id;
    save(data);
  } else {
    msg = await channel.messages.fetch(data.panelId);
    await msg.edit({
      embeds: [buildBoard(data)],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
}

// ================= تشغيل =================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================= تشغيل اللوحة =================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "!39fpanel") {
    await updatePanel(message.guild);
    message.reply("تم تشغيل اللوحة ✅");
  }
});

// ================= حالات الإدارة =================
const adminMode = new Map();
const targetUser = new Map();

// ================= التفاعل =================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "panel") return;

  const data = load();

  // ================= استلام =================
  if (interaction.values[0] === "claim") {

    if (!interaction.member.roles.cache.has(DIV_ROLE)) {
      return interaction.reply({ content: "❌ غير مصرح", ephemeral: true });
    }

    const id = interaction.user.id;
    data.users[id] = (data.users[id] || 0) + 1;

    save(data);

    await interaction.deferUpdate();
    await updatePanel(interaction.guild);
  }

  // ================= إضافة / حذف =================
  if (interaction.values[0] === "add" || interaction.values[0] === "remove") {

    if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
    }

    adminMode.set(interaction.user.id, interaction.values[0]);

    return interaction.reply({
      content: "اكتب الآن في الشات: @الشخص + العدد (مثال: @user 5)",
      ephemeral: true
    });
  }
});

// ================= تنفيذ من الشات =================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const mode = adminMode.get(message.author.id);
  if (!mode) return;

  const data = load();

  const user = message.mentions.users.first();
  const amount = parseInt(message.content.split(" ")[1]);

  if (!user || isNaN(amount)) return;

  if (!data.users[user.id]) data.users[user.id] = 0;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  const name = member?.displayName || member?.user?.username || `<@${user.id}>`;

  const log = await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

  // ================= إضافة =================
  if (mode === "add") {

    data.users[user.id] += amount;

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("➕ إضافة نقاط")
          .setDescription(
            `👤 الإداري: <@${message.author.id}>\n` +
            `🎯 الشخص: ${name}\n` +
            `⭐ العدد: ${amount}\n` +
            `🕒 الوقت: ${getTime()}`
          )
          .setColor(0x00ff00)
      ]
    });
  }

  // ================= حذف =================
  if (mode === "remove") {

    data.users[user.id] -= amount;

    if (data.users[user.id] <= 0) delete data.users[user.id];

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("➖ حذف نقاط")
          .setDescription(
            `👤 الإداري: <@${message.author.id}>\n` +
            `🎯 الشخص: ${name}\n` +
            `⭐ العدد: ${amount}\n` +
            `🕒 الوقت: ${getTime()}`
          )
          .setColor(0xff0000)
      ]
    });
  }

  save(data);

  await message.delete().catch(() => {});
  adminMode.delete(message.author.id);

  await updatePanel(message.guild);
});

client.login(TOKEN);
