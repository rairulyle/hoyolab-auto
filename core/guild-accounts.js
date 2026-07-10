const { GAMES } = require("../config/games.js");

const guildUidSet = (profiles) =>
	new Set(
		(profiles ?? []).flatMap((profile) =>
			(profile.games ?? [])
				.filter((game) => game.active && game.uid && GAMES[game.key])
				.map((game) => `${GAMES[game.key].engineName}:${game.uid}`)
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
