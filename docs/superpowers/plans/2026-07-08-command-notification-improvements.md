# Command & Notification Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five command/notification quality-of-life changes: public `/checkin`, `/link list` showing the linker, `/link edit` label rename, bulk `/redeem` with per-account cookie short-circuit and DB-record retry tracking, and de-duplicated reminder embeds.

**Architecture:** Small, independent edits following existing patterns. Pure logic (DB `renameProfile`, redeem-status classifier, redeem-status query) is TDD'd with `node:test`. Code bound to Discord/`app` globals or live HoYoLAB HTTP is verified by a load/boot smoke plus a manual in-Discord check, per the repo testing policy — not mocked.

**Tech Stack:** Node.js ≥ 24, CommonJS, discord.js 14, `@seald-io/nedb`, `node:test`, Prettier (tabs, double quotes), ESLint.

## Global Constraints

- Node.js ≥ 24; CommonJS (`require`/`module.exports`).
- Game keys (DB/profile) `genshin | starrail | zenless | honkai | termis`; engine names differ: `zenless`→`nap`, `termis`→`tot`. Map only via `config/games.js` (`gameKeyFromEngineName()`).
- Redeem status vocab is fixed: `ok | already | invalid | expired | error`. Check-in vocab: `ok | already | error | captcha`.
- A dead cookie (auth failure) flips the profile's `tokenStatus` to `expired`.
- `db/index.js` uses **no `app` globals** and throws plain `Error` — keep it that way (its unit tests run without a global `app`).
- NeDB partial updates use `{ $set: { ... } }` (see `setTokenStatus`).
- Prettier owns formatting: tabs, `tabWidth 4`, double quotes, semicolons, `trailingComma: none`, `printWidth 100`. Run `npm run format` on touched files; `CHANGELOG.md` is prettier-ignored.
- Tests live in `__tests__/` next to source. `npm test` globs `**/__tests__/**/*.test.js`.
- Conventional Commits; feature branch `feat/command-notification-improvements` (already created); never commit to `main` for this work.

---

### Task 1: `/checkin` — public reply

**Files:**
- Modify: `commands/checkin/index.js:48`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (behavior change only).

- [ ] **Step 1: Make the deferred reply public**

In `commands/checkin/index.js`, change the defer (currently line 48):

```js
		if (interaction) {
			await interaction.deferReply();
		}
```

(Remove the `{ ephemeral: true }` argument. Leave the pre-defer "No active game accounts found" guard at line ~42 ephemeral, and leave all `editReply` calls untouched — they inherit the public defer.)

- [ ] **Step 2: Load smoke**

Run: `node --check commands/checkin/index.js`
Expected: no output, exit 0.

- [ ] **Step 3: Format**

Run: `npx prettier --write commands/checkin/index.js && npx prettier --check commands/checkin/index.js`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 4: Manual verification (in Discord)**

Run `/checkin` in a server. Expected: the "thinking…" state and the result embeds are visible to everyone in the channel (not just you).

- [ ] **Step 5: Commit**

```bash
git add commands/checkin/index.js
git commit -m "feat(checkin): show manual check-in results to the whole channel"
```

---

### Task 2: `/link list` — show who linked each profile

**Files:**
- Modify: `commands/link/list.js:18-21`

**Interfaces:**
- Consumes: profile field `discordUserId` (string | undefined).
- Produces: nothing.

- [ ] **Step 1: Append the linker mention to each field value**

In `commands/link/list.js`, replace the `fields` mapping inside the embed:

```js
				fields: profiles.map((p) => ({
					name: `${p.tokenStatus === "expired" ? "🔴" : "🟢"} ${p.label}`,
					value: `${summarize(p) || "(no games)"}\nLinked by ${
						p.discordUserId ? `<@${p.discordUserId}>` : "_unknown_"
					}`
				}))
```

- [ ] **Step 2: Load smoke**

Run: `node --check commands/link/list.js`
Expected: exit 0.

- [ ] **Step 3: Format**

