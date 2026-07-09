const { fetchCodes, checkAndRedeem, buildMessage } = require("./utils");
const { notifyGroupedRedeem, notifyGuildsForGame } = require("../../core/notify.js");
const { gameKeyFromEngineName } = require("../../config/games.js");

const recordRedeem = async (data, status) => {
	const gameKey = gameKeyFromEngineName(data.account.platform);
	const profiles = await app.db.findProfilesByGameUid(gameKey, data.account.uid);
	for (const profile of profiles) {
		await app.db.recordRedeem({
			profileId: profile._id,
			guildId: profile.guildId,
			game: gameKey,
			code: data.code.code ?? String(data.code),
			source: "auto",
			status,
			message: status === "ok" ? "" : (data.reason ?? "")
		});
	}
};

const toEntry = (data, success) => ({
	account: data.account,
	code: data.code.code ?? String(data.code),
	rewards: data.code.rewards ?? null,
	success,
	reason: data.reason,
	telegramText: app.Utils.escapeCharacters(
		buildMessage(success ? "success" : "failed", data).telegram
	)
});

module.exports = {
	name: "code-redeem",
	expression: "* * * * *",
	description: "Check and redeem codes for supported games from HoyoLab.",
	code: async function codeRedeem() {
		const accountData = app.HoyoLab.getActiveAccounts();

		if (accountData.length === 0) {
			app.Logger.info("No active accounts found");
			return;
		}

		const redeemDisabled = accountData.every((i) => i.redeemCode === false);
		if (redeemDisabled) {
			app.Logger.info("CodeRedeem", "All accounts have redeem disabled");

			return;
		}

		const codes = await fetchCodes();
		if (Object.values(codes).every((i) => i.length === 0)) {
			app.Logger.debug("CodeRedeem", {
				message: "No codes found"
			});

			return;
		}

		const result = await checkAndRedeem(codes);
		if (typeof result === "undefined") {
			return;
		}

		const { success, failed, manual } = result;
		if (success.length === 0 && failed.length === 0 && manual.length === 0) {
			return;
		}

		const entries = [];
		for (const data of success) {
			await recordRedeem(data, "ok");
			entries.push(toEntry(data, true));
		}
		for (const data of failed) {
			await recordRedeem(data, "error");
			entries.push(toEntry(data, false));
		}
		if (entries.length > 0) {
			await notifyGroupedRedeem({ entries });
		}

		for (const data of manual) {
			const message = buildMessage("manual", data);
			const gameKey = gameKeyFromEngineName(data.gameKey) ?? data.gameKey;
			await notifyGuildsForGame(gameKey, {
				embeds: [message.embed],
				telegramText: app.Utils.escapeCharacters(message.telegram),
				kind: "redeem"
			});
		}
	}
};
