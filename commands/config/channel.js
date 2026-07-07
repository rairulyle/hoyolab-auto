const run = async (interaction) => {
	const guildId = interaction.guildId;
	const guild = await app.db.getGuild(guildId);
	const reply = (content) => interaction.reply({ content, ephemeral: true });

	const type = interaction.options.getString("type");
	const channel = interaction.options.getChannel("channel");
	const field = `${type}ChannelId`;
	if (!channel) {
		const current = guild?.[field];
		return await reply(current ? `**${type}** notifications go to <#${current}>.` : `No **${type}** channel configured yet.`);
	}
	await app.db.setGuildField(guildId, field, channel.id);
	return await reply(`**${type}** notifications will go to <#${channel.id}>.`);
};

module.exports = { run };
