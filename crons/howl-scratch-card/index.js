const { notifyGroupedReminder } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();
const entries = [];

RegionalTaskManager.registerTask("HowlScratchCard", 21, 0, async (account) => {
	const platform = app.HoyoLab.get(account.platform);
	const notes = await platform.notes(account);
	if (notes.success === false) {
		return;
	}

	const { data } = notes;
	const scratchCard = data.cardSign;
	if (scratchCard === "Completed") {
		return;
	}

	const region = app.HoyoLab.getRegion(account.region);
	const telegramText = app.Utils.escapeCharacters(
		[
			`${region} Server - ${account.nickname}`,
			`📰 Howl's News Stand`,
			`You haven't scratched the card at Howl's News Stand yet!`
		].join("\n")
	);

	entries.push({
		account,
		assets: data.assets,
		gameName: data.assets.game,
		level: "warn",
		text: "card not scratched yet",
		ping: true,
		telegramText
	});
});

module.exports = {
	name: "howl-scratch-card",
	expression: "*/5 * * * *",
	description: "Reminds you if you haven't scratched the card at Howl's News Stand.",
	code: async function howlScratchCard() {
		entries.length = 0;
		await RegionalTaskManager.executeTasks({ whitelist: "nap" });

		if (entries.length > 0) {
			await notifyGroupedReminder({
				kind: "reminder",
				titleSuffix: "Howl's News Stand",
				description: "The scratch card hasn't been used today.",
				entries
			});
		}
	}
};
