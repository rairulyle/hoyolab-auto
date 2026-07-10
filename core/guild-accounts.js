const { GAMES } = require("../config/games.js");

const guildUidSet = (profiles) =>
	new Set(
		(profiles ?? []).flatMap((profile) =>
			(profile.games ?? [])
				.filter((game) => game.active && GAMES[game.key])
				.flatMap((game) => {
					const engineName = GAMES[game.key].engineName;
					// Tears of Themis has no game-record uid; its engine account is keyed on ltuid
					if (engineName === "tot") {
						return profile.ltuid ? [`tot:${profile.ltuid}`] : [];
					}
					return game.uid ? [`${engineName}:${game.uid}`] : [];
				})
		)
	);

const filterByGuild = (pool, uidSet) =>
	(pool ?? []).filter((account) => uidSet.has(`${account.platform}:${account.uid}`));

const accountsForGuild = async (guildId, filter = {}) => {
	if (!guildId) {
		return [];
	}
	const profiles = await app.db.listProfiles(guildId);
	const uidSet = guildUidSet(profiles);
	if (uidSet.size === 0) {
		return [];
	}
	return filterByGuild(app.HoyoLab.getActiveAccounts(filter), uidSet);
};

const accountByIdForGuild = async (guildId, uid) => {
	const accounts = await accountsForGuild(guildId, { uid });
	return accounts[0] ?? null;
};

module.exports = { guildUidSet, filterByGuild, accountsForGuild, accountByIdForGuild };
