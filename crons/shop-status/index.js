const { notifyGroupedReminder } = require("../../core/notify.js");

module.exports = {
	name: "shop-status",
	expression: "0 */1 * * *",
	description:
		"This will check your current shop status and will fire a notification if your shop has finished selling.",
	code: async function shopStatus() {
		const accounts = app.HoyoLab.getActiveAccounts({ whitelist: "nap" });
		if (accounts.length === 0) {
			app.Logger.warn("Cron:ShopStatus", "No active accounts found to run shop status for.");
			return;
		}

		const platform = app.HoyoLab.get("nap");
		const entries = [];
		for (const account of accounts) {
			if (account.shop.check === false) {
				continue;
			}

			if (account.shop.fired) {
				continue;
			}

			const notes = await platform.notes(account);
			if (notes.success === false) {
				continue;
			}

			const { data } = notes;

			const shop = data.shop;
			if (shop.state !== "Finished") {
				account.shop.fired = false;
				platform.update(account);
			}

			if (shop.state === "Finished") {
				account.shop.fired = true;
				platform.update(account);

				entries.push({
					account,
					assets: data.assets,
					gameName: data.assets.game,
					level: "ok",
					text: "video shop sold out",
					ping: true,
					telegramText: app.Utils.escapeCharacters(
						[
							`🛒 Shop Status`,
							`UID: ${account.uid} ${account.nickname}`,
							`Your shop has finished selling videos!`
						].join("\n")
					)
				});
			}
		}

		if (entries.length > 0) {
			await notifyGroupedReminder({
				kind: "reminder",
				titleSuffix: "Shop Status",
				description: "The video shop has finished selling.",
				entries
			});
		}
	}
};
