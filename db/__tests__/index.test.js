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
		{ key: "genshin", uid: "800", region: "os_asia", nickname: "Trav", active: true, settings: {} }
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
	const entry = { key: "termis", uid: null, region: null, nickname: null, active: true, settings: {} };
	await db.addGameEntry(saved._id, entry);
	await db.addGameEntry(saved._id, { ...entry, active: false });
	const found = await db.getProfile("g1", "main");
	const termis = found.games.filter(g => g.key === "termis");
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
	const row = { profileId: saved._id, guildId: "g1", game: "genshin", date: "2026-07-07", status: "ok", message: "done" };
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

test("recordRedeem appends", async () => {
	const saved = await db.upsertProfile(profile());
	await db.recordRedeem({ profileId: saved._id, guildId: "g1", game: "genshin", code: "CODE1", source: "auto", status: "ok", message: "" });
	await db.recordRedeem({ profileId: saved._id, guildId: "g1", game: "genshin", code: "CODE1", source: "auto", status: "ok", message: "" });
	const rows = await db.collections.redeemResults.findAsync({ code: "CODE1" });
	assert.equal(rows.length, 2);
});
