const sendToGuildChannel = async (guildId, kind, payload) => {
	try {
		const guild = await app.db.getGuild(guildId);
		const channelId = guild?.[`${kind}ChannelId`];
		if (!channelId) {
			app.Logger.warn("Notify", `Guild ${guildId} has no ${kind} channel configured; skipping notification`);
			return false;
		}

		const discord = app.Platform.get(1);
		if (!discord?.client) {
			app.Logger.warn("Notify", "Discord platform not connected; skipping notification");
			return false;
		}

		await discord.sendToChannel(channelId, payload);
		return true;
	}
	catch (e) {
		app.Logger.error("Notify", { message: `Failed to notify guild ${guildId}`, error: e.message });
		return false;
	}
};

module.exports = { sendToGuildChannel };
