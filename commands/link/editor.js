const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle
} = require("discord.js");

const { scheduleReload } = require("../../core/reload.js");
const { GAMES } = require("../../config/games.js");
const defaults = require("../../config/defaults.js");

const TOGGLES = {
	genshin: [
		{ path: "active", label: "Game Active" },
		{ path: "redeemCode", label: "Auto Redeem" },
		{ path: "dailiesCheck", label: "Dailies Reminder" },
		{ path: "weekliesCheck", label: "Weeklies Reminder" },
		{ path: "stamina.check", label: "Stamina Check" },
		{ path: "expedition.check", label: "Expedition Check" },
		{ path: "realm.check", label: "Realm Currency" },
		{ path: "mimo.check", label: "Traveling Mimo" },
		{ path: "hilichurl.check", label: "Hilichurl Codes" }
	],
	starrail: [
		{ path: "active", label: "Game Active" },
		{ path: "redeemCode", label: "Auto Redeem" },
		{ path: "dailiesCheck", label: "Dailies Reminder" },
		{ path: "weekliesCheck", label: "Weeklies Reminder" },
		{ path: "stamina.check", label: "Stamina Check" },
		{ path: "expedition.check", label: "Expedition Check" },
		{ path: "mimo.check", label: "Mimo Check" }
	],
	zenless: [
		{ path: "active", label: "Game Active" },
		{ path: "redeemCode", label: "Auto Redeem" },
		{ path: "dailiesCheck", label: "Dailies Reminder" },
		{ path: "weekliesCheck", label: "Weeklies Reminder" },
		{ path: "stamina.check", label: "Stamina Check" },
		{ path: "expedition.check", label: "Expedition Check" },
		{ path: "mimo.check", label: "Mimo Check" },
		{ path: "shopStatus", label: "Shop Status" }
	],
	honkai: [{ path: "active", label: "Game Active" }],
	termis: [{ path: "active", label: "Game Active" }]
};

const getPath = (object, dotted) => dotted.split(".").reduce((acc, key) => acc?.[key], object);

const setPath = (dotted, value) =>
	dotted
		.split(".")
		.reverse()
		.reduce((acc, key) => ({ [key]: acc }), value);

const effectiveState = (gameEntry, path) => {
	if (path === "active") {
		return Boolean(gameEntry.active);
	}
	const merged = defaults.mergeSettings(
		defaults.gameSettings[gameEntry.key] ?? {},
		gameEntry.settings ?? {}
	);
	return Boolean(getPath(merged, path));
};

const buildGamePanel = (profile, gameKey) => {
	const gameEntry = profile.games.find((g) => g.key === gameKey);
	const rows = [];

	const toggles = TOGGLES[gameKey] ?? [];
	for (let i = 0; i < toggles.length; i += 5) {
		rows.push(
			new ActionRowBuilder().addComponents(
				toggles.slice(i, i + 5).map((toggle) =>
					new ButtonBuilder()
						.setCustomId(`hle:toggle:${profile._id}:${gameKey}:${toggle.path}`)
						.setLabel(toggle.label)
						.setStyle(
							effectiveState(gameEntry, toggle.path)
								? ButtonStyle.Success
								: ButtonStyle.Secondary
						)
				)
			)
		);
	}

	const hasThreshold = ["genshin", "starrail", "zenless"].includes(gameKey);
	if (hasThreshold) {
		rows.push(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`hle:values:${profile._id}:${gameKey}`)
					.setLabel("Edit values…")
					.setStyle(ButtonStyle.Primary)
			)
		);
	}

	const merged = defaults.mergeSettings(
		defaults.gameSettings[gameKey] ?? {},
		gameEntry.settings ?? {}
	);
	return {
		embeds: [
			{
				color: 0x9b59b6,
				title: `${GAMES[gameKey].name} — ${profile.label}`,
				description: [
					gameEntry.uid
						? `UID \`${gameEntry.uid}\` ${gameEntry.nickname ?? ""}`
						: "No in-game UID (check-in only)",
					hasThreshold ? `Stamina threshold: **${merged.stamina.threshold}**` : null,
					"Green = enabled. Click a button to toggle."
				]
					.filter(Boolean)
					.join("\n")
			}
		],
		components: rows
	};
};

