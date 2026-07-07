const { test } = require("node:test");
const assert = require("node:assert/strict");

const { detectGames } = require("../hoyolab-api.js");

const CARD_RESPONSE = {
	statusCode: 200,
	body: {
		retcode: 0,
		data: {
			list: [
				{ game_id: 2, game_role_id: "800000001", region: "os_asia", nickname: "Trav", level: 60 },
				{ game_id: 6, game_role_id: "801000001", region: "prod_official_asia", nickname: "Blaze", level: 70 },
				{ game_id: 999, game_role_id: "x", region: "y", nickname: "z", level: 1 }
			]
		}
	}
};

test("maps record cards to game keys, skipping unknown ids", async () => {
	const got = async () => CARD_RESPONSE;
	const games = await detectGames("cookie", "111", got);
	assert.deepEqual(games, [
		{ key: "genshin", uid: "800000001", region: "os_asia", nickname: "Trav", level: 60 },
		{ key: "starrail", uid: "801000001", region: "prod_official_asia", nickname: "Blaze", level: 70 }
	]);
});

test("throws with cookie hint on auth retcode", async () => {
	const got = async () => ({ statusCode: 200, body: { retcode: -100, message: "Please login" } });
	await assert.rejects(() => detectGames("cookie", "111", got), /cookie/i);
});

test("throws on http error", async () => {
	const got = async () => ({ statusCode: 500, body: {} });
	await assert.rejects(() => detectGames("cookie", "111", got), /500/);
});
