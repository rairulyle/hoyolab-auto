const fs = require("node:fs");
const path = require("node:path");
const Datastore = require("@seald-io/nedb");

const { mergeSettings } = require("../config/defaults.js");

const profileKey = (guildId, label) => `${guildId}:${String(label).toLowerCase()}`;

module.exports = class Database {
	constructor(dir = path.join(process.cwd(), "data", "db")) {
		this.dir = dir;
		this.collections = {};
	}

	async init() {
		fs.mkdirSync(this.dir, { recursive: true });

		const open = async (name) => {
			const store = new Datastore({ filename: path.join(this.dir, `${name}.db`) });
			await store.loadDatabaseAsync();
			return store;
		};

		this.collections.profiles = await open("profiles");
		this.collections.guilds = await open("guilds");
		this.collections.checkinResults = await open("checkin-results");
		this.collections.redeemResults = await open("redeem-results");

		await this.collections.profiles.ensureIndexAsync({ fieldName: "key", unique: true });
		await this.collections.profiles.ensureIndexAsync({ fieldName: "guildId" });
	}

	async upsertProfile(profile) {
		const key = profileKey(profile.guildId, profile.label);
		const existing = await this.collections.profiles.findOneAsync({ key });
		const doc = {
			...existing,
			...profile,
			key,
			createdAt: existing?.createdAt ?? new Date().toISOString()
		};
		delete doc._id;
		const { affectedDocuments } = await this.collections.profiles.updateAsync({ key }, doc, {
			upsert: true,
			returnUpdatedDocs: true
		});
		return affectedDocuments;
	}

	async getProfile(guildId, label) {
		return await this.collections.profiles.findOneAsync({ key: profileKey(guildId, label) });
	}

	async listProfiles(guildId) {
		return await this.collections.profiles.findAsync({ guildId });
	}

	async listAllProfiles() {
		return await this.collections.profiles.findAsync({});
	}

	async removeProfile(guildId, label) {
		return await this.collections.profiles.removeAsync({ key: profileKey(guildId, label) }, {});
	}

	async setTokenStatus(profileId, status) {
		await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { tokenStatus: status } },
			{}
		);
	}

	async updateGameEntry(profileId, gameKey, patch) {
		const doc = await this.collections.profiles.findOneAsync({ _id: profileId });
		if (!doc) {
			return null;
		}

		const games = doc.games.map((game) => {
			if (game.key !== gameKey) {
				return game;
			}
			const { settings, ...rest } = patch;
			return {
				...game,
				...rest,
				settings: settings
					? mergeSettings(game.settings ?? {}, settings)
					: (game.settings ?? {})
			};
		});

		const { affectedDocuments } = await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { games } },
			{ returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async addGameEntry(profileId, entry) {
		const doc = await this.collections.profiles.findOneAsync({ _id: profileId });
		if (!doc) {
			return null;
		}
		if ((doc.games ?? []).some((game) => game.key === entry.key)) {
			return doc;
		}

		const games = [...(doc.games ?? []), entry];
		const { affectedDocuments } = await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { games } },
			{ returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async findProfilesByGameUid(gameKey, uid) {
		return await this.collections.profiles.findAsync({
			games: { $elemMatch: { key: gameKey, uid } }
		});
	}

	async findProfilesByLtuid(ltuid) {
		return await this.collections.profiles.findAsync({ ltuid });
	}

	async getGuild(guildId) {
		return await this.collections.guilds.findOneAsync({ _id: guildId });
	}

	async listGuilds() {
		return await this.collections.guilds.findAsync({});
	}

	async setGuildField(guildId, field, value) {
		const { affectedDocuments } = await this.collections.guilds.updateAsync(
			{ _id: guildId },
			{ $set: { [field]: value } },
			{ upsert: true, returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async recordCheckin(row) {
		const _id = `${row.profileId}:${row.game}:${row.date}`;
		await this.collections.checkinResults.updateAsync(
			{ _id },
			{ ...row, _id, ranAt: new Date().toISOString() },
			{ upsert: true }
		);
	}

	async getCheckin(profileId, game, date) {
		return await this.collections.checkinResults.findOneAsync({
			_id: `${profileId}:${game}:${date}`
		});
	}

	async recordRedeem(row) {
		await this.collections.redeemResults.insertAsync({
			...row,
			redeemedAt: new Date().toISOString()
		});
	}
};
