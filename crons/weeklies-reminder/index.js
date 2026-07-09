const { notifyGroupedReminder } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();

let entries = [];

RegionalTaskManager.registerTask("WeekliesReminder", 21, 0, async (account) => {
	const weekliesCheck = account.weekliesCheck;
	if (weekliesCheck === false) {
		return;
	}

	const platform = app.HoyoLab.get(account.platform);
	const notes = await platform.notes(account);
	if (notes.success === false) {
		return;
	}

	const { data } = notes;
	const weeklies = data.weeklies;

	const message = [
		"📅 **Weeklies Reminder**",
		"",
		"👤 **Account**",
		`- **UID**: ${account.uid}`,
		`- **Username**: ${account.nickname}`,
		`- **Region**: ${app.HoyoLab.getRegion(account.region)}`,
		"",
		"📊 **Progress**"
	];
	const textParts = [];

	if (platform.type === "genshin") {
		const resin = weeklies.resinDiscount;
		const limit = weeklies.resinDiscountLimit;

		if (resin !== 0) {
			message.push(`- **Resin Discount**: ${resin}/${limit} Available`);
			textParts.push(`${resin}/${limit} resin discount`);
		}
	}
	if (platform.type === "starrail") {
		const bossCompleted = weeklies.weeklyBoss === 0;
		const simCompleted = weeklies.rogueScore === weeklies.maxScore;
		const divergent = weeklies.tournScore === weeklies.tournMaxScore && weeklies.tournUnlocked;
		if (bossCompleted && simCompleted && divergent) {
			return;
		}

		if (!bossCompleted) {
			message.push(
				`- **Weekly Boss**: ${weeklies.weeklyBoss}/${weeklies.weeklyBossLimit} Completed`
			);
			textParts.push(`${weeklies.weeklyBoss}/${weeklies.weeklyBossLimit} weekly boss`);
		}
		if (!simCompleted) {
			message.push(`- **Simulated Universe**: ${weeklies.rogueScore}/${weeklies.maxScore}`);
			textParts.push(`${weeklies.rogueScore}/${weeklies.maxScore} simulated universe`);
		}
		if (!divergent) {
			message.push(
				`- **Divergent Universe**: ${weeklies.tournScore}/${weeklies.tournMaxScore}`
			);
			textParts.push(`${weeklies.tournScore}/${weeklies.tournMaxScore} divergent universe`);
		}
	}
	if (platform.type === "nap") {
		const bountiesCompleted = weeklies.bounty === weeklies.bountyTotal;
		const surveyCompleted = weeklies.surveyPoints === weeklies.surveyPointsTotal;
		if (bountiesCompleted && surveyCompleted) {
			return;
		}

		if (!bountiesCompleted) {
			message.push(`- **Bounty Commission**: ${weeklies.bounty}/${weeklies.bountyTotal}`);
			textParts.push(`${weeklies.bounty}/${weeklies.bountyTotal} bounty commission`);
		}
		if (!surveyCompleted) {
			message.push(
				`- **Survey Points**: ${weeklies.surveyPoints}/${weeklies.surveyPointsTotal}`
			);
			textParts.push(`${weeklies.surveyPoints}/${weeklies.surveyPointsTotal} survey points`);
		}
	}

	if (textParts.length === 0) {
		return;
	}

	entries.push({
		account,
		assets: data.assets,
		gameName: data.assets.game,
		level: "warn",
		text: textParts.join(" · "),
		ping: true,
		telegramText: app.Utils.escapeCharacters(message.join("\n"))
	});
});

module.exports = {
	name: "weeklies-reminder",
	expression: "*/5 * * * 0",
	description: "Reminds you to complete your weeklies.",
	code: async function weekliesReminder() {
		entries = [];
		// eslint-disable-next-line object-curly-spacing
		await RegionalTaskManager.executeTasks();

		if (entries.length > 0) {
			await notifyGroupedReminder({
				kind: "reminder",
				titleSuffix: "Weeklies",
				description: "These accounts still have weekly tasks to finish.",
				entries
			});
		}
	}
};
