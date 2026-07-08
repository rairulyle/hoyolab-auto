const { sendToGuildChannel } = require("./notify.js");
const { todayInTz } = require("./time.js");
const { GAMES } = require("../config/games.js");
const defaults = require("../config/defaults.js");

const TERMINAL = new Set(["ok", "already"]);

const runGuildCheckIn = async (guildId) => {
	const guild = await app.db.getGuild(guildId);
	const timezone = guild?.timezone ?? defaults.guild.timezone;
	const date = todayInTz(timezone);

	const profiles = (await app.db.listProfiles(guildId)).filter(
		(p) => p.tokenStatus !== "expired"
	);
	if (profiles.length === 0) {
		return;
	}

	const embeds = [];
	const pings = new Set();

	for (const profile of profiles) {
		for (const game of profile.games ?? []) {
			if (!game.active || !GAMES[game.key]) {
				continue;
			}

			const existing = await app.db.getCheckin(profile._id, game.key, date);
			if (existing && TERMINAL.has(existing.status)) {
				continue;
			}

			const platform = app.HoyoLab.get(GAMES[game.key].engineName);
			const account =
				platform?.accounts.find((a) => a.uid === game.uid) ??
				platform?.accounts.find((a) => a.cookie === profile.cookie);
			if (!platform || !account) {
				continue;
			}

			let status = "error";
			let message = "Check-in did not complete; see logs.";
			let resultMessage = null;

			try {
				const results = await platform.checkIn(account);
				resultMessage =
					(results ?? []).find((r) => r.uid === account.uid) ??
					(results ?? [])[0] ??
					null;
				if (resultMessage) {
					status =
						resultMessage.result === platform.config.signedMessage ? "already" : "ok";
					message = resultMessage.result;
				}
			} catch (e) {
				message = e.message ?? String(e);
			}

			await app.db.recordCheckin({
				profileId: profile._id,
				guildId,
				game: game.key,
				date,
				status,
				message
			});

			if (status === "error") {
				if (profile.discordUserId) {
					pings.add(`<@${profile.discordUserId}>`);
				}
				embeds.push({
					color: 0xff0000,
					title: `${GAMES[game.key].name} Check-In Failed`,
					description: `**${profile.label}** (${game.uid ?? "unknown uid"}): ${message}`,
					timestamp: new Date()
				});
			} else if (resultMessage) {
				embeds.push({
					color: resultMessage.assets.color,
					title: resultMessage.assets.game,
					author: {
						name: resultMessage.assets.author,
						icon_url: resultMessage.assets.logo
					},
					thumbnail: { url: resultMessage.award?.icon },
					fields: [
						{ name: "Profile", value: profile.label, inline: true },
						{ name: "UID", value: String(resultMessage.uid), inline: true },
						{ name: "Region", value: resultMessage.region, inline: true },
						{
							name: "Today's Reward",
							value: resultMessage.award
								? `${resultMessage.award.name} x${resultMessage.award.count}`
								: "—",
							inline: true
						},
						{
							name: "Total Sign-ins",
							value: String(resultMessage.total),
							inline: true
						},
						{ name: "Result", value: resultMessage.result, inline: true }
					],
					timestamp: new Date(),
					footer: { text: "HoyoLab Auto Check-In", icon_url: resultMessage.assets.logo }
				});
			}
		}
	}

	for (let i = 0; i < embeds.length; i += 10) {
		await sendToGuildChannel(guildId, "checkin", {
			content: i === 0 && pings.size > 0 ? [...pings].join(" ") : undefined,
			embeds: embeds.slice(i, i + 10)
		});
	}
};

module.exports = { runGuildCheckIn };
