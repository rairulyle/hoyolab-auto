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

const { PermissionFlagsBits } = require("discord.js");

test("guildAdminOnly sets Administrator default perms and disables DMs", () => {
	const cmd = new Command({
		name: "notes",
		description: "d",
		params: [{ name: "game", type: "string", description: "d", required: true }],
		guildAdminOnly: true,
		run: () => ({ reply: "ok" })
	});
	const json = cmd.getSlashCommandData().toJSON();
	assert.equal(json.default_member_permissions, String(PermissionFlagsBits.Administrator));
	assert.equal(json.dm_permission, false);
});

test("guildAdminOnly applies to commands with no params", () => {
	const cmd = new Command({
		name: "hilichurl",
		description: "d",
		params: [],
		guildAdminOnly: true,
		run: () => ({ reply: "ok" })
	});
	const json = cmd.getSlashCommandData().toJSON();
	assert.equal(json.default_member_permissions, String(PermissionFlagsBits.Administrator));
});

test("commands without the flag keep default (null) perms", () => {
	const cmd = new Command({
		name: "open",
		description: "d",
		params: [],
		run: () => ({ reply: "ok" })
	});
	const json = cmd.getSlashCommandData().toJSON();
	assert.equal(json.default_member_permissions ?? null, null);
	assert.notEqual(cmd.guildAdminOnly, true);
});

test("accounts param becomes an autocomplete option with no static choices", () => {
	const cmd = new Command({
		name: "diary",
		description: "d",
		params: [
			{ name: "account", type: "string", description: "d", accounts: true, required: true }
		],
		run: () => ({ reply: "ok" })
	});
	const json = cmd.getSlashCommandData().toJSON();
	const opt = json.options.find((o) => o.name === "account");
	assert.equal(opt.autocomplete, true);
	assert.equal(opt.choices, undefined);
	assert.equal(typeof cmd.autocomplete, "function");
});

test("a custom autocomplete is not overridden by the default", () => {
	const custom = async () => {};
	const cmd = new Command({
		name: "x",
		description: "d",
		params: [{ name: "account", type: "string", accounts: true }],
		autocomplete: custom,
		run: () => ({ reply: "ok" })
	});
	assert.equal(cmd.autocomplete, custom);
});
