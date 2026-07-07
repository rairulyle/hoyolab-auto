const { test } = require("node:test");
const assert = require("node:assert/strict");

const { isValidTimezone, isValidCron, nextCronUnix, todayInTz } = require("../time.js");

test("isValidTimezone", () => {
	assert.equal(isValidTimezone("Asia/Manila"), true);
	assert.equal(isValidTimezone("UTC"), true);
	assert.equal(isValidTimezone("Mars/Olympus"), false);
});

test("isValidCron accepts 5- and 6-field expressions, rejects junk", () => {
	assert.equal(isValidCron("0 30 0 * * *"), true);
	assert.equal(isValidCron("* * * * *"), true);
	assert.equal(isValidCron("not a cron"), false);
	assert.equal(isValidCron("60 99 * * *"), false);
});

test("nextCronUnix returns a future unix timestamp in the given timezone", () => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const next = nextCronUnix("0 0 0 * * *", "UTC");
	assert.equal(Number.isInteger(next), true);
	assert.ok(next > nowSeconds, "next run should be in the future");
	assert.ok(next <= nowSeconds + 24 * 60 * 60 + 1, "a daily-midnight cron fires within 24h");
});

test("todayInTz returns ISO date shifted by timezone", () => {
	assert.match(todayInTz("UTC"), /^\d{4}-\d{2}-\d{2}$/);
	const utcPlus14 = todayInTz("Pacific/Kiritimati");
	const utcMinus11 = todayInTz("Pacific/Pago_Pago");
	assert.notEqual(utcPlus14, utcMinus11);
});
