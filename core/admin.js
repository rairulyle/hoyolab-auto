const { PermissionFlagsBits } = require("discord.js");

const requireGuildAdmin = async (interaction) => {
	if (!interaction.inGuild()) {
		await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
		return false;
	}

	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await interaction.reply({ content: "You need the Administrator permission to use this command.", ephemeral: true });
		return false;
	}

	return true;
};

module.exports = { requireGuildAdmin };
