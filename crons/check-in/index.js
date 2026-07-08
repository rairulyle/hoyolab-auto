module.exports = {
	name: "check-in",
	expression: "0 0 0 * * *",
	description: "Run daily check-in every day at midnight or your specified time",
	code: async function checkIn() {
		const accounts = app.HoyoLab.getActiveAccounts();
		if (accounts.length === 0) {
			app.Logger.warn("Cron:CheckIn", "No active accounts found for HoyoLab");
			return;
		}

		const messages = [];
		const activeGameAccounts = app.HoyoLab.getActivePlatform();
		for (const name of activeGameAccounts) {
			const platform = app.HoyoLab.get(name);

			const execution = await platform.checkIn();
			if (execution.length === 0) {
				app.Logger.info(
					"Cron:CheckIn",
					"All accounts either signed in or failed to sign in"
				);
				continue;
			}

			messages.push(...execution);
		}

		if (messages.length === 0) {
			app.Logger.info("Cron:CheckIn", "No accounts to run check-in for");
			return;
		}

		for (let i = 0; i < messages.length; i++) {
			const message = messages[i];
			const account = app.HoyoLab.getAccountById(message.uid);
			const platforms = app.Platform.getForAccount(account);

			const messageText = [
				`🎮 **${message.assets.game}** Daily Check-In`,
				`🆔 **(${message.uid})** ${message.username}`,
				`🌍 **Region:** ${message.region}`,
				`🏆 **Rank:** ${message.rank}`,
				`🎁 **Today's Reward:** ${message.award.name} x${message.award.count}`,
				`📅 **Total Sign-ins:** ${message.total}`,
				`📝 **Result:** ${message.result}`
			].join("\n");

			const escapedMessage = app.Utils.escapeCharacters(messageText);
			for (const telegram of platforms.filter((p) => p.name === "telegram")) {
				await telegram.send(escapedMessage);
			}
		}
	}
};
