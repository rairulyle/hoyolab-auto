const { notifyAccount } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();

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
	const embed = {
		color: data.assets.color,
		title: "Howl's News Stand",
		author: {
			name: `${region} Server - ${account.nickname}`,
			icon_url: data.assets.logo
		},
		description: "You haven't scratched the card at Howl's News Stand yet!",
		thumbnail: {
			url: data.assets.logo
		},
		timestamp: new Date()
	};

	const telegramText = app.Utils.escapeCharacters(
		[
			`${region} Server - ${account.nickname}`,
			`📰 Howl's News Stand`,
			`You haven't scratched the card at Howl's News Stand yet!`
		].join("\n")
	);
	await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
});

module.exports = {
	name: "howl-scratch-card",
	expression: "*/5 * * * *",
	description: "Reminds you if you haven't scratched the card at Howl's News Stand.",
	code: async function howlScratchCard() {
		await RegionalTaskManager.executeTasks({ whitelist: "nap" });
	}
};
