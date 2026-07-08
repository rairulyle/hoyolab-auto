const { test } = require("node:test");
const assert = require("node:assert/strict");

const Command = require("../command.js");

test("normalizeArguments drops undefined entries (Discord subcommand nodes)", () => {
	// interaction.options.data for a subcommand command yields [undefined];
	// this must not throw and must produce a clean array.
	assert.deepEqual(Command.normalizeArguments([undefined]), []);
	assert.deepEqual(Command.normalizeArguments([undefined, null, "add"]), ["add"]);
});

test("normalizeArguments coerces non-string option values to strings", () => {
	assert.deepEqual(Command.normalizeArguments([42, true, "text"]), ["42", "true", "text"]);
});

test("normalizeArguments strips whitespace and filters empties (Telegram text args)", () => {
	assert.deepEqual(Command.normalizeArguments(["", "  ", "link", "add"]), ["link", "add"]);
});
