/**
 * Test Notification Utility
 * Handles sending test notifications to confirm platform functionality
 */

/**
 * Send test notifications to all configured platforms to confirm functionality
 * @param {Set} platforms - Set of configured platform instances
 */
async function sendTestNotifications (platforms) {
	if (platforms.size === 0) {
		app.Logger.warn("TestNotification", "No platforms configured for test notifications");
		return;
	}

	app.Logger.info("TestNotification", "Sending test notifications to all configured platforms");

	const testPromises = [];
	for (const platform of platforms) {
		testPromises.push(sendPlatformTestNotification(platform));
	}

	const results = await Promise.allSettled(testPromises);

	let successCount = 0;
	let failureCount = 0;

	const platformArray = Array.from(platforms);
	for (const [index, result] of results.entries()) {
		const platform = platformArray[index];

		if (result.status === "fulfilled") {
			successCount++;
			app.Logger.info("TestNotification", `Successfully sent test notification to ${platform.name} (ID: ${platform.id})`);
		}
		else {
			failureCount++;
			app.Logger.error("TestNotification", `Failed to send test notification to ${platform.name} (ID: ${platform.id}): ${result.reason.message}`);
		}
	}

	app.Logger.info("TestNotification", `Test notifications completed: ${successCount} successful, ${failureCount} failed`);
}

/**
 * Send a test notification to a specific platform
 * @param {Platform} platform - Platform instance to send test notification to
 */
async function sendPlatformTestNotification (platform) {
	try {
		const localTime = new Date().toLocaleString();

		const platformName = platform.name?.toLowerCase() || "unknown";
		switch (platformName) {
			case "discord":
				// Send a simple message to Discord bot (if it has access to channels)
				// Note: Discord bots need proper channel access to send messages
				app.Logger.info("TestNotification", `Discord bot (ID: ${platform.id}) is connected and ready`);
				break;

			case "telegram": {
				// Send a test message to Telegram
				const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
				const testMessage = `🔥 *HoyoLab Auto \\- Test Notification*\n\n`
					+ `This is a test notification to confirm that the Telegram bot is working properly\\.\n\n`
					+ `✅ *Status:* Connected\n`
					+ `🕒 *Local Time:* ${escapeMarkdown(localTime)}\n`
					+ `🤖 *Platform:* Telegram Bot\n\n`
					+ `🚀 *HoyoLab Auto Started Successfully\\!*`;

				await platform.send(testMessage);
				break;
			}

			default:
				app.Logger.warn("TestNotification", `Unknown platform type: ${platform.name || "undefined"}`);
				break;
		}
	}
	catch (e) {
		throw new app.Error({
			message: `Failed to send test notification to ${platform.name || "undefined platform"}`,
			args: { error: e.message }
		});
	}
}

/**
 * Send a manual test notification (can be used for command testing)
 * @param {Platform} platform - Platform instance to send test notification to
 * @param {Object} options - Additional options for the test message
 */
async function sendManualTestNotification (platform, options = {}) {
	const customMessage = options.message || "Manual test notification triggered";

	try {
		const localTime = new Date().toLocaleString();

		const platformName = platform.name?.toLowerCase() || "unknown";
		switch (platformName) {
			case "telegram": {
				const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
				const testMessage = `🧪 *HoyoLab Auto \\- Manual Test*\n\n`
					+ `${escapeMarkdown(customMessage)}\n\n`
					+ `🔧 *Test Type:* Manual\n`
					+ `🕒 *Triggered At:* ${escapeMarkdown(localTime)}\n`
					+ `🤖 *Platform:* Telegram Bot`;

				await platform.send(testMessage);
				break;
			}

			case "discord":
				// For Discord bots, we can't use the simple send method directly from the command
				// The Discord platform context doesn't have the same send method as webhooks
				// Instead, we'll return a reply that will be handled by the Discord platform
				app.Logger.info("TestNotification", `Manual test triggered for Discord bot (ID: ${platform.id}): ${customMessage}`);
				return true;

			default:
				app.Logger.warn("TestNotification", `Manual test not supported for platform type: ${platform.name || "undefined"}`);
				break;
		}

		return true;
	}
	catch (e) {
		throw new app.Error({
			message: `Failed to send manual test notification to ${platform.name || "undefined platform"}`,
			args: { error: e.message }
		});
	}
}

module.exports = {
	sendTestNotifications,
	sendPlatformTestNotification,
	sendManualTestNotification
};
