const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("../index.js");

let dir;
let db;

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyodb-"));
	db = new Database(dir);
	await db.init();
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const profile = (over = {}) => ({
	guildId: "g1",
	label: "main",
	cookie: "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b",
	ltuid: "111",
	tokenStatus: "active",
	discordUserId: "u1",
	games: [
		{
			key: "genshin",
			uid: "800",
			region: "os_asia",
			nickname: "Trav",
			active: true,
			settings: {}
		}
	],
	...over
});

test("upsert + get + list are guild-scoped", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2", label: "main", ltuid: "222" }));

	const found = await db.getProfile("g1", "main");
	assert.equal(found.ltuid, "111");
	assert.equal((await db.listProfiles("g1")).length, 1);
	assert.equal((await db.listAllProfiles()).length, 2);
});

test("upsert same guild+label updates instead of duplicating", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ discordUserId: "u2" }));
	const all = await db.listProfiles("g1");
	assert.equal(all.length, 1);
	assert.equal(all[0].discordUserId, "u2");
});

test("label lookup is case-insensitive", async () => {
	await db.upsertProfile(profile());
	assert.ok(await db.getProfile("g1", "MAIN"));
});

test("removeProfile only removes in its guild", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2" }));
	assert.equal(await db.removeProfile("g1", "main"), 1);
	assert.equal((await db.listAllProfiles()).length, 1);
});

test("updateGameEntry deep-merges settings and sets active", async () => {
	const saved = await db.upsertProfile(profile());
	await db.updateGameEntry(saved._id, "genshin", { settings: { stamina: { check: true } } });
	await db.updateGameEntry(saved._id, "genshin", { active: false });
	const found = await db.getProfile("g1", "main");
	assert.equal(found.games[0].settings.stamina.check, true);
	assert.equal(found.games[0].active, false);
});

test("findProfilesByGameUid finds across guilds", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2" }));
	const hits = await db.findProfilesByGameUid("genshin", "800");
	assert.equal(hits.length, 2);
});

test("findProfilesByLtuid finds across guilds", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2" }));
	const hits = await db.findProfilesByLtuid("111");
	assert.equal(hits.length, 2);
	assert.equal((await db.findProfilesByLtuid("999")).length, 0);
});

test("addGameEntry appends a game once, idempotent on the key", async () => {
	const saved = await db.upsertProfile(profile());
	const entry = {
		key: "termis",
		uid: null,
		region: null,
		nickname: null,
		active: true,
		settings: {}
	};
	await db.addGameEntry(saved._id, entry);
	await db.addGameEntry(saved._id, { ...entry, active: false });
	const found = await db.getProfile("g1", "main");
	const termis = found.games.filter((g) => g.key === "termis");
	assert.equal(termis.length, 1);
	assert.equal(termis[0].active, true);
});

test("guild settings upsert", async () => {
	await db.setGuildField("g1", "timezone", "Asia/Manila");
	await db.setGuildField("g1", "checkinChannelId", "c1");
	const guild = await db.getGuild("g1");
	assert.equal(guild.timezone, "Asia/Manila");
	assert.equal(guild.checkinChannelId, "c1");
	assert.equal((await db.listGuilds()).length, 1);
});

test("recordCheckin upserts one row per profile+game+date", async () => {
	const saved = await db.upsertProfile(profile());
	const row = {
		profileId: saved._id,
		guildId: "g1",
		game: "genshin",
		date: "2026-07-07",
		status: "ok",
		message: "done"
	};
	await db.recordCheckin(row);
	await db.recordCheckin({ ...row, status: "already" });
	const found = await db.getCheckin(saved._id, "genshin", "2026-07-07");
	assert.equal(found.status, "already");
});

test("setTokenStatus flips status", async () => {
	const saved = await db.upsertProfile(profile());
	await db.setTokenStatus(saved._id, "expired");
	assert.equal((await db.getProfile("g1", "main")).tokenStatus, "expired");
});

test("setProfileOwner sets and clears the discordUserId, returning the updated doc", async () => {
	const created = await db.upsertProfile(profile({ discordUserId: "u1" }));

	const set = await db.setProfileOwner(created._id, "u2");
	assert.equal(set.discordUserId, "u2");
	assert.equal((await db.getProfile("g1", "main")).discordUserId, "u2");

	const cleared = await db.setProfileOwner(created._id, null);
	assert.equal(cleared.discordUserId, null);
	assert.equal((await db.getProfile("g1", "main")).discordUserId, null);
});

test("renameProfile re-keys label and key, preserving _id", async () => {
	const inserted = await db.upsertProfile(profile({ label: "main" }));
	const renamed = await db.renameProfile(inserted._id, "Alt");
	assert.equal(renamed._id, inserted._id);
	assert.equal(renamed.label, "Alt");
	assert.equal(renamed.key, "g1:alt");
	assert.ok(await db.getProfile("g1", "Alt"));
	assert.equal(await db.getProfile("g1", "main"), null);
});

test("renameProfile rejects a label already used in the same guild", async () => {
	const a = await db.upsertProfile(profile({ label: "main" }));
	await db.upsertProfile(profile({ label: "alt" }));
	await assert.rejects(() => db.renameProfile(a._id, "ALT"), /already exists/);
});

test("renameProfile rejects empty label and unknown id", async () => {
	const a = await db.upsertProfile(profile({ label: "main" }));
	await assert.rejects(() => db.renameProfile(a._id, "   "), /empty/);
	await assert.rejects(() => db.renameProfile("nope", "x"), /not found/);
});

test("recordRedeem appends", async () => {
	const saved = await db.upsertProfile(profile());
	await db.recordRedeem({
		profileId: saved._id,
		guildId: "g1",
		game: "genshin",
		code: "CODE1",
		source: "auto",
		status: "ok",
		message: ""
	});
	await db.recordRedeem({
		profileId: saved._id,
		guildId: "g1",
		game: "genshin",
		code: "CODE1",
		source: "auto",
		status: "ok",
		message: ""
	});
	const rows = await db.collections.redeemResults.findAsync({ code: "CODE1" });
	assert.equal(rows.length, 2);
});

test("getRedeemStatuses returns statuses for a profile+game+code", async () => {
	await db.recordRedeem({
		profileId: "p1",
		guildId: "g1",
		game: "genshin",
		code: "ABC",
		source: "manual",
		status: "error"
	});
	await db.recordRedeem({
		profileId: "p1",
		guildId: "g1",
		game: "genshin",
		code: "ABC",
		source: "manual",
		status: "ok"
	});
	await db.recordRedeem({
		profileId: "p1",
		guildId: "g1",
		game: "genshin",
		code: "XYZ",
		source: "manual",
		status: "ok"
	});

	const statuses = await db.getRedeemStatuses("p1", "genshin", "ABC");
	assert.deepEqual(statuses.sort(), ["error", "ok"]);
	assert.deepEqual(await db.getRedeemStatuses("p1", "genshin", "NONE"), []);
});

test("findGuildProfilesByGameUid is guild-scoped", async () => {
	await db.upsertProfile(profile()); // g1, genshin uid 800
	await db.upsertProfile(
		profile({ guildId: "g2", label: "main", ltuid: "222" }) // g2, genshin uid 800
	);

	const g1 = await db.findGuildProfilesByGameUid("g1", "genshin", "800");
	assert.equal(g1.length, 1);
	assert.equal(g1[0].guildId, "g1");

	const none = await db.findGuildProfilesByGameUid("g1", "genshin", "999");
	assert.equal(none.length, 0);
});
