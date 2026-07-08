const { CronTime } = require("cron");

const isValidTimezone = (tz) => {
	try {
		Intl.DateTimeFormat("en", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

const isValidCron = (expression) => {
	try {
		return Boolean(new CronTime(expression));
	} catch {
		return false;
	}
};

const nextCronUnix = (expression, tz) => {
	const cronTime = new CronTime(expression, tz);
	return Math.floor(cronTime.sendAt().toMillis() / 1000);
};

const todayInTz = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

module.exports = { isValidTimezone, isValidCron, nextCronUnix, todayInTz };
