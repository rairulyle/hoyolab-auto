const { test } = require("node:test");
const assert = require("node:assert/strict");

const { resolveChannelId } = require("../notify.js");

test("resolveChannelId returns the specific channel when set", () => {
	assert.equal(resolveChannelId({ checkinChannelId: "a", defaultChannelId: "d" }, "checkin"), "a");
});

test("resolveChannelId falls back to the default channel", () => {
	assert.equal(resolveChannelId({ defaultChannelId: "d" }, "reminder"), "d");
});

test("resolveChannelId returns null when neither is set", () => {
	assert.equal(resolveChannelId({}, "checkin"), null);
	assert.equal(resolveChannelId(null, "checkin"), null);
});
