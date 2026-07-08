const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const JSON5 = require("json5");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { parseCookie } = require("../../core/cookie.js");
const { linkProfile } = require("../link/service.js");
const { GAMES } = require("../../config/games.js");

const SETTING_KEYS = [
	"redeemCode",
	"dailiesCheck",
	"weekliesCheck",
	"realm",
	"stamina",
	"expedition",
	"mimo",
	"hilichurl",
	"shopStatus"
];

const pickSettings = (entry) =>
	Object.fromEntries(
		SETTING_KEYS.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]])
	);

module.exports = {
	name: "migrate",
	description: "Import profiles from a legacy config.json5 file.",
	params: [],
	buildSlashData: () =>
		new SlashCommandBuilder()
			.setName("migrate")
			.setDescription("Import profiles from a legacy config.json5 file.")
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.setDMPermission(false)
			.addAttachmentOption((opt) =>
				opt.setName("file").setDescription("Your config.json5").setRequired(true)
			),
	run: async function migrate(context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!(await requireGuildAdmin(interaction))) {
			return;
		}

		await interaction.deferReply({ ephemeral: true });

		const attachment = interaction.options.getAttachment("file");
		let config;
		try {
			const res = await app.Got("API", { url: attachment.url, responseType: "text" });
			config = JSON5.parse(res.body);
		} catch (e) {
			return await interaction.editReply({
				content: `❌ Could not parse that file as JSON5: ${e.message}`
			});
		}

		const mapGameKey = (type) => {
			if (type === "nap") {
				return "zenless";
			}
			if (type === "tot") {
				return "termis";
			}
			return type;
		};

		const byLtuid = new Map();
		for (const group of config.accounts ?? []) {
			const key = mapGameKey(group.type);
			if (!GAMES[key]) {
				continue;
			}
			for (const entry of group.data ?? []) {
				if (!entry.cookie) {
					continue;
				}
				let parsed;
				try {
					parsed = parseCookie(entry.cookie);
				} catch {
					continue;
				}
				const bucket = byLtuid.get(parsed.ltuid) ?? {
					cookie: entry.cookie,
					discordUserId: entry.discord?.userId ?? null,
					settings: {}
				};
				bucket.settings[key] = pickSettings(entry);
				byLtuid.set(parsed.ltuid, bucket);
			}
		}

		if (byLtuid.size === 0) {
			return await interaction.editReply({
				content: "No usable accounts found in that file."
			});
		}

		const lines = [];
		let index = 0;
		for (const [ltuid, bucket] of byLtuid) {
			index += 1;
			const label = `migrated-${ltuid}`;
			try {
				const { profile } = await linkProfile({
					db: app.db,
					guildId: interaction.guildId,
					label,
					discordUserId: bucket.discordUserId ?? interaction.user.id,
					cookie: bucket.cookie
				});
				for (const game of profile.games) {
					const settings = bucket.settings[game.key];
					if (settings && Object.keys(settings).length > 0) {
						await app.db.updateGameEntry(profile._id, game.key, { settings });
					}
				}
				lines.push(
					`✅ **${label}** — ${profile.games.map((g) => GAMES[g.key].short).join(", ")}`
				);
			} catch (e) {
				lines.push(`❌ **${label}** — ${e.message}`);
			}
		}

		scheduleReload();
		return await interaction.editReply({
			embeds: [
				{
					color: 0x2ecc71,
					title: `Migration finished (${index} login${index === 1 ? "" : "s"})`,
					description: lines.join("\n").slice(0, 4000),
					footer: { text: "Rename with /link remove + /link add, tweak with /link edit" }
				}
			]
		});
	}
};
