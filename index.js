const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder
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

  return {
    title: "🏆 لوحة استلام التقسيمة",
    description: text,
    color: 0x00ff99
  };
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

  const embed = buildBoard(data);

  let msg;

  if (!data.panelId) {
    msg = await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });

    data.panelId = msg.id;
    save(data);

  } else {
    msg = await channel.messages.fetch(data.panelId);

    await msg.edit({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
}

// ================= الوقت =================
function formatTime() {
  const now = new Date();

  return {
    date: now.toLocaleDateString("ar-SA"),
    time: now.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
}

// ================= لوق احترافي (نفس الصورة) =================
async function sendLog(type, actor, target, amount, guild) {

  const log = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

  const t = formatTime();

  let title = "";
  let color = 0x00ff99;

  if (type === "claim") {
    title = "📥 تسجيل استلام";
    color = 0x00ff99;
  }

  if (type === "add") {
    title = "➕ إضافة نقاط";
    color = 0x2ecc71;
  }

  if (type === "remove") {
    title = "➖ حذف نقاط";
    color = 0xe74c3c;
  }

  const member = await guild.members.fetch(target).catch(() => null);
  const name = member?.displayName || `<@${target}>`;

  log?.send({
    embeds: [
      {
        title: title,
        color: color,

        fields: [
          {
            name: "🎮 اللاعب",
            value: `<@${actor}>`,
            inline: true
          },
          {
            name: "🎯 الشخص",
            value: `${name}`,
            inline: true
          },
          {
            name: "⭐ العدد",
            value: `${amount || 1}`,
            inline: true
          },
          {
            name: "📅 التاريخ",
            value: `${t.date}`,
            inline: true
          },
          {
            name: "⏰ الوقت",
            value: `${t.time}`,
            inline: true
          }
        ]
      }
    ]
  });
}

// ================= تشغيل =================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================= لوحة =================
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "!39fpanel") {
    await updatePanel(message.guild);
    message.reply("تم تشغيل اللوحة ✅");
  }
});

// ================= إدارة الحالات =================
const adminMode = new Map();

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

    await sendLog("claim", interaction.user.id, interaction.user.id, 1, interaction.guild);

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
      content: "اكتب في الشات: @الشخص + العدد (مثال: @user 5)",
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

  if (mode === "add") {
    data.users[user.id] += amount;
    await sendLog("add", message.author.id, user.id, amount, message.guild);
  }

  if (mode === "remove") {
    data.users[user.id] -= amount;
    if (data.users[user.id] <= 0) delete data.users[user.id];

    await sendLog("remove", message.author.id, user.id, amount, message.guild);
  }

  save(data);

  await message.delete().catch(() => {});
  adminMode.delete(message.author.id);

  await updatePanel(message.guild);
});

client.login(TOKEN);
