const defaults = require("../config/defaults.js");
const { GAMES } = require("../config/games.js");

const botIdFromToken = (token) => {
	try {
		const decoded = Buffer.from(token.split(".")[0], "base64").toString("utf8");
		return /^\d{15,21}$/.test(decoded) ? decoded : null;
	}
	catch {
		return null;
	}
};

const assemble = async (db, env = process.env) => {
	const token = env.DISCORD_TOKEN;
	if (!token) {
		throw new Error("DISCORD_TOKEN is not set. Add it to your .env file.");
	}

	const botId = env.DISCORD_BOT_ID ?? botIdFromToken(token);
	if (!botId) {
		throw new Error("Could not derive bot ID from DISCORD_TOKEN; set DISCORD_BOT_ID in .env.");
	}

	const profiles = (await db.listAllProfiles()).filter(p => p.tokenStatus !== "expired");
	const redeemCron = (await db.getSetting("redeemCron")) ?? defaults.redeemCron;

	const warnings = [];
	const seen = new Set();
	const grouped = {};

	for (const profile of profiles) {
		for (const game of profile.games ?? []) {
			if (!game.active || !GAMES[game.key]) {
				continue;
			}

			const identity = `${game.key}:${profile.ltuid}`;
			if (seen.has(identity)) {
				warnings.push(`Skipped duplicate account ${identity} (label "${profile.label}" in guild ${profile.guildId}); ltuid ${profile.ltuid} already assembled for ${game.key}`);
				continue;
			}
			seen.add(identity);

			grouped[game.key] ??= [];
			grouped[game.key].push({
				cookie: profile.cookie,
				discord: { userId: profile.discordUserId ?? null },
				allowedPlatforms: null,
				...defaults.mergeSettings(defaults.gameSettings[game.key], game.settings ?? {})
			});
		}
	}

	const accounts = Object.entries(grouped).map(([key, data]) => ({
		id: GAMES[key].engineAccountId,
		active: true,
		type: GAMES[key].type,
		data
	}));

	return {
		loglevel: defaults.loglevel,
		userAgent: defaults.userAgent,
		retry: defaults.retry,
		testNotification: { enabled: false },
		platforms: [{ id: 1, active: true, type: "discord", botId, token }],
		crons: { ...defaults.crons, codeRedeem: redeemCron },
		accounts,
		warnings
	};
};

module.exports = { assemble };
