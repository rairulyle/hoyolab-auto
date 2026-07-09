const { notifyGroupedReminder } = require("../../core/notify.js");

const RegionalTaskManager = new app.RegionalTaskManager();

let entries = [];

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

	entries.push({
		account,
		assets: data.assets,
		gameName: data.assets.game,
		level: "warn",
		text: `${data.dailies.task}/${data.dailies.maxTask} dailies · ${current}/${max} stamina`,
		ping: true,
		telegramText: app.Utils.escapeCharacters(
			[
				`📢 Dailies Reminder, Don't Forget to Do Your Dailies!`,
				`🎮 **Game**: ${data.assets.game}`,
				`🆔 **UID**: ${account.uid} ${account.nickname}`,
				`🌍 **Region**: ${app.HoyoLab.getRegion(account.region)}`,
				`📅 **Completed Dailies**: ${data.dailies.task}/${data.dailies.maxTask}`,
				`🔋 **Current Stamina**: ${current}/${max} (${delta})`
			].join("\n")
		)
	});
});

module.exports = {
	name: "dailies-reminder",
	expression: "*/5 * * * *",
	description: "Reminds you to complete your dailies.",
	code: async function dailiesReminder() {
		entries = [];
		// eslint-disable-next-line object-curly-spacing
		await RegionalTaskManager.executeTasks({ blacklist: ["honkai", "tot"] });

		if (entries.length > 0) {
			await notifyGroupedReminder({
				kind: "reminder",
				titleSuffix: "Dailies",
				description: "These accounts still have dailies to finish.",
				entries
			});
		}
	}
};
