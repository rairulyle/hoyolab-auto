const { scheduleReload } = require("../../core/reload.js");

const run = async (interaction) => {
	const label = interaction.options.getString("label");
	const removed = await app.db.removeProfile(interaction.guildId, label);
	if (removed === 0) {
		return await interaction.reply({ content: `No profile named **${label}** in this server.`, ephemeral: true });
	}
	scheduleReload();
	return await interaction.reply({ content: `Removed profile **${label}**.`, ephemeral: true });
};

module.exports = { run };
