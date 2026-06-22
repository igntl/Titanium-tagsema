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

const TOKEN = process.env.TOKEN;

const PANEL_CHANNEL_ID = "1495460515911172136";
const LOG_CHANNEL_ID = "1495466678136606942";

const ADMIN_ROLE = "1495462892026200104";
const DIV_ROLE = "1360011347768774796";

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

// ================= SMART DATE =================
function getSmartDate() {
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(now);
  target.setHours(0, 0, 0, 0);

  const diff = Math.floor((today - target) / (1000 * 60 * 60 * 24));

  let date;

  if (diff === 0) date = "Today";
  else if (diff === 1) date = "Yesterday";
  else date = now.toLocaleDateString("en-GB");

  return { date, time };
}

// ================= PANEL =================
function buildBoard(data) {
  const sorted = Object.entries(data.users || {}).sort((a, b) => b[1] - a[1]);

  let desc = sorted.length
    ? sorted.map((u, i) => `${i + 1}- <@${u[0]}> — ${u[1]}`).join("\n")
    : "لا يوجد مستلمين";

  return {
    title: "🏆 لوحة استلام التقسيمة",
    description: desc,
    color: 0x00ff99
  };
}

async function updatePanel(guild) {
  const data = load();

  const channel = await guild.channels.fetch(PANEL_CHANNEL_ID);

  const menu = new StringSelectMenuBuilder()
    .setCustomId("panel")
    .setPlaceholder("لوحة التحكم")
    .addOptions([
      { label: "استلام", value: "claim" },
      { label: "إضافة نقاط", value: "add" },
      { label: "حذف نقاط", value: "remove" }
    ]);

  const embed = buildBoard(data);

  if (!data.panelId) {
    const msg = await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });

    data.panelId = msg.id;
    save(data);
  } else {
    const msg = await channel.messages.fetch(data.panelId);
    await msg.edit({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
}

// ================= LOG =================
async function sendLog(type, admin, user, amount, guild) {
  const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

  const member = await guild.members.fetch(user).catch(() => null);

  const name = member ? member.displayName : `<@${user}>`;

  const adminName = `<@${admin}>`;

  const { date, time } = getSmartDate();

  let title = "";
  let color = 0x00ff99;

  if (type === "claim") {
    title = "📥 تسجيل استلام";
    color = 0x2ecc71;
  }

  if (type === "add") {
    title = "➕ إضافة نقاط";
    color = 0xf1c40f;
  }

  if (type === "remove") {
    title = "➖ حذف نقاط";
    color = 0xe74c3c;
  }

  await channel.send({
    embeds: [
      {
        title,
        color,
        description:
`
👤 الاداري: ${adminName}
🎮 اللاعب: <@${user}>
⭐ العدد: ${amount}

\`\`\`
${date} | ${time}
\`\`\`
        `.trim()
      }
    ]
  });
}

// ================= READY =================
client.once("ready", () => {
  console.log("Bot Ready");
});

// ================= PANEL COMMAND =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!39fpanel") {
    await updatePanel(message.guild);
    message.reply("تم تشغيل اللوحة ✅");
  }
});

// ================= STATE =================
const adminMode = new Map();

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const data = load();

  if (interaction.values[0] === "claim") {
    const id = interaction.user.id;

    data.users[id] = (data.users[id] || 0) + 1;
    save(data);

    await sendLog("claim", interaction.user.id, interaction.user.id, 1, interaction.guild);

    await interaction.deferUpdate();
    await updatePanel(interaction.guild);
  }

  if (interaction.values[0] === "add" || interaction.values[0] === "remove") {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({ content: "❌ غير مصرح", ephemeral: true });
    }

    adminMode.set(interaction.user.id, interaction.values[0]);

    return interaction.reply({
      content: "اكتب: @الشخص + العدد",
      ephemeral: true
    });
  }
});

// ================= CHAT =================
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
    await sendLog("remove", message.author.id, user.id, amount, message.guild);

    if (data.users[user.id] <= 0) delete data.users[user.id];
  }

  save(data);

  adminMode.delete(message.author.id);

  await message.delete().catch(() => {});
  await updatePanel(message.guild);
});

client.login(TOKEN);
