const { notifyAccount } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();

RegionalTaskManager.registerTask("DailiesReminder", 21, 0, async (account) => {
	if (account.dailiesCheck === false) {
		return;
	}

	const platform = app.HoyoLab.get(account.platform);
	const notes = await platform.notes(account);
	if (notes.success === false) {
		return;
	}

	const { data } = notes;
	const current = Math.floor(data.stamina.currentStamina);
	const max = data.stamina.maxStamina;
	const delta = app.Utils.formatTime(data.stamina.recoveryTime);

	if (data.dailies.task === data.dailies.maxTask) {
		return;
	}

	const embed = {
		color: data.assets.color,
		title: "Dailies Reminder",
		author: {
			name: data.assets.author,
			icon_url: data.assets.logo
		},
		description: "Don't forget to complete your dailies!",
		fields: [
			{ name: "UID", value: account.uid, inline: true },
			{ name: "Username", value: account.nickname, inline: true },
			{ name: "Region", value: app.HoyoLab.getRegion(account.region), inline: true },
			{
				name: "Completed Dailies",
				value: `${data.dailies.task}/${data.dailies.maxTask}`,
				inline: true
			},
			{ name: "Current Stamina", value: `${current}/${max} (${delta})`, inline: true }
		]
	};

	const telegramText = app.Utils.escapeCharacters(
		[
			`📢 Dailies Reminder, Don't Forget to Do Your Dailies!`,
			`🎮 **Game**: ${data.assets.game}`,
			`🆔 **UID**: ${account.uid} ${account.nickname}`,
			`🌍 **Region**: ${app.HoyoLab.getRegion(account.region)}`,
			`📅 **Completed Dailies**: ${data.dailies.task}/${data.dailies.maxTask}`,
			`🔋 **Current Stamina**: ${current}/${max} (${delta})`
		].join("\n")
	);
	await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
});

module.exports = {
	name: "dailies-reminder",
	expression: "*/5 * * * *",
	description: "Reminds you to complete your dailies.",
	code: async function dailiesReminder() {
		// eslint-disable-next-line object-curly-spacing
		await RegionalTaskManager.executeTasks({ blacklist: ["honkai", "tot"] });
	}
};
