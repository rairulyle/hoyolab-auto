const { scheduleReload } = require("../../core/reload.js");
const { linkProfile } = require("./service.js");
const { summarize } = require("./summarize.js");

const run = async (interaction) => {
	await interaction.deferReply({ ephemeral: true });

	const label = interaction.options.getString("label");
	if (!await app.db.getProfile(interaction.guildId, label)) {
		return await interaction.editReply({ content: `No profile named **${label}** in this server.` });
	}

	try {
		const { profile } = await linkProfile({
			db: app.db,
			guildId: interaction.guildId,
			label,
			discordUserId: interaction.user.id,
			cookie: interaction.options.getString("cookie"),
			includeTot: false
		});
		scheduleReload();
		return await interaction.editReply({
			embeds: [{
				color: 0x2ECC71,
				title: `Refreshed profile: ${profile.label}`,
				description: summarize(profile),
				footer: { text: "Settings are editable via /link edit" }
			}]
		});
	}
	catch (e) {
		return await interaction.editReply({ content: `❌ ${e.message}` });
	}
};

module.exports = { run };
