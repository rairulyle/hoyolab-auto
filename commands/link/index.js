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
	buildSlashData: () =>
		new SlashCommandBuilder()
			.setName("link")
			.setDescription("Manage HoYoLAB profiles for this server.")
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.setDMPermission(false)
			.addSubcommand((sub) =>
				sub
					.setName("add")
					.setDescription("Link a HoYoLAB account by cookie; games are auto-detected.")
					.addStringOption((opt) =>
						opt
							.setName("label")
							.setDescription(
								'Unique name for this profile — used to edit/remove/refresh it later, e.g. "Skull - US".'
							)
							.setRequired(true)
							.setMaxLength(80)
					)
					.addStringOption((opt) =>
						opt
							.setName("cookie")
							.setDescription("Your HoYoLAB cookie string")
							.setRequired(true)
					)
					.addUserOption((opt) =>
						opt
							.setName("mention")
							.setDescription(
								"Who to @mention in this profile's notifications (defaults to no one)."
							)
					)
			)
			.addSubcommand((sub) =>
				sub.setName("list").setDescription("List this server's profiles.")
			)
			.addSubcommand((sub) =>
				sub
					.setName("edit")
					.setDescription("Edit a profile's per-game settings.")
					.addStringOption((opt) =>
						opt
							.setName("label")
							.setDescription("Profile name")
							.setRequired(true)
							.setAutocomplete(true)
					)
					.addUserOption((opt) =>
						opt
							.setName("mention")
							.setDescription("Set who to @mention in this profile's notifications.")
					)
			)
			.addSubcommand((sub) =>
				sub
					.setName("remove")
					.setDescription("Remove a profile from this server.")
					.addStringOption((opt) =>
						opt
							.setName("label")
							.setDescription("Profile name")
							.setRequired(true)
							.setAutocomplete(true)
					)
			)
			.addSubcommand((sub) =>
				sub
					.setName("refresh")
					.setDescription("Replace a profile's cookie.")
					.addStringOption((opt) =>
						opt
							.setName("label")
							.setDescription("Profile name")
							.setRequired(true)
							.setAutocomplete(true)
					)
					.addStringOption((opt) =>
						opt
							.setName("cookie")
							.setDescription("The new cookie string")
							.setRequired(true)
					)
			),
	autocomplete: async (interaction) => {
		const focused = interaction.options.getFocused(true);
		if (focused.name !== "label" || !interaction.inGuild()) {
			return await interaction.respond([]);
		}

		const query = focused.value.toLowerCase();
		const choices = (await app.db.listProfiles(interaction.guildId))
			.map((profile) => profile.label)
			.filter((label) => label.toLowerCase().includes(query))
			.slice(0, 25)
			.map((label) => ({ name: label, value: label }));

		return await interaction.respond(choices);
	},
	run: async function link(context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!(await requireGuildAdmin(interaction))) {
			return;
		}

		const leaf = leaves[interaction.options.getSubcommand()];
		if (!leaf) {
			return;
		}
		return await leaf(interaction);
	}
};
