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

test("buildGames maps detections and optionally appends tot", () => {
	const games = buildGames(DETECTED, true);
	assert.equal(games.length, 3);
	assert.deepEqual(games[0], { key: "genshin", uid: "800", region: "os_asia", nickname: "T", active: true, settings: {} });
	assert.equal(games[2].key, "termis");
	assert.equal(games[2].uid, null);
});

test("mergeGames preserves settings and active for matching keys", () => {
	const oldGames = [{ key: "genshin", uid: "800", active: false, settings: { stamina: { check: true } } }];
	const merged = mergeGames(oldGames, buildGames(DETECTED, false));
	const genshin = merged.find(g => g.key === "genshin");
	assert.equal(genshin.active, false);
	assert.equal(genshin.settings.stamina.check, true);
	assert.equal(merged.find(g => g.key === "starrail").active, true);
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
		includeTot: false,
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
		includeTot: false,
		detect: async () => DETECTED
	});
	assert.equal(relinked.games.find(g => g.key === "genshin").settings.stamina.check, true);

	await assert.rejects(() => linkProfile({
		db, guildId: "g1", label: "x", discordUserId: "u1", cookie: "garbage", includeTot: false, detect: async () => DETECTED
	}), /ltoken_v2/);

	await assert.rejects(() => linkProfile({
		db, guildId: "g1", label: "x", discordUserId: "u1", cookie: COOKIE, includeTot: false, detect: async () => []
	}), /No games/i);

	fs.rmSync(dir, { recursive: true, force: true });
});
