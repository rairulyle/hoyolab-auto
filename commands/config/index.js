const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");

const leaves = {
	schedule: require("./schedule.js").run,
	channel: require("./channel.js").run,
	timezone: require("./timezone.js").run
};

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
			.setDescription("Show or set this server's check-in cron schedule.")
			.addStringOption(opt => opt.setName("cron").setDescription("Cron expression, e.g. 0 30 0 * * * (leave empty to view current)")))
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

		const leaf = leaves[interaction.options.getSubcommand()];
		if (!leaf) {
			return;
		}
		return await leaf(interaction);
	})
};
