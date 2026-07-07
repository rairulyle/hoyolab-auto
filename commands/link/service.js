const { parseCookie } = require("../../core/cookie.js");
const { detectGames } = require("../../core/hoyolab-api.js");

const buildGames = (detected, includeTot) => {
	const games = detected.map(d => ({
		key: d.key,
		uid: d.uid,
		region: d.region,
		nickname: d.nickname,
		active: true,
		settings: {}
	}));

	if (includeTot) {
		games.push({ key: "termis", uid: null, region: null, nickname: null, active: true, settings: {} });
	}

	return games;
};

const mergeGames = (oldGames, newGames) => newGames.map(game => {
	const previous = (oldGames ?? []).find(g => g.key === game.key);
	return previous
		? { ...game, active: previous.active, settings: previous.settings ?? {} }
		: game;
});

const linkProfile = async ({ db, guildId, label, discordUserId, cookie, includeTot, detect = detectGames }) => {
	const parsed = parseCookie(cookie);
	const detected = await detect(parsed.cookie, parsed.ltuid);

	const games = buildGames(detected, includeTot);
	if (games.length === 0) {
		throw new Error("No games found for this HoYoLAB account. Nothing to link.");
	}

	const existing = await db.getProfile(guildId, label);
	const profile = await db.upsertProfile({
		guildId,
		label,
		cookie: parsed.cookie,
		ltuid: parsed.ltuid,
		tokenStatus: "active",
		discordUserId,
		games: existing ? mergeGames(existing.games, games) : games
	});

	return { profile, detected };
};

module.exports = { buildGames, mergeGames, linkProfile };
