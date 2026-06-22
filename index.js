const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
const DIVISION_ROLE = "1360011347768774796";

// ================= DATA =================
const DATA_FILE = "./data.json";

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: {},
      messageId: null
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ================= اللوحة =================
function buildBoard(data) {

  const sorted = Object.entries(data.users || {})
    .sort((a, b) => b[1] - a[1]);

  let text = "🏆 لوحة استلام التقسيمات\n\n";

  if (!sorted.length) {
    text += "لا يوجد مستلمين حالياً";
  } else {
    sorted.forEach(([id, count], i) => {
      text += `${i + 1}- <@${id}> — ${count}\n`;
    });
  }

  return new EmbedBuilder()
    .setTitle("🏆 استلام التقسيمة")
    .setDescription(text)
    .setColor(0xFFD700);
}

// ================= تحديث اللوحة =================
async function updateBoard(guild) {

  const data = load();
  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const embed = buildBoard(data);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("panel")
    .setPlaceholder("استلام التقسيمة")
    .addOptions([
      { label: "استلام التقسيمة", value: "claim" },
      { label: "إضافة (إدارة)", value: "add" },
      { label: "حذف (إدارة)", value: "remove" }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  if (!data.messageId) {
    const msg = await channel.send({ embeds: [embed], components: [row] });
    data.messageId = msg.id;
    save(data);
  } else {
    const msg = await channel.messages.fetch(data.messageId);
    await msg.edit({ embeds: [embed], components: [row] });
  }
}

// ================= تشغيل تلقائي =================
client.once("ready", () => {
  console.log("Bot Ready");

  const guild = client.guilds.cache.first();
  if (guild) updateBoard(guild);
});

// ================= التفاعل =================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "panel") return;

  const data = load();

  const userId = interaction.user.id;
  const member = interaction.member;

  // ===== استلام =====
  if (interaction.values[0] === "claim") {

    if (!member.roles.cache.has(DIVISION_ROLE)) {
      return interaction.reply({ content: "❌ غير مصرح لك", ephemeral: true });
    }

    if (!data.users[userId]) data.users[userId] = 0;
    data.users[userId] += 1;
  }

  // ===== إضافة =====
  if (interaction.values[0] === "add") {

    if (!member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
    }

    if (!data.users[userId]) data.users[userId] = 0;
    data.users[userId] += 1;
  }

  // ===== حذف =====
  if (interaction.values[0] === "remove") {

    if (!member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
    }

    if (!data.users[userId]) data.users[userId] = 0;
    data.users[userId] -= 1;

    if (data.users[userId] <= 0) delete data.users[userId];
  }

  save(data);

  await interaction.deferUpdate();
  await updateBoard(interaction.guild);
});

client.login(TOKEN);
