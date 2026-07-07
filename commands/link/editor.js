const openEditor = async (interaction) => {
	await interaction.reply({ content: "Editor coming soon.", ephemeral: true });
};

module.exports = { openEditor };
