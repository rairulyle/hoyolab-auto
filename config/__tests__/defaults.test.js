const { test } = require("node:test");
const assert = require("node:assert/strict");

const { GAMES, gameKeyFromRecordCardId } = require("../games.js");
const defaults = require("../defaults.js");

test("catalog maps record card ids to game keys", () => {
	assert.equal(gameKeyFromRecordCardId(2), "genshin");
	assert.equal(gameKeyFromRecordCardId(6), "starrail");
	assert.equal(gameKeyFromRecordCardId(8), "zenless");
	assert.equal(gameKeyFromRecordCardId(1), "honkai");
	assert.equal(gameKeyFromRecordCardId(999), null);
	assert.equal(GAMES.termis.recordCardGameId, null);
});

test("every game has default settings", () => {
	for (const key of Object.keys(GAMES)) {
		assert.ok(defaults.gameSettings[key], `missing defaults for ${key}`);
	}
	assert.equal(defaults.gameSettings.genshin.stamina.check, false);
	assert.equal(typeof defaults.gameSettings.genshin.stamina.threshold, "number");
});

test("mergeSettings deep-merges overrides without mutating base", () => {
	const base = defaults.gameSettings.genshin;
	const merged = defaults.mergeSettings(base, { stamina: { check: true } });
	assert.equal(merged.stamina.check, true);
	assert.equal(merged.stamina.threshold, base.stamina.threshold);
	assert.equal(base.stamina.check, false);
	assert.equal(merged.dailiesCheck, base.dailiesCheck);
});
