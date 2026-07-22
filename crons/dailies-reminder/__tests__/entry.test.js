const { test } = require("node:test");
const assert = require("node:assert/strict");

const { shouldRemind, buildReminderText } = require("../entry.js");

const stamina = { currentStamina: 234.7, maxStamina: 240 };

test("reminds when dailies are incomplete", () => {
	assert.equal(shouldRemind({ dailies: { task: 0, maxTask: 400 } }), true);
});

test("skips when dailies are complete and there is no scratch card", () => {
	assert.equal(shouldRemind({ dailies: { task: 400, maxTask: 400 } }), false);
});

test("skips when dailies are complete and the card is scratched", () => {
	assert.equal(
		shouldRemind({ dailies: { task: 400, maxTask: 400 }, cardSign: "Completed" }),
		false
	);
});

test("reminds when dailies are complete but the card is not scratched", () => {
	assert.equal(
		shouldRemind({ dailies: { task: 400, maxTask: 400 }, cardSign: "Not Completed" }),
		true
	);
});

test("builds the plain dailies text without a card suffix", () => {
	assert.equal(
		buildReminderText({ dailies: { task: 0, maxTask: 400 }, stamina }),
		"0/400 dailies · 234/240 stamina"
	);
});

test("appends ❌Check-in when the card is not scratched", () => {
	assert.equal(
		buildReminderText({
			dailies: { task: 0, maxTask: 400 },
			stamina,
			cardSign: "Not Completed"
		}),
		"0/400 dailies · 234/240 stamina · ❌Check-in"
	);
});

test("appends ✅Check-in when the card is scratched", () => {
	assert.equal(
		buildReminderText({ dailies: { task: 100, maxTask: 400 }, stamina, cardSign: "Completed" }),
		"100/400 dailies · 234/240 stamina · ✅Check-in"
	);
});
