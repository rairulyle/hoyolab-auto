const { test } = require("node:test");
const assert = require("node:assert/strict");

const { isValidHhmm, isValidTimezone, hhmmToCron, todayInTz, nextOccurrenceUnix } = require("../time.js");

test("isValidHhmm", () => {
	assert.equal(isValidHhmm("00:00"), true);
	assert.equal(isValidHhmm("23:59"), true);
	assert.equal(isValidHhmm("24:00"), false);
	assert.equal(isValidHhmm("9:30"), false);
	assert.equal(isValidHhmm("abc"), false);
});

test("isValidTimezone", () => {
	assert.equal(isValidTimezone("Asia/Manila"), true);
	assert.equal(isValidTimezone("UTC"), true);
	assert.equal(isValidTimezone("Mars/Olympus"), false);
});

test("hhmmToCron", () => {
	assert.equal(hhmmToCron("09:30"), "0 30 9 * * *");
	assert.equal(hhmmToCron("00:00"), "0 0 0 * * *");
});

test("todayInTz returns ISO date shifted by timezone", () => {
	assert.match(todayInTz("UTC"), /^\d{4}-\d{2}-\d{2}$/);
	const utcPlus14 = todayInTz("Pacific/Kiritimati");
	const utcMinus11 = todayInTz("Pacific/Pago_Pago");
	assert.notEqual(utcPlus14, utcMinus11);
});

test("nextOccurrenceUnix is in the future and lands on the requested wall time", () => {
	const now = new Date("2026-07-07T10:00:00Z");
	const unix = nextOccurrenceUnix("12:00", "UTC", now);
	assert.equal(unix, Date.parse("2026-07-07T12:00:00Z") / 1000);
	const past = nextOccurrenceUnix("09:00", "UTC", now);
	assert.equal(past, Date.parse("2026-07-08T09:00:00Z") / 1000);
});
