const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCodesPayload } = require("../utils.js");

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
