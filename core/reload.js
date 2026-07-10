const { CronJob } = require("cron");

const { assemble } = require("./assembler.js");
const { runGuildCheckIn } = require("./guild-jobs.js");
const { isValidCron } = require("./time.js");
const defaults = require("../config/defaults.js");
const { isGuildAllowed } = require("../config/guild-allowlist.js");

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

			for (const failure of instance.failedAccounts) {
				if (!failure.auth) {
					continue;
				}
				const profiles = await app.db.findProfilesByLtuid(failure.ltuid);
				for (const profile of profiles) {
					if (profile.tokenStatus !== "expired") {
						await app.db.setTokenStatus(profile._id, "expired");
						app.Logger.warn(
							"Reload",
							`Marked profile "${profile.label}" (guild ${profile.guildId}) token expired — cookie rejected by HoYoLAB`
						);
					}
				}
			}
		} catch (e) {
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
		...(await app.db.listGuilds()).map((g) => g._id),
		...(await app.db.listAllProfiles()).map((p) => p.guildId)
	]);
	const allowedGuildIds = [...guildIds].filter((guildId) => isGuildAllowed(guildId));

	for (const guildId of allowedGuildIds) {
		const guild = await app.db.getGuild(guildId);
		const timezone = guild?.timezone ?? defaults.guild.timezone;
		const checkinCron = isValidCron(guild?.checkinCron)
			? guild.checkinCron
			: defaults.guild.checkinCron;

		const job = new CronJob(
			checkinCron,
			() =>
				runGuildCheckIn(guildId).catch((e) =>
					app.Logger.error("GuildCheckIn", { guildId, error: e.message })
				),
			null,
			true,
			timezone
		);
		guildJobs.push({ name: `guild-checkin:${guildId}`, job });
	}
	return allowedGuildIds.length;
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

	app.Logger.info(
		"Reload",
		`Reloaded: ${accountCount} account(s), ${guildJobCount} guild job(s)`
	);
	return { warnings: config.warnings, accountCount, guildJobCount };
};

const scheduleReload = (delayMs = 3000) => {
	clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		reload().catch((e) =>
			app.Logger.error("Reload", { message: "Deferred reload failed", error: e.message })
		);
	}, delayMs);
};

module.exports = { reload, scheduleReload };
