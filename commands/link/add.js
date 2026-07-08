const { scheduleReload } = require("../../core/reload.js");
const { linkProfile } = require("./service.js");
const { summarize } = require("./summarize.js");

const run = async (interaction) => {
	await interaction.deferReply({ ephemeral: true });

	const label = interaction.options.getString("label") ?? interaction.user.username;

	try {
		const { profile } = await linkProfile({
			db: app.db,
			guildId: interaction.guildId,
			label,
			discordUserId: interaction.user.id,
			cookie: interaction.options.getString("cookie")
		});
		scheduleReload();
		return await interaction.editReply({
			embeds: [
				{
					color: 0x2ecc71,
					title: `Linked profile: ${profile.label}`,
					description: summarize(profile),
					footer: { text: "Settings are editable via /link edit" }
				}
			]
		});
	} catch (e) {
		return await interaction.editReply({ content: `❌ ${e.message}` });
	}
};

module.exports = { run };
