const { scheduleReload } = require("../../core/reload.js");
const { isValidHhmm, nextOccurrenceUnix } = require("../../core/time.js");
const defaults = require("../../config/defaults.js");

const run = async (interaction) => {
	const guildId = interaction.guildId;
	const guild = await app.db.getGuild(guildId);
	const timezone = guild?.timezone ?? defaults.guild.timezone;
	const reply = (content) => interaction.reply({ content, ephemeral: true });

	const time = interaction.options.getString("time");
	if (!time) {
		const current = guild?.checkinTime ?? defaults.guild.checkinTime;
		const unix = nextOccurrenceUnix(current, timezone);
		return await reply(`Daily check-in runs at **${current}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
	}
	if (!isValidHhmm(time)) {
		return await reply("Couldn't parse that time. Use 24-hour `HH:MM`, e.g. `00:30`.");
	}
	await app.db.setGuildField(guildId, "checkinTime", time);
	scheduleReload();
	const unix = nextOccurrenceUnix(time, timezone);
	return await reply(`Daily check-in will now run at **${time}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
};

module.exports = { run };
