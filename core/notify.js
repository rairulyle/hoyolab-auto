const { gameKeyFromEngineName } = require("../config/games.js");

const resolveChannelId = (guild, kind) => guild?.[`${kind}ChannelId`] ?? guild?.defaultChannelId ?? null;

const sendToGuildChannel = async (guildId, kind, payload) => {
	try {
		const guild = await app.db.getGuild(guildId);
		const channelId = resolveChannelId(guild, kind);
		if (!channelId) {
			app.Logger.warn("Notify", `Guild ${guildId} has no ${kind} (or default) channel configured; skipping notification`);
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

const sendWebhookTelegram = async (platforms, { embeds, telegramText, account, ping = false }) => {
	for (const webhook of platforms.filter(p => p.name === "webhook")) {
		const content = ping && account ? webhook.createUserMention(account.discord) : undefined;
		for (const embed of embeds) {
			await webhook.send(embed, { content });
		}
	}
	if (telegramText) {
		for (const telegram of platforms.filter(p => p.name === "telegram")) {
			await telegram.send(telegramText);
		}
	}
};

const notifyAccount = async (account, { embeds, telegramText, ping = false, kind }) => {
	try {
		const gameKey = gameKeyFromEngineName(account.platform);
		if (gameKey) {
			const profiles = await app.db.findProfilesByGameUid(gameKey, account.uid);
			for (const profile of profiles) {
				const content = ping && profile.discordUserId ? `<@${profile.discordUserId}>` : undefined;
				await sendToGuildChannel(profile.guildId, kind, { content, embeds });
			}
		}

		const platforms = app.Platform.getForAccount(account);
		await sendWebhookTelegram(platforms, { embeds, telegramText, account, ping });
	}
	catch (e) {
		app.Logger.error("Notify", { message: "notifyAccount failed", error: e.message });
	}
};

const notifyGuildsForGame = async (gameKey, { embeds, telegramText, kind }) => {
	try {
		const profiles = (await app.db.listAllProfiles())
			.filter(p => p.tokenStatus !== "expired" && (p.games ?? []).some(g => g.active && g.key === gameKey));
		const guildIds = [...new Set(profiles.map(p => p.guildId))];
		for (const guildId of guildIds) {
			await sendToGuildChannel(guildId, kind, { embeds });
		}

		await sendWebhookTelegram(app.Platform.list, { embeds, telegramText });
	}
	catch (e) {
		app.Logger.error("Notify", { message: "notifyGuildsForGame failed", error: e.message });
	}
};

module.exports = { sendToGuildChannel, resolveChannelId, notifyAccount, notifyGuildsForGame };
