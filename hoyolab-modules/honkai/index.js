const CheckIn = require("./check-in.js");

const DEFAULT_CONSTANTS = {
	ACT_ID: "e202110291205111",
	successMessage: "You have successfully checked in today, Captain~",
	signedMessage: "You've already checked in today, Captain~",
	assets: {
		author: "Kiana",
		game: "Honkai Impact 3rd"
	},
	url: {
		info: "https://sg-public-api.hoyolab.com/event/mani/info",
		home: "https://sg-public-api.hoyolab.com/event/mani/home",
		sign: "https://sg-public-api.hoyolab.com/event/mani/sign"
	}
};

module.exports = class HonkaiImpact extends require("../template.js") {
	#logo;
	#color;

	constructor(config) {
		super("honkai", config, {
			gameId: 1,
			config: DEFAULT_CONSTANTS
		});

		if (!this.id) {
			throw new app.Error({
				message: "No HoyoLab ID provided for Honkai Impact controller"
			});
		}
		if (this.data.length === 0) {
			throw new app.Error({
				message: "No Honkai Impact accounts provided"
			});
		}
	}

	async login() {
		const accounts = this.data;

		for (const account of accounts) {
			const cookieData = account.cookie;
			const ltuid = account.ltuid;

			const { body, statusCode } = await app.Got("HoYoLab", {
				url: "https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard",
				responseType: "json",
				throwHttpErrors: false,
				searchParams: {
					uid: ltuid
				},
				headers: {
					Cookie: cookieData
				}
			});

			if (statusCode !== 200) {
				app.Logger.warn(
					`${this.fullName}:Login`,
					`HTTP ${statusCode} for ltuid ${ltuid}; skipping this account this cycle`
				);
				this.failedAccounts.push({ ltuid, auth: false });
				continue;
			}

			const res = body;
			if (res.retcode !== 0) {
				const auth = [-100, 10001, 10102].includes(res.retcode);
				app.Logger.warn(
					`${this.fullName}:Login`,
					`retcode ${res.retcode} (${res.message ?? "no message"}) for ltuid ${ltuid}; skipping account`
				);
				this.failedAccounts.push({ ltuid, auth });
				continue;
			}

			if (typeof res.data !== "object" || !Array.isArray(res.data.list)) {
				app.Logger.warn(
					`${this.fullName}:Login`,
					`invalid data for ltuid ${ltuid}; skipping account`
				);
				this.failedAccounts.push({ ltuid, auth: false });
				continue;
			}

			const { list } = res.data;
			const data = list.find((account) => account.game_id === this.gameId);
			if (!data) {
				app.Logger.warn(
					`${this.fullName}:Login`,
					`no ${this.fullName} character for ltuid ${ltuid}; skipping account`
				);
				this.failedAccounts.push({ ltuid, auth: false });
				continue;
			}

			this.#logo = data.logo;
			this.#color = 0xf7e000;

			const offset = app.HoyoLab.getRegion(data.region);
			this.accounts.push({
				platform: this.name,
				uid: data.game_role_id,
				nickname: data.nickname,
				region: data.region,
				timezone: offset,
				level: data.level,
				cookie: cookieData,
				allowedPlatforms: account.allowedPlatforms ?? null
			});

			const region = app.HoyoLab.getRegion(data.region);
			app.Logger.info(
				this.fullName,
				`Logged into (${data.game_role_id}) ${data.nickname} (${region})`
			);
		}
	}

	get logo() {
		return this.#logo;
	}

	get color() {
		return this.#color;
	}

	async checkIn(accountData) {
		const ci = new CheckIn(this, {
			logo: this.#logo,
			color: this.#color
		});

		return await ci.checkAndExecute(accountData);
	}
};
