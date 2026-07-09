const { buildGroupedEmbed } = require("../../core/notify.js");
const { GAMES, gameKeyFromEngineName } = require("../../config/games.js");
const { groupCheckInResults } = require("./summarize.js");

module.exports = {
	name: "checkin",
	description: "Manually run check-in for all games or a specific game.",
	params: [
		{
			name: "game",
			description:
				"The game you want to check-in for. Leave empty to check-in for all games.",
			type: "string",
			choices: [
				{ name: "All Games", value: "all" },
				{ name: "Genshin Impact", value: "genshin" },
				{ name: "Honkai Impact 3rd", value: "honkai" },
				{ name: "Honkai: Star Rail", value: "starrail" },
				{ name: "Zenless Zone Zero", value: "nap" },
				{ name: "Tears of Themis", value: "tot" }
			],
			required: false
		}
	],
	run: async function checkin(context, game) {
		const { interaction, platform } = context;

		const gameMapping = {
			zenless: "nap",
			zzz: "nap",
			hsr: "starrail",
			hi3: "honkai"
		};

		if (game) {
			game = gameMapping[game.toLowerCase()] || game.toLowerCase();
		}

		const activeGameAccounts =
			game && game !== "all"
				? [game].filter((g) => app.HoyoLab.get(g))
				: app.HoyoLab.getActivePlatform();

		if (activeGameAccounts.length === 0) {
			const message = "No active game accounts found.";
			return interaction
				? interaction.reply({ content: message, ephemeral: true })
				: { success: false, reply: message };
		}

		if (interaction) {
			await interaction.deferReply();
		}

		const results = [];
		const errors = [];

		for (const name of activeGameAccounts) {
			const gamePlatform = app.HoyoLab.get(name);
			if (!gamePlatform) {
				continue;
			}

			try {
				const execution = await gamePlatform.checkIn();
				if (execution.length === 0) {
					continue;
				}

				results.push(...execution);
			} catch (e) {
				app.Logger.error("Command:CheckIn", {
					message: "Check-in failed",
					game: name,
					error: e.message
				});
				errors.push({ game: name, error: e.message });
			}
		}

		if (results.length === 0 && errors.length === 0) {
			const message = "All accounts have already checked in today or no accounts found.";
			return interaction
				? interaction.editReply({ content: message })
				: { success: true, reply: message };
		}

		if (platform.id === 1) {
			const errorEntries = errors.map((e) => {
				const gameKey = gameKeyFromEngineName(e.game) ?? e.game;
				const accounts = app.HoyoLab.getActiveAccounts({ whitelist: e.game });
				return {
					game: e.game,
					name: GAMES[gameKey]?.name ?? e.game,
					assets: accounts[0]?.assets ?? null,
					error: e.error
				};
			});

			const groups = groupCheckInResults(results, errorEntries);
			const embeds = groups.map((group) =>
				buildGroupedEmbed(group, { titleSuffix: "Daily Check-In" })
			);

			if (interaction) {
				await interaction.editReply({ embeds: embeds.slice(0, 10) });
			}
		} else if (platform.id === 2) {
			const telegram = app.Platform.get(2);
			if (telegram) {
				for (const message of results) {
					const messageText = [
						`🎮 **${message.assets.game}** Manual Check-In`,
						`🆔 **(${message.uid})** ${message.username}`,
						`🌍 **Region:** ${message.region}`,
						`🏆 **Rank:** ${message.rank}`,
						`🎁 **Today's Reward:** ${message.award.name} x${message.award.count}`,
						`📅 **Total Sign-ins:** ${message.total}`,
						`📝 **Result:** ${message.result}`
					].join("\n");

					const escapedMessage = app.Utils.escapeCharacters(messageText);
					await telegram.send(escapedMessage);
				}

				if (errors.length > 0) {
					const errorText = errors.map((e) => `❌ ${e.game}: ${e.error}`).join("\n");
					await telegram.send(app.Utils.escapeCharacters(errorText));
				}
			}
		} else {
			const summary = [];
			if (results.length > 0) {
				summary.push(`✅ Successfully checked in for ${results.length} account(s):`);
				for (const r of results) {
					summary.push(
						`  • ${r.assets.game}: ${r.username} - ${r.award.name} x${r.award.count}`
					);
				}
			}
			if (errors.length > 0) {
				summary.push(`❌ Failed for ${errors.length} game(s):`);
				for (const e of errors) {
					summary.push(`  • ${e.game}: ${e.error}`);
				}
			}

			return interaction
				? interaction.editReply({ content: summary.join("\n") })
				: { success: true, reply: summary.join("\n") };
		}

		return { success: true };
	}
};
