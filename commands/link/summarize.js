const { GAMES } = require("../../config/games.js");

const summarize = (profile) => profile.games
	.map(g => `${g.active ? "🟢" : "⚪"} **${GAMES[g.key].name}**${g.uid ? ` — \`${g.uid}\` ${g.nickname ?? ""}` : ""}`)
	.join("\n");

module.exports = { summarize };
