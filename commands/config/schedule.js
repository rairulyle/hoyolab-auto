const { scheduleReload } = require("../../core/reload.js");
const { isValidCron, nextCronUnix } = require("../../core/time.js");
const defaults = require("../../config/defaults.js");

const run = async (interaction) => {
	const guildId = interaction.guildId;
	const cron = interaction.options.getString("cron");
	const guild = await app.db.getGuild(guildId);
	const timezone = guild?.timezone ?? defaults.guild.timezone;
	const reply = (content) => interaction.reply({ content, ephemeral: true });

	if (!cron) {
		const current = guild?.checkinCron ?? defaults.guild.checkinCron;
		const unix = nextCronUnix(current, timezone);
		return await reply(
			`Check-in runs on \`${current}\` (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`
		);
	}
	if (!isValidCron(cron)) {
		return await reply(
			"That isn't a valid cron expression. Example: `0 30 0 * * *` (00:30 daily)."
		);
	}
	await app.db.setGuildField(guildId, "checkinCron", cron);
	scheduleReload();
	const unix = nextCronUnix(cron, timezone);
	return await reply(
		`Check-in will now run on \`${cron}\` (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`
	);
};

module.exports = { run };
