const { notifyAccount } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();

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

	const embed = {
		color: data.assets.color,
		title: "Weeklies Reminder",
		author: {
			name: data.assets.author,
			icon_url: data.assets.logo
		},
		description: "Don't forget to complete your weeklies!",
		fields: [
			{ name: "UID", value: account.uid, inline: true },
			{ name: "Username", value: account.nickname, inline: true },
			{ name: "Region", value: app.HoyoLab.getRegion(account.region), inline: true }
		]
	};

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

	if (platform.type === "genshin") {
		const resin = weeklies.resinDiscount;
		const limit = weeklies.resinDiscountLimit;

		if (resin !== 0) {
			embed.fields.push({
				name: "Resin Discount",
				value: `${resin}/${limit} Available`,
				inline: true
			});
			message.push(`- **Resin Discount**: ${resin}/${limit} Available`);
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
			embed.fields.push({
				name: "Weekly Boss",
				value: `${weeklies.weeklyBoss}/${weeklies.weeklyBossLimit} Completed`,
				inline: true
			});
			message.push(
				`- **Weekly Boss**: ${weeklies.weeklyBoss}/${weeklies.weeklyBossLimit} Completed`
			);
		}
		if (!simCompleted) {
			embed.fields.push({
				name: "Simulated Universe",
				value: `${weeklies.rogueScore}/${weeklies.maxScore}`,
				inline: true
			});
			message.push(`- **Simulated Universe**: ${weeklies.rogueScore}/${weeklies.maxScore}`);
		}
		if (!divergent) {
			embed.fields.push({
				name: "Divergent Universe",
				value: `${weeklies.tournScore}/${weeklies.tournMaxScore}`,
				inline: true
			});
			message.push(
				`- **Divergent Universe**: ${weeklies.tournScore}/${weeklies.tournMaxScore}`
			);
		}
	}
	if (platform.type === "nap") {
		const bountiesCompleted = weeklies.bounty === weeklies.bountyTotal;
		const surveyCompleted = weeklies.surveyPoints === weeklies.surveyPointsTotal;
		if (bountiesCompleted && surveyCompleted) {
			return;
		}

		if (!bountiesCompleted) {
			embed.fields.push({
				name: "Bounty Commission",
				value: `${weeklies.bounty}/${weeklies.bountyTotal}`,
				inline: true
			});
			message.push(`- **Bounty Commission**: ${weeklies.bounty}/${weeklies.bountyTotal}`);
		}
		if (!surveyCompleted) {
			embed.fields.push({
				name: "Survey Points",
				value: `${weeklies.surveyPoints}/${weeklies.surveyPointsTotal}`,
				inline: true
			});
			message.push(
				`- **Survey Points**: ${weeklies.surveyPoints}/${weeklies.surveyPointsTotal}`
			);
		}
	}

	const telegramText = app.Utils.escapeCharacters(message.join("\n"));
	await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
});

module.exports = {
	name: "weeklies-reminder",
	expression: "*/5 * * * 0",
	description: "Reminds you to complete your weeklies.",
	code: async function weekliesReminder() {
		// eslint-disable-next-line object-curly-spacing
		await RegionalTaskManager.executeTasks();
	}
};
