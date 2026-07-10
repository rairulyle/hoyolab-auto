const { test } = require("node:test");
const assert = require("node:assert/strict");

const { assemble } = require("../assembler.js");

const fakeDb = (profiles) => ({ listAllProfiles: async () => profiles });
const ENV = { DISCORD_TOKEN: "token.abc.def", DISCORD_BOT_ID: "999" };

const profile = (over = {}) => ({
	_id: "p1",
	guildId: "g1",
	label: "main",
	cookie: "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b",
	ltuid: "111",
	tokenStatus: "active",
	discordUserId: "u1",
	games: [
		{
			key: "genshin",
			uid: "800",
			region: "os_asia",
			nickname: "T",
			active: true,
			settings: { stamina: { check: true } }
		}
	],
	...over
});

test("assembles game-grouped accounts with merged settings", async () => {
	const cfg = await assemble(fakeDb([profile()]), ENV);
	assert.equal(cfg.accounts.length, 1);
	const genshin = cfg.accounts[0];
	assert.equal(genshin.type, "genshin");
	assert.equal(genshin.data.length, 1);
	const acc = genshin.data[0];
	assert.equal(acc.cookie, "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b");
	assert.equal(acc.stamina.check, true);
	assert.equal(typeof acc.stamina.threshold, "number");
	assert.deepEqual(acc.discord, { userId: "u1" });
});

test("one profile with two games yields two account groups sharing the cookie", async () => {
	const games = [
		{ key: "genshin", uid: "800", active: true, settings: {} },
		{ key: "starrail", uid: "801", active: true, settings: {} }
	];
	const cfg = await assemble(fakeDb([profile({ games })]), ENV);
	assert.equal(cfg.accounts.length, 2);
	assert.equal(cfg.accounts[0].data[0].cookie, cfg.accounts[1].data[0].cookie);
});

test("skips expired profiles, inactive games, and duplicate ltuid per game", async () => {
	const cfg = await assemble(
		fakeDb([
			profile({ _id: "p1" }),
			profile({ _id: "p2", guildId: "g2", label: "other" }),
			profile({
				_id: "p3",
				guildId: "g3",
				label: "dead",
				tokenStatus: "expired",
				ltuid: "333"
			}),
			profile({
				_id: "p4",
				guildId: "g4",
				label: "off",
				ltuid: "444",
				games: [{ key: "genshin", uid: "900", active: false, settings: {} }]
			})
		]),
		ENV
	);
	assert.equal(cfg.accounts.length, 1);
	assert.equal(cfg.accounts[0].data.length, 1);
	assert.equal(cfg.warnings.length, 1);
	assert.match(cfg.warnings[0], /111/);
});

test("GUILD_IDS excludes profiles from non-allowlisted guilds", async () => {
	const profiles = [
		profile({ _id: "p1", guildId: "g1", ltuid: "111" }),
		profile({
			_id: "p2",
			guildId: "g2",
			label: "other",
			ltuid: "222",
			cookie: "ltoken_v2=x; ltuid_v2=222; ltmid_v2=y"
		})
	];

	const unrestricted = await assemble(fakeDb(profiles), ENV);
	assert.equal(unrestricted.accounts[0].data.length, 2);

	const restricted = await assemble(fakeDb(profiles), { ...ENV, GUILD_IDS: "g1" });
	assert.equal(restricted.accounts.length, 1);
	assert.equal(restricted.accounts[0].data.length, 1);
});

test("builds discord platform from env", async () => {
	const cfg = await assemble(fakeDb([]), ENV);
	assert.deepEqual(cfg.platforms, [
		{ id: 1, active: true, type: "discord", botId: "999", token: "token.abc.def" }
	]);
	assert.equal(cfg.accounts.length, 0);
	assert.equal(cfg.testNotification.enabled, false);
});

test("sets config.crons.codeRedeem to the default redeem cron", async () => {
	const cfg = await assemble(fakeDb([]), ENV);
	assert.equal(cfg.crons.codeRedeem, "*/15 * * * *");
});

test("derives botId from token when DISCORD_BOT_ID absent", async () => {
	const id = "123456789012345678";
	const token = `${Buffer.from(id).toString("base64")}.x.y`;
	const cfg = await assemble(fakeDb([]), { DISCORD_TOKEN: token });
	assert.equal(cfg.platforms[0].botId, id);
});

test("throws without DISCORD_TOKEN", async () => {
	await assert.rejects(() => assemble(fakeDb([]), {}), /DISCORD_TOKEN/);
});
