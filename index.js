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
    fs.writeFileSync(FILE, JSON.stringify({ users: {}, panelId: null }, null, 2));
  }
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// ================= لوحة =================
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

  const embed = buildBoard(data);

  const msg = data.panelId
    ? await channel.messages.fetch(data.panelId)
    : await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });

  if (!data.panelId) {
    data.panelId = msg.id;
    save(data);
  } else {
    await msg.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  }
}

// ================= تشغيل =================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================= إنشاء اللوحة =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!39fpanel") {
    await updatePanel(message.guild);
    message.reply("تم تشغيل اللوحة ✅");
  }
});

// ================= حفظ اختيار الإدارة =================
const adminMode = new Map();
const selectedUser = new Map();

// ================= التفاعل =================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "panel") return;

  const data = load();
  const guild = interaction.guild;

  // ================= استلام =================
  if (interaction.values[0] === "claim") {

    if (!interaction.member.roles.cache.has(DIV_ROLE)) {
      return interaction.reply({ content: "❌ غير مصرح", ephemeral: true });
    }

    const id = interaction.user.id;

    data.users[id] = (data.users[id] || 0) + 1;

    save(data);

    await interaction.deferUpdate();
    await updatePanel(guild);
  }

  // ================= اختيار إدارة =================
  if (interaction.values[0] === "add" || interaction.values[0] === "remove") {

    if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
    }

    adminMode.set(interaction.user.id, interaction.values[0]);

    const users = Object.keys(data.users || {});

    const menu = new StringSelectMenuBuilder()
      .setCustomId("select_user")
      .setPlaceholder("اختر الشخص")
      .addOptions(
        users.map(id => ({
          label: guild.members.cache.get(id)?.displayName || "User",
          value: id
        }))
      );

    return interaction.reply({
      content: "اختر الشخص:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  // ================= اختيار شخص =================
  if (interaction.customId === "select_user") {

    selectedUser.set(interaction.user.id, interaction.values[0]);

    return interaction.reply({
      content: "اكتب عدد النقاط الآن في الشات (مثال: 5)",
      ephemeral: true
    });
  }
});

// ================= قراءة الرقم من الشات =================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const action = adminMode.get(message.author.id);
  const target = selectedUser.get(message.author.id);

  if (!action || !target) return;

  const amount = parseInt(message.content);

  if (isNaN(amount)) return;

  const data = load();

  if (!data.users[target]) data.users[target] = 0;

  const member = await message.guild.members.fetch(target).catch(() => null);
  const name = member?.displayName || member?.user?.username || `<@${target}>`;

  const log = await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

  if (action === "add") {
    data.users[target] += amount;

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("➕ إضافة نقاط")
          .setDescription(`👤 الإداري: <@${message.author.id}>\n🎯 الشخص: ${name}\n⭐ العدد: ${amount}`)
          .setColor(0x00ff00)
      ]
    });
  }

  if (action === "remove") {
    data.users[target] -= amount;
    if (data.users[target] <= 0) delete data.users[target];

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("➖ حذف نقاط")
          .setDescription(`👤 الإداري: <@${message.author.id}>\n🎯 الشخص: ${name}\n⭐ العدد: ${amount}`)
          .setColor(0xff0000)
      ]
    });
  }

  save(data);

  adminMode.delete(message.author.id);
  selectedUser.delete(message.author.id);

  await updatePanel(message.guild);
});

client.login(TOKEN);
