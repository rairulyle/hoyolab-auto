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
			games: [
				{ key: "genshin", uid: "800", active: true },
				{ key: "zenless", uid: "900", active: true },
				{ key: "termis", uid: "700", active: true }
			]
		})
	]);
	assert.ok(set.has("genshin:800"));
	assert.ok(set.has("nap:900"));
	assert.ok(set.has("tot:700"));
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
