const { gameKeyFromRecordCardId } = require("../config/games.js");

const RECORD_CARD_URL = "https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard";
const AUTH_RETCODES = [-100, 10001, 10102];

const defaultGot = (options) => app.Got("HoYoLab", options);

const detectGames = async (cookie, ltuid, got = defaultGot) => {
	const res = await got({
		url: RECORD_CARD_URL,
		responseType: "json",
		throwHttpErrors: false,
		searchParams: { uid: ltuid },
		headers: { Cookie: cookie }
	});

	if (res.statusCode !== 200) {
		throw new Error(`HoYoLAB returned HTTP ${res.statusCode} while detecting games.`);
	}

	const { retcode, message, data } = res.body;
	if (retcode !== 0) {
		const hint = AUTH_RETCODES.includes(retcode)
			? "Cookie rejected by HoYoLAB. Copy a fresh cookie and try again."
			: `HoYoLAB error: ${message ?? "unknown"}`;
		const error = new Error(`${hint} (retcode ${retcode})`);
		error.retcode = retcode;
		throw error;
	}

	return (data?.list ?? [])
		.map((card) => {
			const key = gameKeyFromRecordCardId(card.game_id);
			if (!key) {
				return null;
			}
			return {
				key,
				uid: String(card.game_role_id),
				region: card.region,
				nickname: card.nickname,
				level: card.level
			};
		})
		.filter(Boolean);
};

module.exports = { detectGames };
