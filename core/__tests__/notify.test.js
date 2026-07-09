const { test } = require("node:test");
const assert = require("node:assert/strict");

const { resolveChannelId, buildGroupedEmbed } = require("../notify.js");

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
		"At or above the set threshold.\n\n🟡 **Rairu** <@1> — 176/180 · full in 20m\n🔴 **Lumine** <@2> — 180/180 · capped"
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
	assert.equal(embed.description, "🟢 **Nova** main — done");
});
