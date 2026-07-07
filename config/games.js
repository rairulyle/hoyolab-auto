const GAMES = {
	genshin: { type: "genshin", engineName: "genshin", name: "Genshin Impact", short: "GI", recordCardGameId: 2, engineAccountId: 3 },
	starrail: { type: "starrail", engineName: "starrail", name: "Honkai: Star Rail", short: "HSR", recordCardGameId: 6, engineAccountId: 4 },
	zenless: { type: "zenless", engineName: "nap", name: "Zenless Zone Zero", short: "ZZZ", recordCardGameId: 8, engineAccountId: 5 },
	honkai: { type: "honkai", engineName: "honkai", name: "Honkai Impact 3rd", short: "HI3", recordCardGameId: 1, engineAccountId: 1 },
	termis: { type: "termis", engineName: "tot", name: "Tears of Themis", short: "ToT", recordCardGameId: null, engineAccountId: 2 }
};

const gameKeyFromRecordCardId = (id) => Object.keys(GAMES).find(key => GAMES[key].recordCardGameId === id) ?? null;

const gameKeyFromEngineName = (engineName) => Object.keys(GAMES).find(key => GAMES[key].engineName === engineName) ?? null;

module.exports = { GAMES, gameKeyFromRecordCardId, gameKeyFromEngineName };
