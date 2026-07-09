const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	resolveChannelId,
	buildGroupedEmbed,
	buildRedeemEmbed,
	buildRedeemSummaryEmbed
} = require("../notify.js");

test("resolveChannelId returns the specific channel when set", () => {
	assert.equal(
		resolveChannelId({ checkinChannelId: "a", defaultChannelId: "d" }, "checkin"),
		"a"
	);
});

test("resolveChannelId falls back to the default channel", () => {
	assert.equal(resolveChannelId({ defaultChannelId: "d" }, "reminder"), "d");
});

test("resolveChannelId returns null when neither is set", () => {
	assert.equal(resolveChannelId({}, "checkin"), null);
	assert.equal(resolveChannelId(null, "checkin"), null);
});

test("buildGroupedEmbed renders one row per account with level dots", () => {
	const embed = buildGroupedEmbed(
		{
			name: "Genshin Impact",
			assets: { author: "Paimon", logo: "l", color: 0x123456 },
			rows: [
				{ level: "warn", ign: "Rairu", owner: "<@1>", text: "176/180 · full in 20m" },
				{ level: "alert", ign: "Lumine", owner: "<@2>", text: "180/180 · capped" }
			]
		},
		{ titleSuffix: "Stamina", description: "At or above the set threshold." }
	);
	assert.equal(embed.title, "Genshin Impact · Stamina");
	assert.equal(embed.color, 0x123456);
	assert.equal(embed.author.name, "Paimon");
	assert.equal(
		embed.description,
		"At or above the set threshold.\n\n🟡 **Rairu** — 176/180 · full in 20m\n🔴 **Lumine** — 180/180 · capped"
	);
});

test("buildGroupedEmbed omits author and empty description, uses fallback colour", () => {
	const embed = buildGroupedEmbed(
		{
			name: "Honkai: Star Rail",
			assets: null,
			rows: [{ level: "ok", ign: "Nova", owner: "main", text: "done" }]
		},
		{ titleSuffix: "Dailies" }
	);
	assert.equal(embed.author, undefined);
	assert.equal(embed.color, 0x5865f2);
	assert.equal(embed.description, "🟢 **Nova** — done");
});

test("buildRedeemEmbed lists accounts under the code with rewards", () => {
	const embed = buildRedeemEmbed({
		gameName: "Genshin Impact",
		assets: { author: "Paimon", logo: "l", color: 0x1 },
		code: "GENSHINGIFT",
		rewards: ["50 Primogems", "3 Hero's Wit"],
		rows: [
			{ success: true, ign: "Rairu", owner: "<@1>" },
			{ success: false, ign: "Lumine", owner: "<@2>", reason: "already claimed" }
		]
	});
	assert.equal(embed.title, "Genshin Impact · Code Redeemed");
	assert.equal(
		embed.description,
		"`GENSHINGIFT` — 50 Primogems, 3 Hero's Wit\n\n🟢 **Rairu** — redeemed\n🔴 **Lumine** — already claimed"
	);
});

test("buildRedeemEmbed omits the reward suffix when there are none", () => {
	const embed = buildRedeemEmbed({
		gameName: "Zenless Zone Zero",
		assets: null,
		code: "ZZZCODE",
		rewards: null,
		rows: [{ success: true, ign: "Mosou", owner: "main" }]
	});
	assert.equal(embed.description, "`ZZZCODE`\n\n🟢 **Mosou** — redeemed");
});

test("buildRedeemSummaryEmbed renders one row per account with only non-zero counts", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Genshin Impact",
		assets: { author: "Paimon", logo: "l", color: 0x123456 },
		codesChecked: 4,
		rows: [
			{
				ign: "KidClutch",
				uid: "801604887",
				redeemed: 3,
				skipped: 0,
				failed: 1,
				stopped: false
			},
			{ ign: "Lumine", uid: "813474458", redeemed: 0, skipped: 0, failed: 0, stopped: true }
		]
	});
	assert.equal(embed.title, "Genshin Impact · Redeem Summary");
	assert.equal(embed.color, 0x123456);
	assert.equal(embed.author.name, "Paimon");
	assert.equal(
		embed.description,
		"🟢 **KidClutch** (801604887) — 3 redeemed · 1 failed\n🔴 **Lumine** (813474458) — stopped: cookie expired"
	);
	assert.deepEqual(embed.footer, { text: "4 codes checked" });
});

test("buildRedeemSummaryEmbed marks all-skipped accounts as nothing new", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Zenless Zone Zero",
		assets: null,
		codesChecked: 1,
		rows: [
			{ ign: "Mosou", uid: "1301652594", redeemed: 0, skipped: 5, failed: 0, stopped: false }
		]
	});
	assert.equal(embed.author, undefined);
	assert.equal(embed.color, 0x5865f2);
	assert.equal(embed.description, "⚪ **Mosou** (1301652594) — nothing new (5 already redeemed)");
	assert.deepEqual(embed.footer, { text: "1 code checked" });
});

test("buildRedeemSummaryEmbed uses a red dot for failure-only rows and keeps counts before a stop", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Honkai: Star Rail",
		assets: null,
		codesChecked: 3,
		rows: [
			{
				ign: "SlimReaper",
				uid: "830039705",
				redeemed: 0,
				skipped: 0,
				failed: 2,
				stopped: false
			},
			{ ign: "Nova", uid: "830000001", redeemed: 1, skipped: 1, failed: 0, stopped: true }
		]
	});
	assert.equal(
		embed.description,
		"🔴 **SlimReaper** (830039705) — 2 failed\n🔴 **Nova** (830000001) — 1 redeemed · 1 skipped · stopped: cookie expired"
	);
});
