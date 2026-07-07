const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCookie } = require("../cookie.js");

const BASE = "ltoken_v2=tokenval; ltuid_v2=12345678; ltmid_v2=midval";
const REDEEM = `${BASE}; cookie_token_v2=ctok; account_mid_v2=amid; account_id_v2=12345678`;

test("parses minimal cookie without redeem capability", () => {
	const parsed = parseCookie(BASE);
	assert.equal(parsed.ltuid, "12345678");
	assert.equal(parsed.codeRedeem, false);
	assert.equal(parsed.cookie, "ltoken_v2=tokenval; ltuid_v2=12345678; ltmid_v2=midval");
});

test("detects redeem capability and keeps redeem keys", () => {
	const parsed = parseCookie(REDEEM);
	assert.equal(parsed.codeRedeem, true);
	assert.match(parsed.cookie, /cookie_token_v2=ctok/);
	assert.match(parsed.cookie, /account_id_v2=12345678/);
});

test("tolerates extra keys, whitespace, and trailing semicolons", () => {
	const messy = ` mi18nLang=en-us;${BASE}; DEVICEFP=abc; `;
	const parsed = parseCookie(messy);
	assert.equal(parsed.ltuid, "12345678");
	assert.doesNotMatch(parsed.cookie, /DEVICEFP/);
});

test("throws on missing required keys", () => {
	assert.throws(() => parseCookie("ltoken_v2=x; ltmid_v2=y"), /ltuid_v2/);
	assert.throws(() => parseCookie(""), /ltoken_v2/);
});
