const { test } = require("node:test");
const assert = require("node:assert/strict");

const { guildUidSet, filterByGuild } = require("../guild-accounts.js");

const profile = (over = {}) => ({
	guildId: "g1",
	label: "main",
	games: [{ key: "genshin", uid: "800", active: true }],
	...over
});

test("guildUidSet maps game keys to engine names", () => {
	const set = guildUidSet([
		profile({
			ltuid: "111",
			games: [
				{ key: "genshin", uid: "800", active: true },
				{ key: "zenless", uid: "900", active: true },
				{ key: "termis", uid: "700", active: true }
			]
		})
	]);
	assert.ok(set.has("genshin:800"));
	assert.ok(set.has("nap:900"));
	assert.ok(set.has("tot:111"));
});

test("guildUidSet keys Tears of Themis by ltuid (no game-record uid)", () => {
	const withLtuid = guildUidSet([
		profile({
			ltuid: "222",
			games: [{ key: "termis", uid: null, active: true }]
		})
	]);
	assert.ok(withLtuid.has("tot:222"));

	const withoutLtuid = guildUidSet([
		profile({
			games: [{ key: "termis", uid: null, active: true }]
		})
	]);
	assert.equal(
		[...withoutLtuid].some((key) => key.startsWith("tot:")),
		false
	);
});

test("guildUidSet skips inactive entries and null uids", () => {
	const set = guildUidSet([
		profile({
			games: [
				{ key: "genshin", uid: "800", active: false },
				{ key: "starrail", uid: null, active: true },
				{ key: "starrail", uid: "801", active: true }
			]
		})
	]);
	assert.equal(set.has("genshin:800"), false);
	assert.equal(set.has("starrail:null"), false);
	assert.ok(set.has("starrail:801"));
	assert.equal(set.size, 1);
});

test("guildUidSet tolerates empty/missing input", () => {
	assert.equal(guildUidSet([]).size, 0);
	assert.equal(guildUidSet(undefined).size, 0);
	assert.equal(guildUidSet([{ guildId: "g1" }]).size, 0);
});

test("filterByGuild keeps only accounts in the uid set", () => {
	const pool = [
		{ platform: "genshin", uid: "800" },
		{ platform: "nap", uid: "900" },
		{ platform: "genshin", uid: "999" }
	];
	const set = new Set(["genshin:800", "nap:900"]);
	const result = filterByGuild(pool, set);
	assert.deepEqual(
		result.map((a) => `${a.platform}:${a.uid}`),
		["genshin:800", "nap:900"]
	);
});

test("filterByGuild returns empty for an empty set", () => {
	assert.deepEqual(filterByGuild([{ platform: "genshin", uid: "800" }], new Set()), []);
});

test("a foreign-guild uid is excluded, so redeem's account lookup finds nothing", () => {
	// Guild A only linked genshin:800; guild B's genshin:999 is active in the
	// global pool. The redeem guard resolves accounts against guild A's set and
	// then .find()s by uid — a foreign uid must not resolve to an account.
	const guildAProfiles = [profile({ games: [{ key: "genshin", uid: "800", active: true }] })];
	const pool = [
		{ platform: "genshin", uid: "800", nickname: "mine" },
		{ platform: "genshin", uid: "999", nickname: "someone-else" }
	];
	const scoped = filterByGuild(pool, guildUidSet(guildAProfiles));
	assert.equal(
		scoped.find((a) => a.uid === "999"),
		undefined
	);
	assert.ok(scoped.find((a) => a.uid === "800"));
});
