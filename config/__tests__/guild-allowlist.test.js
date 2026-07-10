const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { parseGuildAllowlist, isGuildAllowed, isRestricted } = require("../guild-allowlist.js");

afterEach(() => {
	delete process.env.GUILD_IDS;
});

test("parseGuildAllowlist splits comma-separated ids and trims each", () => {
	assert.deepEqual([...parseGuildAllowlist("111, 222 ,333")], ["111", "222", "333"]);
});

test("parseGuildAllowlist drops empty entries and trailing commas", () => {
	assert.deepEqual([...parseGuildAllowlist("111,,222,")].sort(), ["111", "222"]);
});

test("parseGuildAllowlist returns an empty set for empty/whitespace/undefined", () => {
	assert.equal(parseGuildAllowlist("").size, 0);
	assert.equal(parseGuildAllowlist("   ").size, 0);
	assert.equal(parseGuildAllowlist(undefined).size, 0);
});

test("isGuildAllowed allows everything and isRestricted is false when unset", () => {
	delete process.env.GUILD_IDS;
	assert.equal(isRestricted(), false);
	assert.equal(isGuildAllowed("anything"), true);
});

test("isGuildAllowed enforces membership and isRestricted is true when set", () => {
	process.env.GUILD_IDS = "111,222";
	assert.equal(isRestricted(), true);
	assert.equal(isGuildAllowed("111"), true);
	assert.equal(isGuildAllowed(222), true);
	assert.equal(isGuildAllowed("999"), false);
});
