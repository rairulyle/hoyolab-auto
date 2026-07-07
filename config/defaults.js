const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const mergeSettings = (base, override) => {
	const result = { ...base };
	for (const [key, value] of Object.entries(override ?? {})) {
		result[key] = (isPlainObject(value) && isPlainObject(base?.[key]))
			? mergeSettings(base[key], value)
			: value;
	}
	return result;
};

module.exports = {
	loglevel: "info",
	userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	retry: { attempts: 3, delayMs: 1000, timeoutMs: 30000 },
	crons: {
		whitelist: [],
		blacklist: ["check-in", "missed-check-in"]
	},
	redeemCron: "*/15 * * * *",
	guild: { timezone: "UTC", checkinCron: "0 0 0 * * *" },
	gameSettings: {
		honkai: {},
		termis: {},
		genshin: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			realm: { check: false, persistent: false },
			stamina: { check: false, threshold: 150, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false },
			hilichurl: { check: false, redeem: false }
		},
		starrail: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			stamina: { check: false, threshold: 170, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false, redeem: false, lottery: false }
		},
		zenless: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			shopStatus: false,
			stamina: { check: false, threshold: 220, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false, redeem: false, lottery: false }
		}
	},
	mergeSettings
};
