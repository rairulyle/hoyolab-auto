const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildGamePanel, buildGameSelect, TOGGLES } = require("../editor.js");

const profile = {
	_id: "p1",
	label: "main",
	games: [
		{
			key: "genshin",
			uid: "800",
			nickname: "T",
			active: true,
			settings: { stamina: { check: true } }
		}
	]
};

test("genshin panel renders its toggles with merged state", () => {
	const panel = buildGamePanel(profile, "genshin");
	assert.ok(panel.embeds[0].title.includes("Genshin Impact"));

	const buttons = panel.components.flatMap((row) => row.components);
	const staminaButton = buttons.find(
		(b) => b.data.custom_id === "hle:toggle:p1:genshin:stamina.check"
	);
	assert.ok(staminaButton);
	assert.equal(staminaButton.data.style, 3);

	const dailies = buttons.find((b) => b.data.custom_id === "hle:toggle:p1:genshin:dailiesCheck");
	assert.equal(dailies.data.style, 2);
});

test("toggle catalog only offers fields the game supports", () => {
	assert.ok(TOGGLES.genshin.some((t) => t.path === "realm.check"));
	assert.ok(!TOGGLES.starrail.some((t) => t.path === "realm.check"));
	assert.ok(TOGGLES.starrail.some((t) => t.path === "mimo.check"));
	assert.deepEqual(
		TOGGLES.honkai.map((t) => t.path),
		["active"]
	);
});

test("game select offers a ToT enable option only when the profile lacks it", () => {
	const values = (p) =>
		buildGameSelect(p).components[0].components[0].options.map((o) => o.data.value);

	const withoutTot = values(profile);
	assert.ok(withoutTot.includes("genshin"));
	assert.ok(withoutTot.includes("termis"), "should offer termis when absent");

	const withTot = values({
		...profile,
		games: [...profile.games, { key: "termis", uid: null, active: true, settings: {} }]
	});
	assert.equal(
		withTot.filter((v) => v === "termis").length,
		1,
		"should not duplicate termis when already present"
	);
});

const makeProfile = (over = {}) => ({
	_id: "p1",
	guildId: "g1",
	label: "Skull - US",
	discordUserId: "u1",
	games: [{ key: "genshin", uid: "800", nickname: "Rairu", active: true, settings: {} }],
	...over
});

const customIds = (panel) =>
	panel.components
		.flatMap((row) => row.toJSON().components)
		.map((c) => ({ id: c.custom_id, label: c.label }));

test("buildGameSelect titles the panel with just the label", () => {
	const panel = buildGameSelect(makeProfile());
	assert.equal(panel.embeds[0].title, "Skull - US");
});

test("buildGameSelect shows the current ping when set", () => {
	const panel = buildGameSelect(makeProfile({ discordUserId: "u1" }));
	assert.match(panel.embeds[0].description, /<@u1>/);
});

test("buildGameSelect shows 'no ping set' when owner is null", () => {
	const panel = buildGameSelect(makeProfile({ discordUserId: null }));
	assert.match(panel.embeds[0].description, /no ping set/);
});

test("buildGameSelect exposes Rename label and Remove mention buttons", () => {
	const ids = customIds(buildGameSelect(makeProfile()));
	const rename = ids.find((c) => c.id === "hle:rename:p1:-");
	const clear = ids.find((c) => c.id === "hle:clearping:p1:-");
	assert.equal(rename.label, "Rename label");
	assert.equal(clear.label, "Remove mention");
});