Run: `npx prettier --write commands/link/list.js && npx prettier --check commands/link/list.js`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `/link list`. Expected: each profile field shows `Linked by @you` (rendered as a name, no ping). Profiles with no `discordUserId` show `Linked by _unknown_`.

- [ ] **Step 5: Commit**

```bash
git add commands/link/list.js
git commit -m "feat(link): show the linking Discord user in /link list"
```

---

### Task 3: `db.renameProfile` (pure, TDD)

**Files:**
- Modify: `db/index.js` (add method after `removeProfile`, ~line 64)
- Test: `db/__tests__/index.test.js`

**Interfaces:**
- Produces: `async renameProfile(profileId: string, newLabel: string) => Promise<profile>`. Trims `newLabel`; throws `Error` if the profile is missing, the label is empty, or another profile in the same guild already uses that label (case-insensitive). Updates `label` and the primary `key`.

- [ ] **Step 1: Write the failing tests**

Add to `db/__tests__/index.test.js`:

```js
test("renameProfile re-keys label and key, preserving _id", async () => {
	const inserted = await db.upsertProfile(profile({ label: "main" }));
	const renamed = await db.renameProfile(inserted._id, "Alt");
	assert.equal(renamed._id, inserted._id);
	assert.equal(renamed.label, "Alt");
	assert.equal(renamed.key, "g1:alt");
	assert.ok(await db.getProfile("g1", "Alt"));
	assert.equal(await db.getProfile("g1", "main"), null);
});

test("renameProfile rejects a label already used in the same guild", async () => {
	const a = await db.upsertProfile(profile({ label: "main" }));
	await db.upsertProfile(profile({ label: "alt" }));
	await assert.rejects(() => db.renameProfile(a._id, "ALT"), /already exists/);
});

test("renameProfile rejects empty label and unknown id", async () => {
	const a = await db.upsertProfile(profile({ label: "main" }));
	await assert.rejects(() => db.renameProfile(a._id, "   "), /empty/);
	await assert.rejects(() => db.renameProfile("nope", "x"), /not found/);
});
```

Note: `upsertProfile` must return the stored doc (with `_id`). If it does not, use `const inserted = await db.getProfile("g1", "main")` after upsert instead. Verify in Step 2 output.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 renameProfile`
Expected: FAIL — `db.renameProfile is not a function`.

- [ ] **Step 3: Implement `renameProfile`**

Add to `db/index.js` after `removeProfile`:

```js
	async renameProfile(profileId, newLabel) {
		const doc = await this.collections.profiles.findOneAsync({ _id: profileId });
		if (!doc) {
			throw new Error(`Profile not found: ${profileId}`);
		}

		const trimmed = String(newLabel).trim();
		if (trimmed.length === 0) {
			throw new Error("Label cannot be empty.");
		}

		const newKey = profileKey(doc.guildId, trimmed);
		if (newKey !== doc.key) {
			const clash = await this.collections.profiles.findOneAsync({ key: newKey });
			if (clash) {
				throw new Error(`A profile named "${trimmed}" already exists in this server.`);
			}
		}

		await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { label: trimmed, key: newKey } },
			{}
		);
		return await this.collections.profiles.findOneAsync({ _id: profileId });
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -6`
Expected: all pass, `fail 0`.

- [ ] **Step 5: Format & commit**

```bash
npx prettier --write db/index.js db/__tests__/index.test.js
git add db/index.js db/__tests__/index.test.js
git commit -m "feat(db): add renameProfile with collision guard"
```

---

### Task 4: `/link edit` — rename button + modal

**Files:**
- Modify: `commands/link/editor.js` (`buildGameSelect` ~line 142-159; `handleComponent` ~line 176)

**Interfaces:**
- Consumes: `db.renameProfile(profileId, newLabel)` from Task 3; `scheduleReload` (already imported).
- Produces: nothing.

- [ ] **Step 1: Add the Rename button to the profile panel**

In `buildGameSelect`, add a second action row with a rename button. Replace the `components` array:

```js
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
```

(`ButtonBuilder` and `ButtonStyle` are already imported at the top of the file.)

- [ ] **Step 2: Handle the rename button and modal submit**

In `handleComponent`, add these two branches before the final closing brace of the function (after the `modal` branch, ~line 249):

```js
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
```

Note: the `customId` parser `interaction.customId.split(":")` already yields `[, action, profileId, gameKey, field]`; `renameModal` uses `action` + `profileId`, ignores the rest. The guard at the top of `handleComponent` (`profile.guildId !== interaction.guildId`) already protects both.

- [ ] **Step 3: Load smoke**

Run: `node --check commands/link/editor.js`
Expected: exit 0.

- [ ] **Step 4: Format**

Run: `npx prettier --write commands/link/editor.js && npx prettier --check commands/link/editor.js`
Expected: clean.

- [ ] **Step 5: Manual verification**

`/link edit <label>` → click **Rename profile…** → submit a new label. Expected: confirmation "Renamed profile to X"; `/link list` shows the new label; renaming to an existing label shows `❌ A profile named "…" already exists`.

- [ ] **Step 6: Commit**

```bash
git add commands/link/editor.js
git commit -m "feat(link): allow renaming a profile label from /link edit"
```

---

### Task 5: Redeem retcode surfacing + classifier (pure, TDD)

**Files:**
- Create: `hoyolab-modules/redeem-status.js`
- Test: `hoyolab-modules/__tests__/redeem-status.test.js`
- Modify: `hoyolab-modules/genshin/redeem-code.js`, `hoyolab-modules/starrail/redeem-code.js`, `hoyolab-modules/zenless/redeem-code.js`

**Interfaces:**
- Produces: `classifyRedeem(retcode: number) => "ok" | "already" | "invalid" | "expired" | "cooldown" | "auth" | "error"`.
- Produces (shape change): each `redeem-code.js` failure return now includes `retcode` (number | null).

- [ ] **Step 1: Write the failing classifier tests**

Create `hoyolab-modules/__tests__/redeem-status.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { classifyRedeem } = require("../redeem-status.js");

