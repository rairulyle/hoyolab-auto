const {
	fetchCodes,
	checkAndRedeem,
	buildMessage
} = require("./utils");
const { sendToGuildChannel } = require("../../core/notify.js");

const recordAndNotify = async (data, message, status) => {
	const gameKey = data.account.platform === "nap" ? "zenless" : (data.account.platform === "tot" ? "termis" : data.account.platform);
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
		await sendToGuildChannel(profile.guildId, "redeem", { embeds: [message.embed]});
	}
};

module.exports = {
	name: "code-redeem",
	expression: "* * * * *",
	description: "Check and redeem codes for supported games from HoyoLab.",
	code: async function codeRedeem () {
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

		for (const data of success) {
			const message = buildMessage("success", data);
			const platforms = app.Platform.getForAccount(data.account);
			const escapedMessage = app.Utils.escapeCharacters(message.telegram);

			for (const telegram of platforms.filter(p => p.name === "telegram")) {
				await telegram.send(escapedMessage);
			}
			for (const webhook of platforms.filter(p => p.name === "webhook")) {
				await webhook.send(message.embed);
			}

			await recordAndNotify(data, message, "ok");
		}

		for (const data of failed) {
			const message = buildMessage("failed", data);
			const platforms = app.Platform.getForAccount(data.account);
			const escapedMessage = app.Utils.escapeCharacters(message.telegram);

			for (const telegram of platforms.filter(p => p.name === "telegram")) {
				await telegram.send(escapedMessage);
			}
			for (const webhook of platforms.filter(p => p.name === "webhook")) {
				await webhook.send(message.embed);
			}

			await recordAndNotify(data, message, "error");
		}

		// manual entries are game-level (no account), so send to all platforms
		for (const data of manual) {
			const message = buildMessage("manual", data);
			const escapedMessage = app.Utils.escapeCharacters(message.telegram);

			for (const telegram of app.Platform.list.filter(p => p.name === "telegram")) {
				await telegram.send(escapedMessage);
			}
			for (const webhook of app.Platform.list.filter(p => p.name === "webhook")) {
				await webhook.send(message.embed);
			}
		}
	}
};
