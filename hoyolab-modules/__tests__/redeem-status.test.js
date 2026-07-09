const { test } = require("node:test");
const assert = require("node:assert/strict");

const { classifyRedeem } = require("../redeem-status.js");

test("classifyRedeem maps redeem retcodes to fixed categories", () => {
	assert.equal(classifyRedeem(0), "ok");
	assert.equal(classifyRedeem(-2017), "already");
	assert.equal(classifyRedeem(-2003), "invalid");
	assert.equal(classifyRedeem(-2001), "expired");
	assert.equal(classifyRedeem(-2016), "cooldown");
});

test("classifyRedeem flags auth/cookie retcodes", () => {
	for (const rc of [-100, -1071, -10001, 10001, 10102]) {
		assert.equal(classifyRedeem(rc), "auth");
	}
});

test("classifyRedeem falls back to error for unknown/undefined", () => {
	assert.equal(classifyRedeem(-9999), "error");
	assert.equal(classifyRedeem(undefined), "error");
	assert.equal(classifyRedeem(null), "error");
});
