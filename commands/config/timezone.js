const { scheduleReload } = require("../../core/reload.js");
const { isValidTimezone } = require("../../core/time.js");
const defaults = require("../../config/defaults.js");

const run = async (interaction) => {
	const guildId = interaction.guildId;
	const guild = await app.db.getGuild(guildId);
	const timezone = guild?.timezone ?? defaults.guild.timezone;
	const reply = (content) => interaction.reply({ content, ephemeral: true });

	const tz = interaction.options.getString("tz");
	if (!tz) {
		return await reply(`This server's timezone is **${timezone}**.`);
	}
	if (!isValidTimezone(tz)) {
		return await reply(`\`${tz}\` is not a valid IANA timezone. Try e.g. \`Asia/Manila\`.`);
	}
	await app.db.setGuildField(guildId, "timezone", tz);
	scheduleReload();
	return await reply(`Timezone set to **${tz}**. Schedules now fire in this timezone.`);
};

module.exports = { run };
