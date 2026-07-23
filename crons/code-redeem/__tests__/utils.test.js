const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCodesPayload, filterNewCodes, redeemOutcome } = require("../utils.js");

test("parseCodesPayload keeps only OK codes", () => {
	const body = {
		codes: [
			{ code: "GOODCODE", status: "OK", rewards: "" },
			{ code: "DEADCODE", status: "NOT_OK", rewards: "" }
		]
	};
	const result = parseCodesPayload(body);
	assert.equal(result.length, 1);
	assert.equal(result[0].code, "GOODCODE");
	assert.equal(result[0].source, "hoyo-codes");
});

test("parseCodesPayload splits semicolon-separated rewards into a trimmed array", () => {
	const body = {
		codes: [
			{
				code: "LEGEDILJKSGM",
				status: "OK",
				rewards: "Primogem*60; Adventurer's Experience*5"
			}
		]
	};
	assert.deepEqual(parseCodesPayload(body)[0].rewards, [
		"Primogem*60",
		"Adventurer's Experience*5"
	]);
});

test("parseCodesPayload maps empty or missing rewards to an empty array", () => {
	const body = {
		codes: [
			{ code: "AAA", status: "OK", rewards: "" },
			{ code: "BBB", status: "OK" }
		]
	};
	const result = parseCodesPayload(body);
	assert.deepEqual(result[0].rewards, []);
	assert.deepEqual(result[1].rewards, []);
});

test("parseCodesPayload skips entries without a code", () => {
	const body = {
		codes: [
			{ code: "", status: "OK", rewards: "" },
			{ status: "OK", rewards: "" },
			{ code: "REAL", status: "OK", rewards: "" }
		]
	};
	const result = parseCodesPayload(body);
	assert.equal(result.length, 1);
	assert.equal(result[0].code, "REAL");
});

test("parseCodesPayload returns null for malformed payloads", () => {
	assert.equal(parseCodesPayload(null), null);
	assert.equal(parseCodesPayload({}), null);
	assert.equal(parseCodesPayload({ codes: "nope" }), null);
});

test("parseCodesPayload returns an empty array when no codes are active", () => {
	assert.deepEqual(parseCodesPayload({ codes: [] }), []);
	assert.deepEqual(
		parseCodesPayload({ codes: [{ code: "X", status: "NOT_OK", rewards: "" }] }),
		[]
	);
});

test("filterNewCodes returns all codes when the cache is empty (no first-run seeding)", () => {
	const incoming = [{ code: "abc123" }, { code: "DEF456" }];
	assert.deepEqual(filterNewCodes(incoming, []), incoming);
});

test("filterNewCodes drops codes already in the cache, case-insensitively", () => {
	const incoming = [{ code: "abc123" }, { code: "NEWCODE" }];
	const result = filterNewCodes(incoming, ["ABC123"]);
	assert.equal(result.length, 1);
	assert.equal(result[0].code, "NEWCODE");
});

test("filterNewCodes skips entries without a usable code value", () => {
	const incoming = [{ code: "" }, {}, { code: "OK1" }];
	const result = filterNewCodes(incoming, []);
	assert.equal(result.length, 1);
	assert.equal(result[0].code, "OK1");
});

test("redeemOutcome maps success to the success bucket", () => {
	assert.deepEqual(redeemOutcome({ success: true, retcode: 0 }), {
		bucket: "success",
		status: "ok"
	});
});

test("redeemOutcome routes already-redeemed codes to the quiet bucket", () => {
	assert.deepEqual(redeemOutcome({ success: false, retcode: -2017 }), {
		bucket: "already",
		status: "already"
	});
});

test("redeemOutcome records invalid and expired with their own statuses", () => {
	assert.deepEqual(redeemOutcome({ success: false, retcode: -2003 }), {
		bucket: "failed",
		status: "invalid"
	});
	assert.deepEqual(redeemOutcome({ success: false, retcode: -2001 }), {
		bucket: "failed",
		status: "expired"
	});
});

test("redeemOutcome maps cooldown, auth, and unknown retcodes to error", () => {
	for (const retcode of [-2016, -100, -9999, undefined]) {
		assert.deepEqual(redeemOutcome({ success: false, retcode }), {
			bucket: "failed",
			status: "error"
		});
	}
});
