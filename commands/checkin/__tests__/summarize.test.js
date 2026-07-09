const { test } = require("node:test");
const assert = require("node:assert/strict");

const { groupCheckInResults } = require("../summarize.js");

const genshinAssets = { game: "Genshin Impact", author: "Paimon", logo: "l", color: 0x123456 };

test("groupCheckInResults groups accounts of one game into one group", () => {
	const groups = groupCheckInResults(
		[
			{
				platform: "genshin",
				username: "KidClutch",
				uid: "801604887",
				award: { name: "Primogem", count: 20 },
				total: 12,
				result: "Congratulations, Traveler! You have successfully checked in today~",
				assets: genshinAssets
			},
			{
				platform: "genshin",
				username: "Rairu",
				uid: "807321896",
				award: { name: "Primogem", count: 20 },
				total: 31,
				result: "Traveler, you've already checked in today~",
				assets: genshinAssets
			}
		],
		[]
	);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].name, "Genshin Impact");
	assert.deepEqual(groups[0].assets, genshinAssets);
	assert.deepEqual(groups[0].rows, [
		{ level: "ok", ign: "KidClutch", text: "Primogem ×20 · Day 12" },
		{ level: "info", ign: "Rairu", text: "already claimed · Day 31" }
	]);
});

test("groupCheckInResults splits games and falls back to uid when username is missing", () => {
	const groups = groupCheckInResults(
		[
			{
				platform: "tot",
				username: "",
				uid: "100",
				award: { name: "Stellin", count: 30 },
				total: 2,
				result: "success",
				assets: { game: "Tears of Themis", author: "MC", logo: "l", color: 0x1 }
			},
			{
				platform: "genshin",
				username: "KidClutch",
				uid: "801604887",
				award: { name: "Mora", count: 10000 },
				total: 13,
				result: "success",
				assets: genshinAssets
			}
		],
		[]
	);
	assert.equal(groups.length, 2);
	assert.equal(groups[0].name, "Tears of Themis");
	assert.deepEqual(groups[0].assets, {
		game: "Tears of Themis",
		author: "MC",
		logo: "l",
		color: 0x1
	});
	assert.deepEqual(groups[0].rows, [{ level: "ok", ign: "100", text: "Stellin ×30 · Day 2" }]);
});

test("groupCheckInResults renders errors as alert rows, including error-only games", () => {
	const groups = groupCheckInResults(
		[],
		[{ game: "honkai", name: "Honkai Impact 3rd", assets: null, error: "Request timed out" }]
	);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].name, "Honkai Impact 3rd");
	assert.equal(groups[0].assets, null);
	assert.deepEqual(groups[0].rows, [
		{ level: "alert", ign: "Honkai Impact 3rd", text: "Request timed out" }
	]);
});
