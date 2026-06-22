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

// ================== IDs ==================
const TOKEN = process.env.TOKEN;

const PANEL_CHANNEL_ID = "1495460515911172136";
const LOG_CHANNEL_ID = "1495466678136606942";

const ADMIN_ROLE = "1495462892026200104";
const DIVISION_ROLE = "1360011347768774796";

const DATA_FILE = "./data.json";

// ================== DATA ==================
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

// ================== بناء اللوحة ==================
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
    .setTitle("🏆 استلام التقسيمه")
    .setDescription(text)
    .setColor(0xFFD700);
}

// ================== تحديث اللوحة ==================
async function updateBoard(guild) {

  const data = load();
  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const embed = buildBoard(data);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("panel")
    .setPlaceholder("لوحة استلام التقسيمه")
    .addOptions([
      { label: "استلام التقسيمه", value: "claim" },
      { label: "إضافة (إدارة)", value: "add" },
      { label: "حذف (إدارة)", value: "remove" }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  if (!data.messageId) {
    const msg = await channel.send({
      embeds: [embed],
      components: [row]
    });

    data.messageId = msg.id;
    save(data);
  } else {
    try {
      const msg = await channel.messages.fetch(data.messageId);
      await msg.edit({
        embeds: [embed],
        components: [row]
      });
    } catch {
      const msg = await channel.send({
        embeds: [embed],
        components: [row]
      });

      data.messageId = msg.id;
      save(data);
    }
  }
}

// ================== تشغيل ==================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================== أمر إنشاء اللوحة ==================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content !== "!39fpanel") return;

  const data = load();

  const guild = message.guild;

  await updateBoard(guild);

  return message.reply("تم إنشاء لوحة الاستلام ✅");
});

// ================== التفاعل ==================
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
