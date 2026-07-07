const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");

const leaves = {
	add: require("./add.js").run,
	list: require("./list.js").run,
	edit: require("./edit.js").run,
	remove: require("./remove.js").run,
	refresh: require("./refresh.js").run
};

module.exports = {
	name: "link",
	description: "Manage HoYoLAB profiles for this server.",
	params: [],
	buildSlashData: () => new SlashCommandBuilder()
		.setName("link")
		.setDescription("Manage HoYoLAB profiles for this server.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false)
		.addSubcommand(sub => sub
			.setName("add")
			.setDescription("Link a HoYoLAB account by cookie; games are auto-detected.")
			.addStringOption(opt => opt.setName("cookie").setDescription("Your HoYoLAB cookie string").setRequired(true))
			.addStringOption(opt => opt.setName("label").setDescription("Profile name (defaults to your username)"))
			.addBooleanOption(opt => opt.setName("tot").setDescription("Also enable Tears of Themis (not auto-detectable)")))
		.addSubcommand(sub => sub
			.setName("list")
			.setDescription("List this server's profiles."))
		.addSubcommand(sub => sub
			.setName("edit")
			.setDescription("Edit a profile's per-game settings.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true)))
		.addSubcommand(sub => sub
			.setName("remove")
			.setDescription("Remove a profile from this server.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true)))
		.addSubcommand(sub => sub
			.setName("refresh")
			.setDescription("Replace a profile's cookie.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true))
			.addStringOption(opt => opt.setName("cookie").setDescription("The new cookie string").setRequired(true))),
	run: (async function link (context) {
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
