const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { linkProfile } = require("./service.js");
const { GAMES } = require("../../config/games.js");

const summarize = (profile) => profile.games
	.map(g => `${g.active ? "🟢" : "⚪"} **${GAMES[g.key].name}**${g.uid ? ` — \`${g.uid}\` ${g.nickname ?? ""}` : ""}`)
	.join("\n");

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

		const guildId = interaction.guildId;
		const sub = interaction.options.getSubcommand();

		if (sub === "add" || sub === "refresh") {
			await interaction.deferReply({ ephemeral: true });

			const label = sub === "add"
				? (interaction.options.getString("label") ?? interaction.user.username)
				: interaction.options.getString("label");

			if (sub === "refresh" && !await app.db.getProfile(guildId, label)) {
				return await interaction.editReply({ content: `No profile named **${label}** in this server.` });
			}

			try {
				const { profile } = await linkProfile({
					db: app.db,
					guildId,
					label,
					discordUserId: interaction.user.id,
					cookie: interaction.options.getString("cookie"),
					includeTot: interaction.options.getBoolean("tot") ?? false
				});
				scheduleReload();
				return await interaction.editReply({
					embeds: [{
						color: 0x2ECC71,
						title: sub === "add" ? `Linked profile: ${profile.label}` : `Refreshed profile: ${profile.label}`,
						description: summarize(profile),
						footer: { text: "Settings are editable via /link edit" }
					}]
				});
			}
			catch (e) {
				return await interaction.editReply({ content: `❌ ${e.message}` });
			}
		}

		if (sub === "list") {
			const profiles = await app.db.listProfiles(guildId);
			if (profiles.length === 0) {
				return await interaction.reply({ content: "No profiles linked in this server yet. Use `/link add`.", ephemeral: true });
			}

			return await interaction.reply({
				ephemeral: true,
				embeds: [{
					color: 0x3498DB,
					title: `Profiles in this server (${profiles.length})`,
					fields: profiles.map(p => ({
						name: `${p.tokenStatus === "expired" ? "🔴" : "🟢"} ${p.label}`,
						value: summarize(p) || "(no games)"
					}))
				}]
			});
		}

		if (sub === "remove") {
			const label = interaction.options.getString("label");
			const removed = await app.db.removeProfile(guildId, label);
			if (removed === 0) {
				return await interaction.reply({ content: `No profile named **${label}** in this server.`, ephemeral: true });
			}
			scheduleReload();
			return await interaction.reply({ content: `Removed profile **${label}**.`, ephemeral: true });
		}

		if (sub === "edit") {
			const { openEditor } = require("./editor.js");
			return await openEditor(interaction);
		}
	})
};
