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

	const groups = new Map();
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

			if (!groups.has(game.key)) {
				groups.set(game.key, { name: GAMES[game.key].name, assets: null, rows: [] });
			}
			const group = groups.get(game.key);
			if (!group.assets && resultMessage?.assets) {
				group.assets = resultMessage.assets;
			}

			const owner = profile.discordUserId ? `<@${profile.discordUserId}>` : profile.label;
			const ign = resultMessage?.username ?? game.nickname ?? profile.label;

			if (status === "error") {
				if (profile.discordUserId) {
					pings.add(`<@${profile.discordUserId}>`);
				}
				group.rows.push({ status, ign, owner, region: null, detail: message });
			} else {
				group.rows.push({
					status,
					ign,
					owner,
					region: resultMessage?.region ?? null,
					detail: resultMessage?.award
						? `${resultMessage.award.name} ×${resultMessage.award.count}`
						: null,
					day: resultMessage?.total ?? null
				});
			}
		}
	}

	const dot = { ok: "🟢", already: "⚪", error: "🔴" };
	const embeds = [];
	for (const group of groups.values()) {
		if (group.rows.length === 0) {
			continue;
		}
		const regions = [...new Set(group.rows.map((r) => r.region).filter(Boolean))];
		const head = [
			regions.length === 1 ? `Region **${regions[0]}**` : null,
			`**${group.rows.length}** account${group.rows.length === 1 ? "" : "s"}`
		]
			.filter(Boolean)
			.join(" · ");
		const lines = group.rows.map((r) => {
			const who = `${dot[r.status]} **${r.ign}** ${r.owner}`;
			if (r.status === "error") {
				return `${who} — ${r.detail}`;
			}
			const region = regions.length > 1 && r.region ? ` _(${r.region})_` : "";
			const rest = [r.detail, r.day !== null ? `day ${r.day}` : null]
				.filter(Boolean)
				.join(" · ");
			return `${who}${region}${rest ? ` — ${rest}` : ""}`;
		});
		embeds.push({
			color: group.assets?.color ?? 0x5865f2,
			...(group.assets
				? { author: { name: group.assets.author, icon_url: group.assets.logo } }
				: {}),
			title: `${group.name} · Daily Check-In`,
			description: `${head}\n\n${lines.join("\n")}`
		});
	}

	for (let i = 0; i < embeds.length; i += 10) {
		await sendToGuildChannel(guildId, "checkin", {
			content: i === 0 && pings.size > 0 ? [...pings].join(" ") : undefined,
			embeds: embeds.slice(i, i + 10)
		});
	}
};

module.exports = { runGuildCheckIn };
