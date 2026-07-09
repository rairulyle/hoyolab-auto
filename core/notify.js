const { gameKeyFromEngineName } = require("../config/games.js");

const resolveChannelId = (guild, kind) =>
	guild?.[`${kind}ChannelId`] ?? guild?.defaultChannelId ?? null;

const sendToGuildChannel = async (guildId, kind, payload) => {
	try {
		const guild = await app.db.getGuild(guildId);
		const channelId = resolveChannelId(guild, kind);
		if (!channelId) {
			app.Logger.warn(
				"Notify",
				`Guild ${guildId} has no ${kind} (or default) channel configured; skipping notification`
			);
			return false;
		}

		const discord = app.Platform.get(1);
		if (!discord?.client) {
			app.Logger.warn("Notify", "Discord platform not connected; skipping notification");
			return false;
		}

		await discord.sendToChannel(channelId, payload);
		return true;
	} catch (e) {
		app.Logger.error("Notify", {
			message: `Failed to notify guild ${guildId}`,
			error: e.message
		});
		return false;
	}
};

const sendTelegram = async (platforms, { telegramText }) => {
	if (telegramText) {
		for (const telegram of platforms.filter((p) => p.name === "telegram")) {
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
				const content =
					ping && profile.discordUserId ? `<@${profile.discordUserId}>` : undefined;
				await sendToGuildChannel(profile.guildId, kind, { content, embeds });
			}
		}

		const platforms = app.Platform.getForAccount(account);
		await sendTelegram(platforms, { telegramText });
	} catch (e) {
		app.Logger.error("Notify", { message: "notifyAccount failed", error: e.message });
	}
};

const notifyGuildsForGame = async (gameKey, { embeds, telegramText, kind }) => {
	try {
		const profiles = (await app.db.listAllProfiles()).filter(
			(p) =>
				p.tokenStatus !== "expired" &&
				(p.games ?? []).some((g) => g.active && g.key === gameKey)
		);
		const guildIds = [...new Set(profiles.map((p) => p.guildId))];
		for (const guildId of guildIds) {
			await sendToGuildChannel(guildId, kind, { embeds });
		}

		await sendTelegram(app.Platform.list, { telegramText });
	} catch (e) {
		app.Logger.error("Notify", { message: "notifyGuildsForGame failed", error: e.message });
	}
};

const LEVEL_DOT = { ok: "🟢", warn: "🟡", alert: "🔴", info: "⚪" };

const buildGroupedEmbed = (group, { titleSuffix, description }) => ({
	color: group.assets?.color ?? 0x5865f2,
	...(group.assets ? { author: { name: group.assets.author, icon_url: group.assets.logo } } : {}),
	title: `${group.name} · ${titleSuffix}`,
	description: [
		description,
		group.rows.map((r) => `${LEVEL_DOT[r.level] ?? "•"} **${r.ign}** — ${r.text}`).join("\n")
	]
		.filter(Boolean)
		.join("\n\n")
});

// One embed per guild+game for a reminder that applies to several accounts.
// entries: [{ account, assets, gameName, level, text, ping?, telegramText? }]
const notifyGroupedReminder = async ({ kind = "reminder", titleSuffix, description, entries }) => {
	try {
		const byGuild = new Map();
		for (const { account, assets, gameName, level, text, ping } of entries) {
			const gameKey = gameKeyFromEngineName(account.platform) ?? account.platform;
			const profiles = await app.db.findProfilesByGameUid(gameKey, account.uid);
			for (const profile of profiles) {
				if (profile.tokenStatus === "expired") {
					continue;
				}
				if (!byGuild.has(profile.guildId)) {
					byGuild.set(profile.guildId, new Map());
				}
				const games = byGuild.get(profile.guildId);
				if (!games.has(gameKey)) {
					games.set(gameKey, {
						name: gameName ?? assets?.game ?? gameKey,
						assets: assets ?? null,
						rows: [],
						pings: new Set()
					});
				}
				const group = games.get(gameKey);
				group.rows.push({ level, ign: account.nickname ?? profile.label, text });
				if (ping && profile.discordUserId) {
					group.pings.add(`<@${profile.discordUserId}>`);
				}
			}
		}

		for (const [guildId, groups] of byGuild) {
			const embeds = [];
			const pings = new Set();
			for (const group of groups.values()) {
				embeds.push(buildGroupedEmbed(group, { titleSuffix, description }));
				for (const p of group.pings) {
					pings.add(p);
				}
			}
			for (let i = 0; i < embeds.length; i += 10) {
				await sendToGuildChannel(guildId, kind, {
					content: i === 0 && pings.size > 0 ? [...pings].join(" ") : undefined,
					embeds: embeds.slice(i, i + 10)
				});
			}
		}

		for (const { account, telegramText } of entries) {
			if (telegramText) {
				await sendTelegram(app.Platform.getForAccount(account), { telegramText });
			}
		}
	} catch (e) {
		app.Logger.error("Notify", { message: "notifyGroupedReminder failed", error: e.message });
	}
};

const buildRedeemEmbed = (group) => {
	const head = [`\`${group.code}\``, group.rewards?.length ? group.rewards.join(", ") : null]
		.filter(Boolean)
		.join(" — ");
	const rows = group.rows.map((r) =>
		r.success ? `🟢 **${r.ign}** — redeemed` : `🔴 **${r.ign}** — ${r.reason ?? "failed"}`
	);
	return {
		color: group.assets?.color ?? 0x5865f2,
		...(group.assets
			? { author: { name: group.assets.author, icon_url: group.assets.logo } }
			: {}),
		title: `${group.gameName} · Code Redeemed`,
		description: `${head}\n\n${rows.join("\n")}`
	};
};

// One embed per code (per guild) listing which accounts redeemed it.
// entries: [{ account, code, rewards?, success, reason?, telegramText? }]
const notifyGroupedRedeem = async ({ entries }) => {
	try {
		const byGuild = new Map();
		for (const { account, code, rewards, success, reason } of entries) {
			const gameKey = gameKeyFromEngineName(account.platform) ?? account.platform;
			const profiles = await app.db.findProfilesByGameUid(gameKey, account.uid);
			for (const profile of profiles) {
				if (profile.tokenStatus === "expired") {
					continue;
				}
				if (!byGuild.has(profile.guildId)) {
					byGuild.set(profile.guildId, new Map());
				}
				const codes = byGuild.get(profile.guildId);
				const key = `${gameKey}:${code}`;
				if (!codes.has(key)) {
					codes.set(key, {
						gameName: account.game?.name ?? account.assets?.game ?? gameKey,
						assets: account.assets ?? null,
						code,
						rewards: rewards ?? null,
						rows: []
					});
				}
				const group = codes.get(key);
				group.rows.push({ success, ign: account.nickname ?? profile.label, reason });
			}
		}

		for (const [guildId, codes] of byGuild) {
			const embeds = [...codes.values()].map(buildRedeemEmbed);
			for (let i = 0; i < embeds.length; i += 10) {
				await sendToGuildChannel(guildId, "redeem", { embeds: embeds.slice(i, i + 10) });
			}
		}

		for (const { account, telegramText } of entries) {
			if (telegramText) {
				await sendTelegram(app.Platform.getForAccount(account), { telegramText });
			}
		}
	} catch (e) {
		app.Logger.error("Notify", { message: "notifyGroupedRedeem failed", error: e.message });
	}
};

module.exports = {
	sendToGuildChannel,
	resolveChannelId,
	notifyAccount,
	notifyGuildsForGame,
	notifyGroupedReminder,
	notifyGroupedRedeem,
	buildGroupedEmbed,
	buildRedeemEmbed
};
