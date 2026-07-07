const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { isValidHhmm, isValidTimezone, nextOccurrenceUnix } = require("../../core/time.js");
const defaults = require("../../config/defaults.js");

module.exports = {
	name: "config",
	description: "Configure this server's schedules and channels.",
	params: [],
	buildSlashData: () => new SlashCommandBuilder()
		.setName("config")
		.setDescription("Configure this server's schedules and channels.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false)
		.addSubcommand(sub => sub
			.setName("schedule")
			.setDescription("Show or set the daily check-in time for this server.")
			.addStringOption(opt => opt.setName("time").setDescription("HH:MM in this server's timezone (e.g. 00:30)")))
		.addSubcommand(sub => sub
			.setName("channel")
			.setDescription("Show or set a notification channel.")
			.addStringOption(opt => opt.setName("type").setDescription("Which notifications").setRequired(true)
				.addChoices({ name: "check-in", value: "checkin" }, { name: "redeem", value: "redeem" }))
			.addChannelOption(opt => opt.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText)))
		.addSubcommand(sub => sub
			.setName("timezone")
			.setDescription("Show or set this server's IANA timezone.")
			.addStringOption(opt => opt.setName("tz").setDescription("e.g. Asia/Manila"))),
	run: (async function config (context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!await requireGuildAdmin(interaction)) {
			return;
		}

		const guildId = interaction.guildId;
		const sub = interaction.options.getSubcommand();
		const guild = await app.db.getGuild(guildId);
		const timezone = guild?.timezone ?? defaults.guild.timezone;
		const reply = (content) => interaction.reply({ content, ephemeral: true });

		if (sub === "schedule") {
			const time = interaction.options.getString("time");
			if (!time) {
				const current = guild?.checkinTime ?? defaults.guild.checkinTime;
				const unix = nextOccurrenceUnix(current, timezone);
				return await reply(`Daily check-in runs at **${current}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
			}
			if (!isValidHhmm(time)) {
				return await reply("Couldn't parse that time. Use 24-hour `HH:MM`, e.g. `00:30`.");
			}
			await app.db.setGuildField(guildId, "checkinTime", time);
			scheduleReload();
			const unix = nextOccurrenceUnix(time, timezone);
			return await reply(`Daily check-in will now run at **${time}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
		}

		if (sub === "channel") {
			const type = interaction.options.getString("type");
			const channel = interaction.options.getChannel("channel");
			const field = `${type}ChannelId`;
			if (!channel) {
				const current = guild?.[field];
				return await reply(current ? `**${type}** notifications go to <#${current}>.` : `No **${type}** channel configured yet.`);
			}
			await app.db.setGuildField(guildId, field, channel.id);
			return await reply(`**${type}** notifications will go to <#${channel.id}>.`);
		}

		if (sub === "timezone") {
			const tz = interaction.options.getString("tz");
			if (!tz) {
				return await reply(`This server's timezone is **${timezone}**.`);
			}
			if (!isValidTimezone(tz)) {
				return await reply(`\`${tz}\` is not a valid IANA timezone. Try e.g. \`Asia/Manila\`.`);
			}
			await app.db.setGuildField(guildId, "timezone", tz);
			scheduleReload();
			return await reply(`Timezone set to **${tz}**. Schedules now fire in this timezone.`);
		}
	})
};
