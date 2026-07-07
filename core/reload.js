const { CronJob } = require("cron");

const { assemble } = require("./assembler.js");
const { runGuildCheckIn } = require("./guild-jobs.js");
const { hhmmToCron, isValidHhmm } = require("./time.js");
const defaults = require("../config/defaults.js");

let globalCrons = [];
let guildJobs = [];
let reloadTimer = null;

const stopAll = () => {
	for (const { job } of [...globalCrons, ...guildJobs]) {
		job.stop();
	}
	globalCrons = [];
	guildJobs = [];
};

const rebuildAccounts = async (config) => {
	for (const instance of app.HoyoLab.list) {
		instance.destroy();
	}
	app.HoyoLab.list.length = 0;

	let count = 0;
	for (const definition of config.accounts) {
		const instance = app.HoyoLab.create(definition.type, definition);
		if (!instance) {
			continue;
		}

		try {
			await instance.login();
			count += instance.accounts.length;
		}
		catch (e) {
			app.Logger.error("Reload", {
				message: `Login failed for ${definition.type}; dropping its accounts this cycle`,
				error: e.message ?? String(e)
			});
			const index = app.HoyoLab.list.indexOf(instance);
			if (index !== -1) {
				app.HoyoLab.list.splice(index, 1);
			}
		}
	}
	return count;
};

const scheduleGuildJobs = async () => {
	const guildIds = new Set([
		...(await app.db.listGuilds()).map(g => g._id),
		...(await app.db.listAllProfiles()).map(p => p.guildId)
	]);

	for (const guildId of guildIds) {
		const guild = await app.db.getGuild(guildId);
		const timezone = guild?.timezone ?? defaults.guild.timezone;
		const checkinTime = isValidHhmm(guild?.checkinTime) ? guild.checkinTime : defaults.guild.checkinTime;

		const job = new CronJob(
			hhmmToCron(checkinTime),
			() => runGuildCheckIn(guildId).catch(e => app.Logger.error("GuildCheckIn", { guildId, error: e.message })),
			null,
			true,
			timezone
		);
		guildJobs.push({ name: `guild-checkin:${guildId}`, job });
	}
	return guildIds.size;
};

const reload = async () => {
	const config = await assemble(app.db);
	for (const warning of config.warnings) {
		app.Logger.warn("Reload", warning);
	}

	stopAll();
	const accountCount = await rebuildAccounts(config);

	const { initCrons } = require("../crons/index.js");
	globalCrons = initCrons(config.crons);
	const guildJobCount = await scheduleGuildJobs();

	app.Logger.info("Reload", `Reloaded: ${accountCount} account(s), ${guildJobCount} guild job(s)`);
	return { warnings: config.warnings, accountCount, guildJobCount };
};

const scheduleReload = (delayMs = 3000) => {
	clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		reload().catch(e => app.Logger.error("Reload", { message: "Deferred reload failed", error: e.message }));
	}, delayMs);
};

module.exports = { reload, scheduleReload };
