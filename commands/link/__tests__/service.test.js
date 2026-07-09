const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("../../../db/index.js");
const { buildGames, mergeGames, linkProfile } = require("../service.js");

const COOKIE = "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b";
const DETECTED = [
	{ key: "genshin", uid: "800", region: "os_asia", nickname: "T", level: 60 },
	{ key: "starrail", uid: "801", region: "prod_official_asia", nickname: "B", level: 70 }
];

test("buildGames maps only detected games (never auto-adds tot)", () => {
	const games = buildGames(DETECTED);
	assert.equal(games.length, 2);
	assert.deepEqual(games[0], {
		key: "genshin",
		uid: "800",
		region: "os_asia",
		nickname: "T",
		active: true,
		settings: {}
	});
	assert.ok(!games.some((g) => g.key === "termis"));
});

test("mergeGames preserves settings and active for matching keys", () => {
	const oldGames = [
		{ key: "genshin", uid: "800", active: false, settings: { stamina: { check: true } } }
	];
	const merged = mergeGames(oldGames, buildGames(DETECTED));
	const genshin = merged.find((g) => g.key === "genshin");
	assert.equal(genshin.active, false);
	assert.equal(genshin.settings.stamina.check, true);
	assert.equal(merged.find((g) => g.key === "starrail").active, true);
});

test("mergeGames retains old games not in the new detection (e.g. manually-enabled ToT)", () => {
	const oldGames = [
		{ key: "genshin", uid: "800", active: true, settings: {} },
		{ key: "termis", uid: null, active: true, settings: { redeemCode: true } }
	];
	const merged = mergeGames(oldGames, buildGames(DETECTED));
	const termis = merged.find((g) => g.key === "termis");
	assert.ok(termis, "termis should survive a relink that doesn't re-detect it");
	assert.equal(termis.settings.redeemCode, true);
});

test("linkProfile validates, detects, and upserts; relink preserves settings", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyolink-"));
	const db = new Database(dir);
	await db.init();

	const { profile } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(profile.ltuid, "111");
	assert.equal(profile.games.length, 2);
	assert.equal(profile.tokenStatus, "active");

	await db.updateGameEntry(profile._id, "genshin", { settings: { stamina: { check: true } } });
	const { profile: relinked } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(relinked.games.find((g) => g.key === "genshin").settings.stamina.check, true);

	await assert.rejects(
		() =>
			linkProfile({
				db,
				guildId: "g1",
				label: "x",
				discordUserId: "u1",
				cookie: "garbage",
				detect: async () => DETECTED
			}),
		/ltoken_v2/
	);

	await assert.rejects(
		() =>
			linkProfile({
				db,
				guildId: "g1",
				label: "x",
				discordUserId: "u1",
				cookie: COOKIE,
				detect: async () => []
			}),
		/No games/i
	);

	fs.rmSync(dir, { recursive: true, force: true });
});

test("linkProfile keeps the existing owner when discordUserId is omitted (refresh), clears on explicit null", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyolink-"));
	const db = new Database(dir);
	await db.init();

	await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: "owner1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});

	const { profile: refreshed } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(refreshed.discordUserId, "owner1");

	const { profile: cleared } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: null,
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(cleared.discordUserId, null);

	fs.rmSync(dir, { recursive: true, force: true });
});

test("linkProfile refuses to overwrite a label held by a different account", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyolink-"));
	const db = new Database(dir);
	await db.init();

	const OTHER_COOKIE = "ltoken_v2=a; ltuid_v2=222; ltmid_v2=b";

	await linkProfile({
		db,
		guildId: "g1",
		label: "Skull - US",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});

	await assert.rejects(
		() =>
			linkProfile({
				db,
				guildId: "g1",
				label: "Skull - US",
				discordUserId: "u1",
				cookie: OTHER_COOKIE,
				detect: async () => DETECTED
			}),
		/already linked to a different account/i
	);

	const { profile } = await linkProfile({
		db,
		guildId: "g1",
		label: "Skull - US",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(profile.ltuid, "111");

	fs.rmSync(dir, { recursive: true, force: true });
});