const buildGameSelect = (profile) => {
	const options = profile.games.map((g) => ({
		label: GAMES[g.key].name,
		value: g.key,
		description: g.uid ? `UID ${g.uid}` : undefined
	}));

	if (!profile.games.some((g) => g.key === "termis")) {
		options.push({
			label: `Enable ${GAMES.termis.name}`,
			value: "termis",
			description: "Check-in only; not auto-detected"
		});
	}

	const ping = profile.discordUserId ? `<@${profile.discordUserId}>` : "no ping set";
	return {
		embeds: [
			{
				color: 0x9b59b6,
				title: profile.label,
				description:
					`Pick a game to configure.\n\n🔔 Ping: ${ping} — to set or change, ` +
					"run `/link edit` with the `mention` option."
			}
		],
		components: [
			new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`hle:game:${profile._id}:-`)
					.setPlaceholder("Select a game")
					.addOptions(options)
			),
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`hle:rename:${profile._id}:-`)
					.setLabel("Rename label")
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId(`hle:clearping:${profile._id}:-`)
					.setLabel("Remove mention")
					.setStyle(ButtonStyle.Danger)
			)
		]
	};
};

const getProfileById = async (profileId) =>
	await app.db.collections.profiles.findOneAsync({ _id: profileId });

const openEditor = async (interaction) => {
	const label = interaction.options.getString("label");
	const profile = await app.db.getProfile(interaction.guildId, label);
	if (!profile) {
		return await interaction.reply({
			content: `No profile named **${label}** in this server.`,
			ephemeral: true
		});
	}
	return await interaction.reply({ ...buildGameSelect(profile), ephemeral: true });
};

const handleComponent = async (interaction) => {
	const [, action, profileId, gameKey, field] = interaction.customId.split(":");
	const profile = await getProfileById(profileId);
	if (!profile || profile.guildId !== interaction.guildId) {
		return await interaction.reply({
			content: "This editor session is no longer valid.",
			ephemeral: true
		});
	}

	if (action === "game") {
		const selected = interaction.values[0];
		let current = profile;
		if (!profile.games.some((g) => g.key === selected)) {
			current = await app.db.addGameEntry(profileId, {
				key: selected,
				uid: null,
				region: null,
				nickname: null,
				active: true,
				settings: {}
			});
			scheduleReload();
		}
		return await interaction.update(buildGamePanel(current, selected));
	}

	if (action === "toggle") {
		const gameEntry = profile.games.find((g) => g.key === gameKey);
		const next = !effectiveState(gameEntry, field);
		const patch = field === "active" ? { active: next } : { settings: setPath(field, next) };
		await app.db.updateGameEntry(profileId, gameKey, patch);
		scheduleReload();
		return await interaction.update(buildGamePanel(await getProfileById(profileId), gameKey));
	}

	if (action === "values") {
		const gameEntry = profile.games.find((g) => g.key === gameKey);
		const merged = defaults.mergeSettings(
			defaults.gameSettings[gameKey] ?? {},
			gameEntry.settings ?? {}
		);
		const modal = new ModalBuilder()
			.setCustomId(`hle:modal:${profileId}:${gameKey}`)
			.setTitle(`${GAMES[gameKey].name} values`)
			.addComponents(
				new ActionRowBuilder().addComponents(
					new TextInputBuilder()
						.setCustomId("staminaThreshold")
						.setLabel("Stamina alert threshold")
						.setStyle(TextInputStyle.Short)
						.setValue(String(merged.stamina.threshold))
						.setRequired(true)
				)
			);
		return await interaction.showModal(modal);
	}

	if (action === "modal") {
		const raw = interaction.fields.getTextInputValue("staminaThreshold");
		const threshold = Number(raw);
		if (!Number.isInteger(threshold) || threshold < 0) {
			return await interaction.reply({
				content: `\`${raw}\` is not a valid number.`,
				ephemeral: true
			});
		}
		await app.db.updateGameEntry(profileId, gameKey, { settings: { stamina: { threshold } } });
		scheduleReload();
		return await interaction.reply({
			content: `Stamina threshold set to **${threshold}**.`,
			ephemeral: true
		});
	}

	if (action === "rename") {
		const modal = new ModalBuilder()
			.setCustomId(`hle:renameModal:${profileId}:-`)
			.setTitle("Rename profile")
			.addComponents(
				new ActionRowBuilder().addComponents(
					new TextInputBuilder()
						.setCustomId("label")
						.setLabel("New profile label")
						.setStyle(TextInputStyle.Short)
						.setValue(profile.label)
						.setRequired(true)
						.setMaxLength(80)
				)
			);
		return await interaction.showModal(modal);
	}

	if (action === "renameModal") {
		const nextLabel = interaction.fields.getTextInputValue("label");
		try {
			const updated = await app.db.renameProfile(profileId, nextLabel);
			scheduleReload();
			return await interaction.reply({
				content: `Renamed profile to **${updated.label}**.`,
				ephemeral: true
			});
		} catch (e) {
			return await interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
		}
	}
};

module.exports = { openEditor, handleComponent, buildGamePanel, buildGameSelect, TOGGLES };
