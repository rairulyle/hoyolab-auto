# /link add & /link edit — Required Labels + Editable Ping Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/link add` require a unique label (killing the silent-overwrite data loss), add an opt-in `mention` ping target to `/link add` and `/link edit`, and stop notifications from double-pinging.

**Architecture:** Discord.js 14 slash commands over an embedded NeDB store. `/link add` and `/link edit` gain a native `mention` user-option; a new `db.setProfileOwner` persists the owner; `linkProfile` refuses to overwrite a label held by a different HoYoLAB account; `core/notify.js` renders the recipient mention only in the content line, not per embed row.

**Tech Stack:** Node.js ≥ 24, CommonJS, discord.js 14, `@seald-io/nedb`, `node:test`, Prettier (tabs, double quotes), ESLint 8.

## Global Constraints

- **Conventional Commits** for every commit (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`); short titles; no ticket prefix; no `Co-Authored-By` / AI attribution.
- **Branch:** all work on `feat/link-required-label-ping-target` (already checked out). Never commit to `main`.
- **Prettier owns formatting:** tabs, `tabWidth 4`, double quotes, semicolons, `trailingComma: none`, `printWidth 100`, `arrowParens: always`. Run `npm run format` on touched files; `lint-staged` also runs it pre-commit.
- **ESLint owns correctness:** fix all findings including warnings; do not disable rules.
- **Tests live in `__tests__/` next to source**, mirroring the filename. Pure units get real unit tests; interaction/global-bound code (`app.db`, `interaction`, discord.js client) gets a load/boot smoke + a manual in-Discord check.
- **Game keys:** `genshin | starrail | zenless | honkai | termis`; never invent keys.
- **No tokens** in code, tests, fixtures, commits, or logs.
- **No code comments** unless a non-obvious gotcha requires one.
- Gate every task on `npm test` **and** `npm run lint` **and** `npm run format:check` passing.

---

## File Structure

- `db/index.js` — add `setProfileOwner(profileId, discordUserId)` returning the updated doc. (Task 1)
- `db/__tests__/index.test.js` — unit test for `setProfileOwner`. (Task 1)
- `commands/link/service.js` — overwrite guard in `linkProfile`. (Task 2)
- `commands/link/__tests__/service.test.js` — guard unit tests. (Task 2)
- `core/notify.js` — drop the per-row owner mention in `buildGroupedEmbed` + `buildRedeemEmbed`. (Task 3)
- `core/__tests__/notify.test.js` — update row-format assertions. (Task 3)
- `commands/link/index.js` — `add` subcommand: required `label`, new `mention`; `edit` subcommand: new `mention`. (Tasks 4, 6)
- `commands/link/add.js` — required label, `mention` → `discordUserId ?? null`. (Task 4)
- `commands/link/editor.js` — panel copy (bare-label title, "Rename label"), ping line + hint, "Remove mention" button, `openEditor` applies `mention`, `clearping` handler, rename modal/reply copy. (Tasks 5, 6)
- `commands/link/__tests__/editor.test.js` — unit test for `buildGameSelect`. (Task 5)
- `commands/link/list.js` — null-owner display → "no ping set". (Task 7)

---

### Task 1: DB `setProfileOwner` helper

**Files:**
- Modify: `db/index.js` (add method after `setTokenStatus`, ~line 99)
- Test: `db/__tests__/index.test.js`

**Interfaces:**
- Produces: `async setProfileOwner(profileId: string, discordUserId: string | null): Promise<profileDoc>` — sets `discordUserId` on the profile and returns the updated document.

- [ ] **Step 1: Write the failing test**

Add to `db/__tests__/index.test.js` (uses the existing `profile()` helper, `db`, `beforeEach`/`afterEach`):

```js
test("setProfileOwner sets and clears the discordUserId, returning the updated doc", async () => {
	const created = await db.upsertProfile(profile({ discordUserId: "u1" }));

	const set = await db.setProfileOwner(created._id, "u2");
	assert.equal(set.discordUserId, "u2");
	assert.equal((await db.getProfile("g1", "main")).discordUserId, "u2");

	const cleared = await db.setProfileOwner(created._id, null);
	assert.equal(cleared.discordUserId, null);
	assert.equal((await db.getProfile("g1", "main")).discordUserId, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test db/__tests__/index.test.js --test-name-pattern="setProfileOwner" 2>&1 | tail -20`
Expected: FAIL — `db.setProfileOwner is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `db/index.js`, immediately after the `setTokenStatus` method (after its closing `}` near line 99), add:

```js
	async setProfileOwner(profileId, discordUserId) {
		await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { discordUserId } },
			{}
		);
		return await this.collections.profiles.findOneAsync({ _id: profileId });
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test db/__tests__/index.test.js --test-name-pattern="setProfileOwner" 2>&1 | tail -20`
Expected: PASS (1 test).

- [ ] **Step 5: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add db/index.js db/__tests__/index.test.js
git commit -m "feat(db): add setProfileOwner to set/clear a profile's ping owner"
```

---

### Task 2: Overwrite guard in `linkProfile`

**Files:**
- Modify: `commands/link/service.js` (`linkProfile`, ~lines 26-47)
- Test: `commands/link/__tests__/service.test.js`

**Interfaces:**
- Consumes: `db.getProfile(guildId, label)`, `parsed.ltuid` (from `parseCookie`).
- Behavior: throws when `(guildId, label)` already maps to a profile whose `ltuid` differs from the new cookie's `ltuid`; otherwise unchanged.

- [ ] **Step 1: Write the failing test**

Add to `commands/link/__tests__/service.test.js` (reuses `Database`, `linkProfile`, `COOKIE`; define a second cookie inline):

```js
test("linkProfile refuses to overwrite a label held by a different account", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyolink-"));
	const db = new Database(dir);
	await db.init();

	const OTHER_COOKIE = "ltoken_v2=a; ltuid_v2=222; ltmid_v2=b";

	await linkProfile({
		db,
		guildId: "g1",
		label: "Skull - US",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});

	// Same label, different ltuid -> refused.
	await assert.rejects(
		() =>
			linkProfile({
				db,
				guildId: "g1",
				label: "Skull - US",
				discordUserId: "u1",
				cookie: OTHER_COOKIE,
				detect: async () => DETECTED
			}),
		/already linked to a different account/i
	);

	// Same label, same ltuid -> allowed (idempotent re-add).
	const { profile } = await linkProfile({
		db,
		guildId: "g1",
		label: "Skull - US",
		discordUserId: "u1",
		cookie: COOKIE,
		detect: async () => DETECTED
	});
	assert.equal(profile.ltuid, "111");

	fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test commands/link/__tests__/service.test.js --test-name-pattern="refuses to overwrite" 2>&1 | tail -20`
Expected: FAIL — the second `linkProfile` resolves instead of rejecting (no guard yet).

- [ ] **Step 3: Write minimal implementation**

In `commands/link/service.js`, `linkProfile`, replace the existing block:

```js
	const existing = await db.getProfile(guildId, label);
	const profile = await db.upsertProfile({
```

with:

```js
	const existing = await db.getProfile(guildId, label);
	if (existing && existing.ltuid !== parsed.ltuid) {
		throw new Error(
			`Label "${label}" is already linked to a different account ` +
				`(uid ${existing.ltuid}). Choose a different label, or use ` +
				`/link refresh to update that profile.`
		);
	}
	const profile = await db.upsertProfile({
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test commands/link/__tests__/service.test.js --test-name-pattern="refuses to overwrite" 2>&1 | tail -20`
Expected: PASS. Also run the existing `linkProfile` test to confirm no regression: `node --test commands/link/__tests__/service.test.js --test-name-pattern="validates, detects" 2>&1 | tail -20` → PASS.

- [ ] **Step 5: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add commands/link/service.js commands/link/__tests__/service.test.js
git commit -m "feat(link): refuse to overwrite a label held by a different account"
```

---

### Task 3: Notifications ping once (drop per-row owner mention)

**Files:**
- Modify: `core/notify.js` (`buildGroupedEmbed` ~line 89, `buildRedeemEmbed` ~lines 160-164)
- Test: `core/__tests__/notify.test.js` (update 3 assertions)

**Interfaces:**
- Behavior: embed rows render `**${ign}** — ${text}` (grouped) and `**${ign}** — redeemed|reason` (redeem); no `<@id>` in rows. The content-line ping (`notifyGroupedReminder`) is unchanged.

- [ ] **Step 1: Update the failing tests first (TDD: assertions define the new format)**

In `core/__tests__/notify.test.js`:

Replace the expected string in `"buildGroupedEmbed renders one row per account with level dots"`:

```js
	assert.equal(
		embed.description,
		"At or above the set threshold.\n\n🟡 **Rairu** — 176/180 · full in 20m\n🔴 **Lumine** — 180/180 · capped"
	);
```

Replace the expected string in `"buildGroupedEmbed omits author and empty description, uses fallback colour"`:

```js
	assert.equal(embed.description, "🟢 **Nova** — done");
```

Replace the expected string in `"buildRedeemEmbed lists accounts under the code with rewards"`:

```js
	assert.equal(
		embed.description,
		"`GENSHINGIFT` — 50 Primogems, 3 Hero's Wit\n\n🟢 **Rairu** — redeemed\n🔴 **Lumine** — already claimed"
	);
```

Replace the expected string in `"buildRedeemEmbed omits the reward suffix when there are none"`:

```js
	assert.equal(embed.description, "`ZZZCODE`\n\n🟢 **Mosou** — redeemed");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test core/__tests__/notify.test.js 2>&1 | tail -25`
Expected: FAIL — actual descriptions still contain `<@1>` / `main` owner tokens.

- [ ] **Step 3: Write minimal implementation**

In `core/notify.js` `buildGroupedEmbed`, change the row map:

```js
			group.rows
				.map((r) => `${LEVEL_DOT[r.level] ?? "•"} **${r.ign}** — ${r.text}`)
				.join("\n")
```

In `core/notify.js` `buildRedeemEmbed`, change the row map:

```js
		const rows = group.rows.map((r) =>
			r.success
				? `🟢 **${r.ign}** — redeemed`
				: `🔴 **${r.ign}** — ${r.reason ?? "failed"}`
		);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test core/__tests__/notify.test.js 2>&1 | tail -25`
Expected: PASS (all notify tests).

- [ ] **Step 5: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add core/notify.js core/__tests__/notify.test.js
git commit -m "feat(notify): ping only in the content line, not per embed row"
```

---

### Task 4: `/link add` — required label + opt-in `mention`

**Files:**
- Modify: `commands/link/index.js` (the `add` subcommand builder, ~lines 23-38)
- Modify: `commands/link/add.js` (~lines 8, 15)

**Interfaces:**
- Consumes: `db`/`linkProfile` from Task 2 (guard already in place).
- Produces: `/link add label:<required> cookie:<required> mention:<optional user>`; `add.js` passes `discordUserId = mention?.id ?? null`.

This task is interaction/global-bound (discord.js + `app.db`), so it is gated by a **slash-builder smoke** + `npm test`/lint + a **manual Discord check**, per CONVENTIONS.

- [ ] **Step 1: Update the `add` subcommand builder**

In `commands/link/index.js`, replace the whole `add` subcommand block:

```js
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Link a HoYoLAB account by cookie; games are auto-detected.")
						.addStringOption((opt) =>
							opt
								.setName("cookie")
								.setDescription("Your HoYoLAB cookie string")
								.setRequired(true)
						)
						.addStringOption((opt) =>
							opt
								.setName("label")
								.setDescription("Profile name (defaults to your username)")
						)
				)
```

with:

```js
				.addSubcommand((sub) =>
					sub
						.setName("add")
						.setDescription("Link a HoYoLAB account by cookie; games are auto-detected.")
						.addStringOption((opt) =>
							opt
								.setName("label")
								.setDescription(
									'Unique name for this profile — used to edit/remove/refresh it later, e.g. "Skull - US".'
								)
								.setRequired(true)
								.setMaxLength(80)
						)
						.addStringOption((opt) =>
							opt
								.setName("cookie")
								.setDescription("Your HoYoLAB cookie string")
								.setRequired(true)
						)
						.addUserOption((opt) =>
							opt
								.setName("mention")
								.setDescription(
									"Who to @mention in this profile's notifications (defaults to no one)."
								)
						)
				)
```

- [ ] **Step 2: Update the `add` handler**

In `commands/link/add.js`, replace:

```js
	const label = interaction.options.getString("label") ?? interaction.user.username;

	try {
		const { profile } = await linkProfile({
			db: app.db,
			guildId: interaction.guildId,
			label,
			discordUserId: interaction.user.id,
			cookie: interaction.options.getString("cookie")
		});
```

with:

```js
	const label = interaction.options.getString("label");
	const discordUserId = interaction.options.getUser("mention")?.id ?? null;

	try {
		const { profile } = await linkProfile({
			db: app.db,
			guildId: interaction.guildId,
			label,
			discordUserId,
			cookie: interaction.options.getString("cookie")
		});
```

- [ ] **Step 3: Slash-builder smoke**

Run: `node -e "require('./commands/link/index.js').buildSlashData().toJSON(); console.log('slash builder OK')"`
Expected: prints `slash builder OK` with no throw (verifies required-before-optional ordering and the new user option are valid).

- [ ] **Step 4: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass (no unit test added; existing suite green).

- [ ] **Step 5: Commit**

```bash
git add commands/link/index.js commands/link/add.js
git commit -m "feat(link): require a unique label and add opt-in mention to /link add"
```

- [ ] **Step 6: Manual in-Discord check (record result in the task notes)**

  1. `/link add cookie:<valid>` with **no** label → Discord rejects (label required).
  2. `/link add label:"Skull - US" cookie:<valid>` → links; `/link list` shows no ping for it.
  3. `/link add label:"Skull - US" cookie:<same account's cookie>` → succeeds (idempotent).
  4. `/link add label:"Skull - US" cookie:<a DIFFERENT account's cookie>` → `❌ Label "Skull - US" is already linked to a different account …`.
  5. `/link add label:"Skull - Asia" cookie:<valid> mention:@Someone` → links; `/link list` shows @Someone.

---

### Task 5: `/link edit` panel — copy, ping display, "Remove mention" button

**Files:**
- Modify: `commands/link/editor.js` (`buildGameSelect`, ~lines 127-165)
- Test: `commands/link/__tests__/editor.test.js` (new)

**Interfaces:**
- Consumes: `profile.discordUserId`, `profile.label`, `profile._id`, `profile.games`.
- Produces: `buildGameSelect(profile)` returns `{ embeds, components }` where the embed title is the bare label, the description carries a ping line + hint, and the second action row has a `Rename label` button (`hle:rename:…`) and a `Remove mention` button (`hle:clearping:${profile._id}:-`).

- [ ] **Step 1: Write the failing test**

Create `commands/link/__tests__/editor.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildGameSelect } = require("../editor.js");

const profile = (over = {}) => ({
	_id: "p1",
	guildId: "g1",
	label: "Skull - US",
	discordUserId: "u1",
	games: [{ key: "genshin", uid: "800", nickname: "Rairu", active: true, settings: {} }],
	...over
});

const customIds = (panel) =>
	panel.components
		.flatMap((row) => row.toJSON().components)
		.map((c) => ({ id: c.custom_id, label: c.label }));

test("buildGameSelect titles the panel with just the label", () => {
	const panel = buildGameSelect(profile());
	assert.equal(panel.embeds[0].title, "Skull - US");
});

test("buildGameSelect shows the current ping when set", () => {
	const panel = buildGameSelect(profile({ discordUserId: "u1" }));
	assert.match(panel.embeds[0].description, /<@u1>/);
});

test("buildGameSelect shows 'no ping set' when owner is null", () => {
	const panel = buildGameSelect(profile({ discordUserId: null }));
	assert.match(panel.embeds[0].description, /no ping set/);
});

test("buildGameSelect exposes Rename label and Remove mention buttons", () => {
	const ids = customIds(buildGameSelect(profile()));
	const rename = ids.find((c) => c.id === "hle:rename:p1:-");
	const clear = ids.find((c) => c.id === "hle:clearping:p1:-");
	assert.equal(rename.label, "Rename label");
	assert.equal(clear.label, "Remove mention");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test commands/link/__tests__/editor.test.js 2>&1 | tail -25`
Expected: FAIL — title is `Edit profile: Skull - US`, no `clearping` button, rename label is `Rename profile…`.

- [ ] **Step 3: Write minimal implementation**

In `commands/link/editor.js`, replace the `return { … }` block at the end of `buildGameSelect`:

```js
	return {
		embeds: [
			{
				color: 0x9b59b6,
				title: `Edit profile: ${profile.label}`,
				description: "Pick a game to configure."
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
					.setLabel("Rename profile…")
					.setStyle(ButtonStyle.Secondary)
			)
		]
	};
```

with:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test commands/link/__tests__/editor.test.js 2>&1 | tail -25`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add commands/link/editor.js commands/link/__tests__/editor.test.js
git commit -m "feat(link): show ping + remove-mention in the editor panel, label wording"
```

---

### Task 6: `/link edit` wiring — `mention` option, clear handler, rename copy

**Files:**
- Modify: `commands/link/index.js` (the `edit` subcommand builder, ~lines 42-53)
- Modify: `commands/link/editor.js` (`openEditor` ~lines 170-180; `handleComponent` rename branch ~lines 257-287; add `clearping` branch)

**Interfaces:**
- Consumes: `db.setProfileOwner` (Task 1), `buildGameSelect` (Task 5), `getProfileById`, `scheduleReload`.
- Produces: `/link edit label:<required> mention:<optional user>` sets the owner before opening the panel; the panel's `Remove mention` button clears it.

Interaction/global-bound → gated by slash-builder smoke + `npm test`/lint + manual Discord check.

- [ ] **Step 1: Add the `mention` option to the `edit` subcommand**

In `commands/link/index.js`, replace the `edit` subcommand block:

```js
				.addSubcommand((sub) =>
					sub
						.setName("edit")
						.setDescription("Edit a profile's per-game settings.")
						.addStringOption((opt) =>
							opt
								.setName("label")
								.setDescription("Profile name")
								.setRequired(true)
								.setAutocomplete(true)
						)
				)
```

with:

```js
				.addSubcommand((sub) =>
					sub
						.setName("edit")
						.setDescription("Edit a profile's per-game settings.")
						.addStringOption((opt) =>
							opt
								.setName("label")
								.setDescription("Profile name")
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addUserOption((opt) =>
							opt
								.setName("mention")
								.setDescription("Set who to @mention in this profile's notifications.")
						)
				)
```

- [ ] **Step 2: Apply `mention` in `openEditor`**

In `commands/link/editor.js`, replace `openEditor`:

```js
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
```

with:

```js
const openEditor = async (interaction) => {
	const label = interaction.options.getString("label");
	const profile = await app.db.getProfile(interaction.guildId, label);
	if (!profile) {
		return await interaction.reply({
			content: `No profile named **${label}** in this server.`,
			ephemeral: true
		});
	}
	const mention = interaction.options.getUser("mention");
	let current = profile;
	if (mention) {
		current = await app.db.setProfileOwner(profile._id, mention.id);
		scheduleReload();
	}
	return await interaction.reply({ ...buildGameSelect(current), ephemeral: true });
};
```

- [ ] **Step 3: Add the `clearping` handler and update rename copy**

In `commands/link/editor.js` `handleComponent`, add a new branch immediately before the `if (action === "rename")` branch:

```js
	if (action === "clearping") {
		await app.db.setProfileOwner(profileId, null);
		scheduleReload();
		return await interaction.update(buildGameSelect(await getProfileById(profileId)));
	}
```

Then in the existing `rename` branch, change the modal title and input label:

```js
	if (action === "rename") {
		const modal = new ModalBuilder()
			.setCustomId(`hle:renameModal:${profileId}:-`)
			.setTitle("Rename label")
			.addComponents(
				new ActionRowBuilder().addComponents(
					new TextInputBuilder()
						.setCustomId("label")
						.setLabel("New label")
						.setStyle(TextInputStyle.Short)
						.setValue(profile.label)
						.setRequired(true)
						.setMaxLength(80)
				)
			);
		return await interaction.showModal(modal);
	}
```

And in the `renameModal` branch, change the success reply:

```js
			return await interaction.reply({
				content: `Renamed label to **${updated.label}**.`,
				ephemeral: true
			});
```

- [ ] **Step 4: Slash-builder smoke**

Run: `node -e "require('./commands/link/index.js').buildSlashData().toJSON(); console.log('slash builder OK')"`
Expected: prints `slash builder OK`.

- [ ] **Step 5: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass (Task 5's `editor.test.js` still green).

- [ ] **Step 6: Commit**

```bash
git add commands/link/index.js commands/link/editor.js
git commit -m "feat(link): set ping via /link edit mention option, clear via panel button"
```

- [ ] **Step 7: Manual in-Discord check**

  1. `/link edit label:"Skull - US" mention:@Someone` → panel opens; `/link list` shows @Someone.
  2. In the panel, click **Remove mention** → panel refreshes to `no ping set`; `/link list` shows no ping.
  3. `/link edit label:"Skull - US"` (no mention) → panel opens, ping unchanged.
  4. Click **Rename label** → modal titled "Rename label", input "New label"; rename → reply "Renamed label to …".

---

### Task 7: `/link list` null-owner display

**Files:**
- Modify: `commands/link/list.js` (line 14)

**Interfaces:**
- Behavior: a profile with `discordUserId == null` shows `_no ping set_` instead of `_unknown_`.

Interaction-bound (`app.db`, `interaction`) → gated by lint/test + manual check.

- [ ] **Step 1: Change the owner fallback**

In `commands/link/list.js`, replace:

```js
		const owner = p.discordUserId ? `<@${p.discordUserId}>` : "_unknown_";
```

with:

```js
		const owner = p.discordUserId ? `<@${p.discordUserId}>` : "_no ping set_";
```

- [ ] **Step 2: Require smoke**

Run: `node -e "require('./commands/link/list.js'); console.log('list module OK')"`
Expected: prints `list module OK`.

- [ ] **Step 3: Format, lint, full test**

Run: `npm run format && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add commands/link/list.js
git commit -m "feat(link): show 'no ping set' for an unset owner in /link list"
```

- [ ] **Step 5: Manual check**

  `/link list` — a profile linked without a `mention` reads `_no ping set_`, not `_unknown_`.

---

## Final Verification

- [ ] `npm test` — all suites pass.
- [ ] `npm run lint` — clean.
- [ ] `npm run format:check` — clean.
- [ ] Slash builder: `node -e "require('./commands/link/index.js').buildSlashData().toJSON(); console.log('OK')"` prints OK.
- [ ] Manual in-Discord checks from Tasks 4, 6, 7 all pass against the running bot.
- [ ] Update `CHANGELOG.md`? No — the `/release` skill owns the changelog; do not touch it here.

## Notes / Out of Scope

- **Auto-redeem `-1071`** (short-lived `cookie_token_v2` expiring the whole profile) is a **separate track**, not covered by this plan.
- The two production profiles currently flagged `expired` may be reset to `active` separately so redeem/check-in resume; that is an operational action, not part of this implementation.
