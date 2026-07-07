const { summarize } = require("./summarize.js");

const run = async (interaction) => {
	const profiles = await app.db.listProfiles(interaction.guildId);
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
};

module.exports = { run };