test("classifyRedeem maps redeem retcodes to fixed categories", () => {
	assert.equal(classifyRedeem(0), "ok");
	assert.equal(classifyRedeem(-2017), "already");
	assert.equal(classifyRedeem(-2003), "invalid");
	assert.equal(classifyRedeem(-2001), "expired");
	assert.equal(classifyRedeem(-2016), "cooldown");
});

test("classifyRedeem flags auth/cookie retcodes", () => {
	for (const rc of [-100, -1071, -10001, 10001, 10102]) {
		assert.equal(classifyRedeem(rc), "auth");
	}
});

test("classifyRedeem falls back to error for unknown/undefined", () => {
	assert.equal(classifyRedeem(-9999), "error");
	assert.equal(classifyRedeem(undefined), "error");
	assert.equal(classifyRedeem(null), "error");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -i "redeem-status\|classifyRedeem\|Cannot find"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the classifier**

Create `hoyolab-modules/redeem-status.js`:

```js
const AUTH = new Set([-100, -1071, -10001, 10001, 10102]);

const classifyRedeem = (retcode) => {
	if (retcode === 0) {
		return "ok";
	}
	if (AUTH.has(retcode)) {
		return "auth";
	}
	switch (retcode) {
		case -2017:
			return "already";
		case -2003:
			return "invalid";
		case -2001:
			return "expired";
		case -2016:
			return "cooldown";
		default:
			return "error";
	}
};

module.exports = { classifyRedeem };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -6`
Expected: `fail 0`.

- [ ] **Step 5: Surface `retcode` from the three redeem-code modules**

In each of `hoyolab-modules/{genshin,starrail,zenless}/redeem-code.js`, add `retcode` to both failure returns.

Non-200 branch return becomes:

```js
			return {
				success: false,
				retcode: null
			};
```

The `retcode !== 0` branch return becomes (genshin/starrail keep `message`; match each file's existing shape):

```js
			return {
				success: false,
				retcode: res.body.retcode,
				message: res.body.message
			};
```

(Do not change the success returns.)

- [ ] **Step 6: Load smoke**

Run: `for f in genshin starrail zenless; do node --check hoyolab-modules/$f/redeem-code.js; done && echo OK`
Expected: `OK`.

- [ ] **Step 7: Format & commit**

```bash
npx prettier --write hoyolab-modules/redeem-status.js hoyolab-modules/__tests__/redeem-status.test.js hoyolab-modules/genshin/redeem-code.js hoyolab-modules/starrail/redeem-code.js hoyolab-modules/zenless/redeem-code.js
git add hoyolab-modules/redeem-status.js hoyolab-modules/__tests__/redeem-status.test.js hoyolab-modules/genshin/redeem-code.js hoyolab-modules/starrail/redeem-code.js hoyolab-modules/zenless/redeem-code.js
git commit -m "feat(redeem): surface retcode and add a redeem-status classifier"
```

---

### Task 6: `db.getRedeemStatuses` (pure, TDD)

**Files:**
- Modify: `db/index.js` (add method after `recordRedeem`, ~line 167)
- Test: `db/__tests__/index.test.js`

**Interfaces:**
- Produces: `async getRedeemStatuses(profileId: string, game: string, code: string) => Promise<string[]>` — the statuses of all recorded redeem attempts for that profile+game+code.

- [ ] **Step 1: Write the failing test**

Add to `db/__tests__/index.test.js`:

```js
test("getRedeemStatuses returns statuses for a profile+game+code", async () => {
	await db.recordRedeem({ profileId: "p1", guildId: "g1", game: "genshin", code: "ABC", source: "manual", status: "error" });
	await db.recordRedeem({ profileId: "p1", guildId: "g1", game: "genshin", code: "ABC", source: "manual", status: "ok" });
	await db.recordRedeem({ profileId: "p1", guildId: "g1", game: "genshin", code: "XYZ", source: "manual", status: "ok" });

	const statuses = await db.getRedeemStatuses("p1", "genshin", "ABC");
	assert.deepEqual(statuses.sort(), ["error", "ok"]);
	assert.deepEqual(await db.getRedeemStatuses("p1", "genshin", "NONE"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -i "getRedeemStatuses\|is not a function"`
Expected: FAIL.

- [ ] **Step 3: Implement `getRedeemStatuses`**

Add to `db/index.js` after `recordRedeem`:

```js
	async getRedeemStatuses(profileId, game, code) {
		const rows = await this.collections.redeemResults.findAsync({ profileId, game, code });
		return rows.map((row) => row.status);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -6`
Expected: `fail 0`.

- [ ] **Step 5: Format & commit**

```bash
npx prettier --write db/index.js db/__tests__/index.test.js
git add db/index.js db/__tests__/index.test.js
git commit -m "feat(db): add getRedeemStatuses for redeem retry tracking"
```

---

### Task 7: `/redeem` — bulk mode

**Files:**
- Modify: `commands/redeem/index.js` (params + `run`)

**Interfaces:**
- Consumes: `classifyRedeem` (Task 5), `db.getRedeemStatuses` (Task 6), `db.recordRedeem`, `db.setTokenStatus`, `db.findProfilesByGameUid`, `app.HoyoLab.get/getActiveAccounts`, `app.Cache.get`, `gameKeyFromEngineName`.
- Produces: nothing.

- [ ] **Step 1: Make all three params optional**

In `commands/redeem/index.js`, set `required: false` on the `game`, `account`, and `code` params, and update the `code` description to `"The code to redeem. Leave empty to redeem all available codes."`

- [ ] **Step 2: Rewrite `run` to dispatch single vs bulk**

Replace the `run` function body. Keep the existing single-code path when a `code` is supplied; add bulk mode when it is not:

```js
	run: async function redeem(context, game, uid, code) {
		const { interaction } = context;
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
			code = code.toUpperCase();
			if (interaction) {
				await interaction.deferReply({ ephemeral: true });
			}
			const res = await app.HoyoLab.redeemCode(game, uid, code);
			const reply = res.success
				? `Successfully redeemed code: ${code}`
				: `Failed to redeem code: ${res.data.reason}`;
			return interaction ? interaction.editReply({ content: reply }) : { success: res.success, reply };
		}

		// Bulk mode: redeem every cached code for every eligible account.
		if (interaction) {
			await interaction.deferReply({ ephemeral: true });
		}

		const { classifyRedeem } = require("../../hoyolab-modules/redeem-status.js");
		const { gameKeyFromEngineName } = require("../../config/games.js");
		const { setTimeout: sleep } = require("node:timers/promises");

		const CACHE_KEYS = { genshin: "genshin-code", starrail: "starrail-code", nap: "zenless-code" };
		const TERMINAL = new Set(["ok", "already", "invalid", "expired"]);
		const targetGames = game ? [game].filter((g) => CACHE_KEYS[g]) : Object.keys(CACHE_KEYS);
		const summary = [];

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
			const accounts = app.HoyoLab.getActiveAccounts({ whitelist: engineGame });

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
			}
		}

		const reply = summary.length > 0 ? summary.join("\n") : "No codes available to redeem.";
		return interaction ? interaction.editReply({ content: reply }) : { success: true, reply };
	}
```

Note (deviation from spec wording, intentional): cookie-death attempts are recorded with status **`error`** + message "Cookie invalid or expired" rather than `expired`, so the redeem vocab's `expired` keeps meaning *code expired* (`-2001`) only. The profile's `tokenStatus` still flips to `expired` per the domain rule. The skip query treats `ok/already/invalid/expired` as terminal.

- [ ] **Step 3: Load smoke**

Run: `node --check commands/redeem/index.js`
Expected: exit 0.

- [ ] **Step 4: Format**

Run: `npx prettier --write commands/redeem/index.js && npx prettier --check commands/redeem/index.js`
Expected: clean.

- [ ] **Step 5: Manual verification**

- `/redeem` with no options → replies (ephemeral) with a per-account summary; codes already redeemed for an account are skipped on a second run.
- `/redeem game:<x> account:<uid> code:<CODE>` → still does the single redeem (unchanged).
- With a deliberately expired cookie, the account's loop stops after the first code and `/link list` shows it 🔴 expired.

- [ ] **Step 6: Commit**

```bash
git add commands/redeem/index.js
git commit -m "feat(redeem): bulk-redeem cached codes with per-account cookie short-circuit"
```

---

### Task 8: Reminder embeds — drop duplicate footer text

**Files:**
- Modify: reminder embed builders in `crons/expedition/index.js`, `crons/stamina/index.js`, `crons/dailies-reminder/index.js`, `crons/weeklies-reminder/index.js`, `crons/hilichurl/index.js`, `crons/mimo/index.js`, `crons/howl-scratch-card/index.js`, `crons/realm-currency/index.js`, `crons/shop-status/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Find every embed whose footer text duplicates its title**

Run: `grep -rn "footer" crons/ | grep -v node_modules`
Then for each hit, open the file and compare the embed's `title:` to its `footer.text`.

- [ ] **Step 2: Remove the redundant footer**

For each embed where `footer.text` equals the `title` (the reminder label), delete the `footer` object and ensure the embed keeps `timestamp: new Date()` (Discord renders the time in the footer row). Concrete example — `crons/expedition/index.js` (~line 53-71) changes from:

```js
					title: "Expedition Reminder",
					// …fields…
					timestamp: new Date(),
					footer: {
						text: "Expedition Reminder",
						icon_url: ...
					}
```

to:

```js
					title: "Expedition Reminder",
					// …fields…
					timestamp: new Date()
```

Apply the same removal to `stamina` ("Stamina Reminder"), `dailies-reminder`, `weeklies-reminder`, `hilichurl`, `mimo` / `howl-scratch-card` ("Howl's News Stand"), `realm-currency`, and `shop-status`. If a footer carries text that is **not** the title (something unique), leave it. If removing a trailing `footer` leaves a dangling comma after `timestamp`, fix it (Prettier's `trailingComma: none` — run format in Step 4).

- [ ] **Step 3: Load smoke**

Run: `for f in expedition stamina dailies-reminder weeklies-reminder hilichurl mimo howl-scratch-card realm-currency shop-status; do node --check crons/$f/index.js; done && echo OK`
Expected: `OK`.

- [ ] **Step 4: Format**

Run: `npm run format && npm run format:check`
Expected: clean.

- [ ] **Step 5: Manual verification**

Trigger a reminder (or inspect one). Expected: the reminder label appears once (title), with the timestamp still shown; no duplicated footer label.

- [ ] **Step 6: Commit**

```bash
git add crons/
git commit -m "fix(crons): drop reminder footer text that duplicates the title"
```

---

### Task 9: Auto check-in embed — Discord mention + IGN

**Files:**
- Modify: `core/guild-jobs.js:89-92` (the success check-in embed fields)

**Interfaces:**
- Consumes: `profile.discordUserId` (string | undefined), `resultMessage.username` (in-game name), `game.nickname` (fallback).
- Produces: nothing.

Context: the auto check-in notification embed (footer "HoyoLab Auto Check-In") currently shows a **Profile** field with the profile label and a **UID** field with the numeric UID. Change the **Profile** field to show the linker's Discord mention, and replace the **UID** field with the in-game name (IGN). This only touches the success embed in `core/guild-jobs.js`; the error embed (line ~74-79) and the manual `/checkin` embed are unchanged.

- [ ] **Step 1: Update the two fields**

In `core/guild-jobs.js`, in the success embed's `fields` array, change the first two entries from:

```js
							{ name: "Profile", value: profile.label, inline: true },
							{ name: "UID", value: String(resultMessage.uid), inline: true },
```

to:

```js
							{
								name: "Profile",
								value: profile.discordUserId
									? `<@${profile.discordUserId}>`
									: profile.label,
								inline: true
							},
							{
								name: "IGN",
								value: resultMessage.username ?? game.nickname ?? "—",
								inline: true
							},
```

(A profile with no `discordUserId` falls back to the label; an account with no IGN falls back to the game nickname, then `"—"`. The mention renders as a name in the embed field and does not ping.)

- [ ] **Step 2: Load smoke**

Run: `node --check core/guild-jobs.js`
Expected: exit 0.

- [ ] **Step 3: Format**

Run: `npx prettier --write core/guild-jobs.js && npx prettier --check core/guild-jobs.js`
Expected: clean.

- [ ] **Step 4: Manual verification**

Trigger an auto check-in (or inspect an embed). Expected: the **Profile** field shows `@you` (mention, no ping) and the second field is **IGN** with the in-game name instead of the numeric UID.

- [ ] **Step 5: Commit**

```bash
git add core/guild-jobs.js
git commit -m "feat(checkin): show linker mention and IGN in the auto check-in embed"
```

---

## Final verification

- [ ] Run `npm test` — expected `fail 0` (new: renameProfile ×3, classifyRedeem ×3, getRedeemStatuses ×1).
- [ ] Run `npm run lint` — no new errors (pre-existing telegram/command warnings are unrelated).
- [ ] Run `npm run format:check` — clean.
- [ ] Boot smoke: `node --check index.js` and confirm the app loads with a valid `.env` (accounts log in, commands register) without the subcommand crash.
- [ ] Update `CHANGELOG.md` `## [Unreleased]` with the five entries (Added: public checkin, link-list linker, link rename, bulk redeem; Fixed: duplicate reminder footer) — one line per bullet, unwrapped.
- [ ] Open a PR (or merge to `main`) and cut a release via the `/release` skill.

## Self-review notes

- **Spec coverage:** checkin (T1), link-list mention (T2), link rename (T3+T4), redeem bulk + cookie short-circuit + DB retry tracking (T5+T6+T7), reminder dedup (T8). All five covered.
- **Decision #1 (retry semantics):** terminal set = `ok/already/invalid/expired`; only `error`/untried retried — implemented in T7 `TERMINAL`.
- **Decision #2 (auto toggle):** bulk mode does not consult `account.redeemCode`; it redeems for all active accounts — implemented in T7 (no toggle check).
- **Decision #3 (retcodes):** centralized in `classifyRedeem` (T5).
- **Type consistency:** `renameProfile`, `getRedeemStatuses`, `classifyRedeem` names/signatures match across T3/T4, T6/T7, T5/T7.
