const { summarize } = require("./summarize.js");

const run = async (interaction) => {
	const profiles = await app.db.listProfiles(interaction.guildId);
	if (profiles.length === 0) {
		return await interaction.reply({
			content: "No profiles linked in this server yet. Use `/link add`.",
			ephemeral: true
		});
	}

	const blocks = profiles.map((p) => {
		const dot = p.tokenStatus === "expired" ? "🔴" : "🟢";
		const owner = p.discordUserId ? `<@${p.discordUserId}>` : "_unknown_";
		return `${dot} **${p.label}** · ${owner}\n${summarize(p) || "(no games)"}`;
	});

	return await interaction.reply({
		ephemeral: true,
		embeds: [
			{
				color: 0x3498db,
				title: `Profiles in this server (${profiles.length})`,
				description: blocks.join("\n\n")
			}
		]
	});
};

module.exports = { run };
