const { notifyGroupedReminder } = require("../../core/notify.js");

module.exports = {
	name: "stamina",
	expression: "0 */30 * * * *",
	description: "Check for your stamina and notify you when it's within the set threshold.",
	code: async function stamina() {
		// eslint-disable-next-line object-curly-spacing
		const accountsList = app.HoyoLab.getActiveAccounts({ blacklist: ["honkai", "tot"] });
		if (accountsList.length === 0) {
			app.Logger.warn("Cron:Stamina", "No active accounts found to run stamina check for.");
			return;
		}

		const entries = [];
		const activeGameAccounts = app.HoyoLab.getActivePlatform();
		for (const name of activeGameAccounts) {
			const platform = app.HoyoLab.get(name);
			const accounts = accountsList.filter((account) => account.platform === name);

			for (const account of accounts) {
				if (account.stamina.check === false) {
					continue;
				}

				const notes = await platform.notes(account);
				if (notes.success === false) {
					continue;
				}

				const { fired, persistent } = account.stamina;
				if (fired && !persistent) {
					continue;
				}

				const { data } = notes;
				const stamina = data.stamina;

				const current = Math.floor(stamina.currentStamina);
				if (current < account.stamina.threshold) {
					account.stamina.fired = false;
					platform.update(account);
					continue;
				}

				const max = stamina.maxStamina;
				const delta = app.Utils.formatTime(stamina.recoveryTime);
				const full = current >= max;

				account.stamina.fired = true;
				platform.update(account);

				entries.push({
					account,
					assets: data.assets,
					gameName: data.assets.game,
					level: full ? "alert" : "warn",
					text: full ? `${max}/${max} · capped` : `${current}/${max} · full in ${delta}`,
					ping: true,
					telegramText: app.Utils.escapeCharacters(
						[
							`📢 Stamina Reminder`,
							`🎮 **Game**: ${data.assets.game}`,
							`🆔 **UID**: ${account.uid} ${account.nickname}`,
							`🌍 **Region**: ${app.HoyoLab.getRegion(account.region)}`,
							`🔋 **Stamina**: ${current}/${max}`,
							`🕒 **Recovery Time**: ${delta}`
						].join("\n")
					)
				});
			}
		}

		if (entries.length > 0) {
			await notifyGroupedReminder({
				kind: "reminder",
				titleSuffix: "Stamina",
				description:
					"These accounts are at or above the set threshold — spend before it caps.",
				entries
			});
		}
	}
};
