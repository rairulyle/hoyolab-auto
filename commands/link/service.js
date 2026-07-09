const { parseCookie } = require("../../core/cookie.js");
const { detectGames } = require("../../core/hoyolab-api.js");

const buildGames = (detected) =>
	detected.map((d) => ({
		key: d.key,
		uid: d.uid,
		region: d.region,
		nickname: d.nickname,
		active: true,
		settings: {}
	}));

const mergeGames = (oldGames, newGames) => {
	const newKeys = new Set(newGames.map((g) => g.key));
	const merged = newGames.map((game) => {
		const previous = (oldGames ?? []).find((g) => g.key === game.key);
		return previous
			? { ...game, active: previous.active, settings: previous.settings ?? {} }
			: game;
	});
	const retained = (oldGames ?? []).filter((g) => !newKeys.has(g.key));
	return [...merged, ...retained];
};

const linkProfile = async ({ db, guildId, label, discordUserId, cookie, detect = detectGames }) => {
	const parsed = parseCookie(cookie);
	const detected = await detect(parsed.cookie, parsed.ltuid);

	const games = buildGames(detected);
	if (games.length === 0) {
		throw new Error("No games found for this HoYoLAB account. Nothing to link.");
	}

	const existing = await db.getProfile(guildId, label);
	if (existing && existing.ltuid !== parsed.ltuid) {
		throw new Error(
			`Label "${label}" is already linked to a different account ` +
				`(uid ${existing.ltuid}). Choose a different label, or use ` +
				`/link refresh to update that profile.`
		);
	}
	const profile = await db.upsertProfile({
		guildId,
		label,
		cookie: parsed.cookie,
		ltuid: parsed.ltuid,
		tokenStatus: "active",
		discordUserId:
			discordUserId === undefined ? (existing?.discordUserId ?? null) : discordUserId,
		games: existing ? mergeGames(existing.games, games) : games
	});

	return { profile, detected };
};

module.exports = { buildGames, mergeGames, linkProfile };
