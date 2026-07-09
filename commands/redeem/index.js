const { classifyRedeem } = require("../../hoyolab-modules/redeem-status.js");
const { GAMES, gameKeyFromEngineName } = require("../../config/games.js");
const { buildRedeemEmbed, buildRedeemSummaryEmbed } = require("../../core/notify.js");
const { setTimeout: sleep } = require("node:timers/promises");

module.exports = {
	name: "redeem",
	description: "Redeem provided codes for the specified game.",
	params: [
		{
			name: "game",
			description: "The game you want to redeem codes for.",
			type: "string",
			choices: [
				{ name: "Genshin Impact", value: "genshin" },
				{ name: "Honkai: Star Rail", value: "starrail" },
				{ name: "Zenless Zone Zero", value: "nap" }
			],
			required: false
		},
		{
			name: "account",
			description: "Select the account you want to check notes for.",
			type: "string",
			required: false,
			accounts: true
		},
		{
			name: "code",
			description: "The code to redeem. Leave empty to redeem all available codes.",
			type: "string",
			required: false
		}
	],
	run: async function redeem(context, game, uid, code) {
		const { interaction } = context;
		if (interaction) {
			game = interaction.options.getString("game");
			uid = interaction.options.getString("account");
			code = interaction.options.getString("code");
		}
		const supportedGames = app.HoyoLab.supportedGames({ blacklist: ["honkai", "tot"] });

		if (supportedGames.length === 0) {
			const message = "There are no accounts available for redeeming codes.";
			return interaction
				? interaction.reply({ content: message, ephemeral: true })
				: { success: false, reply: message };
		}

		if (game === "zenless" || game === "zzz") {
			game = "nap";
		}

		if (code) {
			// Single-code path (game + account + code required).
			if (!game) {
				const m = "Please specify a game.";
				return interaction
					? interaction.reply({ content: m, ephemeral: true })
					: { success: false, reply: m };
			}
			if (!uid) {
				const m = "Please specify an account.";
				return interaction
					? interaction.reply({ content: m, ephemeral: true })
					: { success: false, reply: m };
			}
			code = code.toUpperCase();
			if (interaction) {
				await interaction.deferReply({ ephemeral: true });
			}
			const account = app.HoyoLab.getActiveAccounts({ whitelist: game }).find(
				(a) => a.uid === uid
			);
			const res = await app.HoyoLab.redeemCode(game, uid, code);
			const reply = res.success
				? `Successfully redeemed code: ${code}`
				: `Failed to redeem code: ${res.data.reason}`;
			if (interaction) {
				const gameKey = gameKeyFromEngineName(game) ?? game;
				const embed = buildRedeemEmbed({
					gameName: account?.game?.name ?? GAMES[gameKey]?.name ?? gameKey,
					assets: account?.assets ?? null,
					code,
					rewards: null,
					rows: [
						{
							success: res.success,
							ign: account?.nickname ?? uid,
							reason: res.data?.reason
						}
					]
				});
				return interaction.editReply({ embeds: [embed] });
			}
			return { success: res.success, reply };
		}

		// Bulk mode: redeem every cached code for every eligible account.
		if (interaction) {
			await interaction.deferReply({ ephemeral: true });
		}

		const CACHE_KEYS = {
			genshin: "genshin-code",
			starrail: "starrail-code",
			nap: "zenless-code"
		};
		const TERMINAL = new Set(["ok", "already", "invalid", "expired"]);
		const targetGames = game ? [game].filter((g) => CACHE_KEYS[g]) : Object.keys(CACHE_KEYS);
		const summary = [];
		const embeds = [];

		for (const engineGame of targetGames) {
			const platform = app.HoyoLab.get(engineGame);
			if (!platform) {
				continue;
			}
			const cached = await app.Cache.get(CACHE_KEYS[engineGame]);
			const codes = Array.isArray(cached) ? cached : [];
			if (codes.length === 0) {
				continue;
			}
			const gameKey = gameKeyFromEngineName(engineGame) ?? engineGame;
			let accounts = app.HoyoLab.getActiveAccounts({ whitelist: engineGame });
			if (uid) {
				accounts = accounts.filter((account) => account.uid === uid);
			}
			const rows = [];

			for (const account of accounts) {
				const profiles = await app.db.findProfilesByGameUid(gameKey, account.uid);
				let redeemed = 0;
				let skipped = 0;
				let failed = 0;
				let stopped = false;

				for (const c of codes) {
					const priorStatuses = (
						await Promise.all(
							profiles.map((p) => app.db.getRedeemStatuses(p._id, gameKey, c))
						)
					).flat();
					if (priorStatuses.some((s) => TERMINAL.has(s))) {
						skipped++;
						continue;
					}

					const res = await platform.redeemCode(account, c);
					const category = res.success ? "ok" : classifyRedeem(res.retcode);

					if (category === "auth") {
						for (const p of profiles) {
							if (p.tokenStatus !== "expired") {
								await app.db.setTokenStatus(p._id, "expired");
							}
							await app.db.recordRedeem({
								profileId: p._id,
								guildId: p.guildId,
								game: gameKey,
								code: c,
								source: "manual",
								status: "error",
								message: "Cookie invalid or expired"
							});
						}
						stopped = true;
						break;
					}

					const status = category === "cooldown" ? "error" : category;
					for (const p of profiles) {
						await app.db.recordRedeem({
							profileId: p._id,
							guildId: p.guildId,
							game: gameKey,
							code: c,
							source: "manual",
							status,
							message: status === "ok" ? "" : (res.message ?? "")
						});
					}
					if (status === "ok") {
						redeemed++;
					} else {
						failed++;
					}
					await sleep(6000);
				}

				summary.push(
					`**${gameKey}** (${account.uid}) ${account.nickname ?? ""}: ${redeemed} redeemed, ${skipped} skipped, ${failed} failed${stopped ? ", stopped: cookie expired" : ""}`
				);
				rows.push({
					ign: account.nickname ?? account.uid,
					uid: account.uid,
					redeemed,
					skipped,
					failed,
					stopped
				});
			}

			if (rows.length > 0) {
				embeds.push(
					buildRedeemSummaryEmbed({
						gameName: GAMES[gameKey]?.name ?? gameKey,
						assets: accounts[0]?.assets ?? null,
						codesChecked: codes.length,
						rows
					})
				);
			}
		}

		const reply = summary.length > 0 ? summary.join("\n") : "No codes available to redeem.";
		if (interaction) {
			return embeds.length > 0
				? interaction.editReply({ embeds: embeds.slice(0, 10) })
				: interaction.editReply({ content: reply });
		}
		return { success: true, reply };
	}
};
