const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidHhmm = (value) => HHMM_REGEX.test(value);

const isValidTimezone = (tz) => {
	try {
		Intl.DateTimeFormat("en", { timeZone: tz });
		return true;
	}
	catch {
		return false;
	}
};

const hhmmToCron = (hhmm) => {
	const [, hours, minutes] = hhmm.match(HHMM_REGEX);
	return `0 ${Number(minutes)} ${Number(hours)} * * *`;
};

const todayInTz = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

const wallClockParts = (date, tz) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false
	}).formatToParts(date);
	return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
};

const tzOffsetMs = (date, tz) => {
	const wall = wallClockParts(date, tz);
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour % 24, wall.minute, wall.second);
	return asUtc - date.getTime();
};

const nextOccurrenceUnix = (hhmm, tz, now = new Date()) => {
	const [, hours, minutes] = hhmm.match(HHMM_REGEX);
	const offset = tzOffsetMs(now, tz);
	const wall = wallClockParts(now, tz);
	let target = Date.UTC(wall.year, wall.month - 1, wall.day, Number(hours), Number(minutes), 0) - offset;
	if (target <= now.getTime()) {
		target += 24 * 60 * 60 * 1000;
	}
	return Math.floor(target / 1000);
};

module.exports = { isValidHhmm, isValidTimezone, hhmmToCron, todayInTz, nextOccurrenceUnix };
