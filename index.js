const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

// ================= اسم عرض صحيح =================
async function getDisplayName(guild, id) {
  try {
    const member = await guild.members.fetch(id);
    return member.nickname || member.user.username;
  } catch {
    return id;
  }
}

// ================= اللوحة =================
function buildBoard(data) {

  const sorted = Object.entries(data.users || {})
    .sort((a, b) => b[1] - a[1]);

  let desc = "";

  if (!sorted.length) desc = "لا يوجد مستلمين";

  else {
    sorted.forEach(([id, count], i) => {
      desc += `${i + 1}- <@${id}> — ${count}\n`;
    });
  }

  return new EmbedBuilder()
    .setTitle("🏆 لوحة استلام التقسيمة")
    .setDescription(desc)
    .setColor(0x00ff99);
}

// ================= تحديث اللوحة =================
async function updatePanel(guild) {

  const data = load();
  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const embed = buildBoard(data);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("panel")
    .setPlaceholder("استلام التقسيمة / إدارة")
    .addOptions([
      { label: "استلام التقسيمة", value: "claim" },
      { label: "إضافة نقاط (إدارة)", value: "add" },
      { label: "حذف نقاط (إدارة)", value: "remove" }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  if (!data.panelId) {
    const msg = await channel.send({ embeds: [embed], components: [row] });
    data.panelId = msg.id;
    save(data);
  } else {
    const msg = await channel.messages.fetch(data.panelId);
    await msg.edit({ embeds: [embed], components: [row] });
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
    return message.reply("تم إنشاء اللوحة ✅");
  }
});

// ================= حالات =================
const adminAction = new Map();
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

    if (!data.users[id]) data.users[id] = 0;
    data.users[id] += 1;

    save(data);
    await updatePanel(guild);

    return interaction.reply({ content: "تم التسجيل ✅", ephemeral: true });
  }

  // ================= add / remove =================
  if (interaction.values[0] === "add" || interaction.values[0] === "remove") {

    if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
    }

    adminAction.set(interaction.user.id, interaction.values[0]);

    const users = Object.entries(data.users || {});

    if (!users.length) {
      return interaction.reply({ content: "لا يوجد مستلمين", ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("select_user")
      .setPlaceholder("اختر الشخص")
      .addOptions(
        users.map(([id, count]) => ({
          label: `@${id}`,
          description: `النقاط: ${count}`,
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

    const modal = new ModalBuilder()
      .setCustomId("points_modal")
      .setTitle("تعديل النقاط");

    const input = new TextInputBuilder()
      .setCustomId("amount")
      .setLabel("عدد النقاط")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }
});

// ================= تنفيذ =================
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "points_modal") return;

  const data = load();

  const action = adminAction.get(interaction.user.id);
  const target = selectedUser.get(interaction.user.id);
  const amount = parseInt(interaction.fields.getTextInputValue("amount"));

  if (!action || !target || isNaN(amount)) {
    return interaction.reply({ content: "خطأ", ephemeral: true });
  }

  if (!data.users[target]) data.users[target] = 0;

  const log = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

  // ================= اسم فعلي (نك نيم) =================
  const member = await interaction.guild.members.fetch(target).catch(() => null);
  const name =
    member?.nickname ||
    member?.user.username ||
    `<@${target}>`;

  if (action === "add") {
    data.users[target] += amount;

    log?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("➕ إضافة نقاط")
          .setDescription(`👤 الإداري: <@${interaction.user.id}>\n🎯 الشخص: ${name}\n⭐ العدد: ${amount}`)
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
          .setDescription(`👤 الإداري: <@${interaction.user.id}>\n🎯 الشخص: ${name}\n⭐ العدد: ${amount}`)
          .setColor(0xff0000)
      ]
    });
  }

  save(data);
  await updatePanel(interaction.guild);

  adminAction.delete(interaction.user.id);
  selectedUser.delete(interaction.user.id);

  return interaction.reply({ content: "تم التنفيذ ✅", ephemeral: true });
});

client.login(TOKEN);
