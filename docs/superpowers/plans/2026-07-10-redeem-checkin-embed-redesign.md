# Redeem & Check-In Command Embed Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text `/redeem` replies and the per-account `/checkin` cards with convention-aligned embeds — one embed per game, one 🟢/🟡/🔴/⚪ row per account.

**Architecture:** One new pure builder (`buildRedeemSummaryEmbed`) joins the existing ones in `core/notify.js`; the `/redeem` single-code path reuses the existing `buildRedeemEmbed`; `/checkin` gets a pure grouping helper (`commands/checkin/summarize.js`) whose output feeds the existing `buildGroupedEmbed`. Command files only gather data and wire builders — no rendering logic inline.

**Tech Stack:** Node.js ≥ 24, CommonJS, discord.js 14 (raw embed objects), `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-10-redeem-checkin-embed-redesign-design.md`

## Global Constraints

- Branch `feat/redeem-checkin-embed-groups` already exists and is checked out — commit there, never on `main`.
- Commit messages: Conventional Commits, short titles, **no** `Co-Authored-By`/AI attribution.
- Prettier owns formatting (tabs, tabWidth 4, double quotes, semicolons, `trailingComma: none`, printWidth 100); lint-staged runs it pre-commit, but run `npx prettier --write <files>` on anything you touch anyway.
- No code comments unless a non-obvious gotcha requires one.
- Tests live in `__tests__/` next to the source, mirroring the filename; test glob is `**/__tests__/**/*.test.js`.
- Pure builders/helpers get unit tests; command wiring bound to `app.*` globals is verified by `npm test` (boot/load smoke) + manual in-Discord check — do not mock globals.
- No behavior changes: redeem/check-in logic, status vocabularies, and DB records are untouched — presentation only.
- Status dots come from the existing `LEVEL_DOT` vocabulary: 🟢 ok, 🟡 warn, 🔴 alert, ⚪ info.

---

### Task 1: `buildRedeemSummaryEmbed` in `core/notify.js`

**Files:**
- Modify: `core/notify.js` (add builder after `buildRedeemEmbed`, ~line 168; extend `module.exports`)
- Test: `core/__tests__/notify.test.js`

**Interfaces:**
- Consumes: `LEVEL_DOT` (already in `core/notify.js`).
- Produces: `buildRedeemSummaryEmbed(group)` where `group = { gameName, assets, codesChecked, rows }`, `rows: [{ ign, uid, redeemed, skipped, failed, stopped }]` → Discord embed object `{ color, author?, title, description, footer }`. Task 2 imports it from `core/notify.js`.

- [ ] **Step 1: Write the failing tests**

Append to `core/__tests__/notify.test.js` (add `buildRedeemSummaryEmbed` to the existing require on line 4):

```js
test("buildRedeemSummaryEmbed renders one row per account with only non-zero counts", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Genshin Impact",
		assets: { author: "Paimon", logo: "l", color: 0x123456 },
		codesChecked: 4,
		rows: [
			{ ign: "KidClutch", uid: "801604887", redeemed: 3, skipped: 0, failed: 1, stopped: false },
			{ ign: "Lumine", uid: "813474458", redeemed: 0, skipped: 0, failed: 0, stopped: true }
		]
	});
	assert.equal(embed.title, "Genshin Impact · Redeem Summary");
	assert.equal(embed.color, 0x123456);
	assert.equal(embed.author.name, "Paimon");
	assert.equal(
		embed.description,
		"🟢 **KidClutch** (801604887) — 3 redeemed · 1 failed\n🔴 **Lumine** (813474458) — stopped: cookie expired"
	);
	assert.deepEqual(embed.footer, { text: "4 codes checked" });
});

test("buildRedeemSummaryEmbed marks all-skipped accounts as nothing new", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Zenless Zone Zero",
		assets: null,
		codesChecked: 1,
		rows: [{ ign: "Mosou", uid: "1301652594", redeemed: 0, skipped: 5, failed: 0, stopped: false }]
	});
	assert.equal(embed.author, undefined);
	assert.equal(embed.color, 0x5865f2);
	assert.equal(embed.description, "⚪ **Mosou** (1301652594) — nothing new (5 already redeemed)");
	assert.deepEqual(embed.footer, { text: "1 code checked" });
});

test("buildRedeemSummaryEmbed uses a red dot for failure-only rows and keeps counts before a stop", () => {
	const embed = buildRedeemSummaryEmbed({
		gameName: "Honkai: Star Rail",
		assets: null,
		codesChecked: 3,
		rows: [
			{ ign: "SlimReaper", uid: "830039705", redeemed: 0, skipped: 0, failed: 2, stopped: false },
			{ ign: "Nova", uid: "830000001", redeemed: 1, skipped: 1, failed: 0, stopped: true }
		]
	});
	assert.equal(
		embed.description,
		"🔴 **SlimReaper** (830039705) — 2 failed\n🔴 **Nova** (830000001) — 1 redeemed · 1 skipped · stopped: cookie expired"
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the three new tests FAIL with `buildRedeemSummaryEmbed is not a function`; all pre-existing tests PASS.

- [ ] **Step 3: Implement the builder**

In `core/notify.js`, insert after `buildRedeemEmbed` (after line 168) and add the export:

```js
const redeemSummaryRow = (row) => {
	const counts = [
		row.redeemed > 0 ? `${row.redeemed} redeemed` : null,
		row.skipped > 0 && (row.redeemed > 0 || row.failed > 0) ? `${row.skipped} skipped` : null,
		row.failed > 0 ? `${row.failed} failed` : null
	].filter(Boolean);
	if (row.stopped) {
		counts.push("stopped: cookie expired");
	}
	const dot = row.stopped || (row.redeemed === 0 && row.failed > 0) ? "🔴" : row.redeemed > 0 ? "🟢" : "⚪";
	const text = counts.length > 0 ? counts.join(" · ") : `nothing new (${row.skipped} already redeemed)`;
	return `${dot} **${row.ign}** (${row.uid}) — ${text}`;
};

const buildRedeemSummaryEmbed = (group) => ({
	color: group.assets?.color ?? 0x5865f2,
	...(group.assets ? { author: { name: group.assets.author, icon_url: group.assets.logo } } : {}),
	title: `${group.gameName} · Redeem Summary`,
	description: group.rows.map(redeemSummaryRow).join("\n"),
	footer: { text: `${group.codesChecked} ${group.codesChecked === 1 ? "code" : "codes"} checked` }
});
```

And in `module.exports` add `buildRedeemSummaryEmbed` after `buildRedeemEmbed`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write core/notify.js core/__tests__/notify.test.js
git add core/notify.js core/__tests__/notify.test.js
git commit -m "feat(notify): add buildRedeemSummaryEmbed"
```

---

### Task 2: `/redeem` bulk mode replies with per-game embeds

**Files:**
- Modify: `commands/redeem/index.js:81-179` (bulk section)

**Interfaces:**
- Consumes: `buildRedeemSummaryEmbed(group)` from Task 1; `GAMES` from `config/games.js` (already partially imported — extend the require).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the requires**

`commands/redeem/index.js:1-3` becomes:

```js
const { classifyRedeem } = require("../../hoyolab-modules/redeem-status.js");
const { GAMES, gameKeyFromEngineName } = require("../../config/games.js");
const { buildRedeemSummaryEmbed } = require("../../core/notify.js");
const { setTimeout: sleep } = require("node:timers/promises");
```

- [ ] **Step 2: Collect embed groups alongside the text summary**

In the bulk section, replace `const summary = [];` (line 93) with:

```js
	const summary = [];
	const embeds = [];
```

Inside the `for (const engineGame of targetGames)` loop, right after the `accounts` filtering (line 109), add a rows collector, and change the per-account tail so each account pushes both a text line (kept as the non-Discord fallback) and a row:

```js
			const rows = [];
```

Replace the existing `summary.push(...)` (lines 171-173) with:

```js
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
```

Then, still inside the `engineGame` loop but after the `for (const account of accounts)` loop closes, build the game's embed:

```js
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
```

- [ ] **Step 3: Reply with embeds on Discord, text elsewhere**

Replace the final reply (lines 177-178):

```js
		const reply = summary.length > 0 ? summary.join("\n") : "No codes available to redeem.";
		if (interaction) {
			return embeds.length > 0
				? interaction.editReply({ embeds: embeds.slice(0, 10) })
				: interaction.editReply({ content: reply });
		}
		return { success: true, reply };
```

- [ ] **Step 4: Verify**

Run: `npm test` — expected PASS (load smoke covers the command file parsing/requires).
Run: `npm run lint` — expected clean.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write commands/redeem/index.js
git add commands/redeem/index.js
git commit -m "feat(redeem): per-game summary embeds for bulk redeem"
```

---

### Task 3: `/redeem` single-code path replies with a mini embed

**Files:**
- Modify: `commands/redeem/index.js:54-79` (single-code section)

**Interfaces:**
- Consumes: `buildRedeemEmbed(group)` — already exported from `core/notify.js`; expects `{ gameName, assets, code, rewards, rows: [{ success, ign, reason? }] }`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the notify require from Task 2**

```js
const { buildRedeemEmbed, buildRedeemSummaryEmbed } = require("../../core/notify.js");
```

- [ ] **Step 2: Build the embed in the single-code branch**

Replace lines 72-78:

```js
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
```

Gotcha: `buildRedeemEmbed` titles the embed `<Game> · Code Redeemed` even on failure — the 🔴 row carries the failure reason; that matches the approved mockups.

- [ ] **Step 3: Verify**

Run: `npm test` — expected PASS.
Run: `npm run lint` — expected clean.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write commands/redeem/index.js
git add commands/redeem/index.js
git commit -m "feat(redeem): embed reply for single-code redeem"
```

---

### Task 4: pure check-in grouping helper

**Files:**
- Create: `commands/checkin/summarize.js`
- Test: `commands/checkin/__tests__/summarize.test.js`

**Interfaces:**
- Consumes: nothing (fully pure — no `app.*`, no config imports).
- Produces: `groupCheckInResults(results, errors)`.
  - `results`: the check-in execution objects (`{ platform, username?, uid, award: { name, count }, total, result, assets: { game, author, logo, color } }`).
  - `errors`: `[{ game, name, assets, error }]` — `name`/`assets` enriched by the caller (Task 5).
  - Returns `[{ name, assets, rows: [{ level, ign, text }] }]` — the exact group shape `buildGroupedEmbed(group, { titleSuffix })` consumes.
  - Signed detection: every game's `signedMessage` contains "already" (`Traveler, you've already checked in today~`, `Already signed in today`, …), so `/already/i.test(result)` → level `info`, text `already claimed · Day N`.

- [ ] **Step 1: Write the failing tests**

Create `commands/checkin/__tests__/summarize.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { groupCheckInResults } = require("../summarize.js");

const genshinAssets = { game: "Genshin Impact", author: "Paimon", logo: "l", color: 0x123456 };

test("groupCheckInResults groups accounts of one game into one group", () => {
	const groups = groupCheckInResults(
		[
			{
				platform: "genshin",
				username: "KidClutch",
				uid: "801604887",
				award: { name: "Primogem", count: 20 },
				total: 12,
				result: "Congratulations, Traveler! You have successfully checked in today~",
				assets: genshinAssets
			},
			{
				platform: "genshin",
				username: "Rairu",
				uid: "807321896",
				award: { name: "Primogem", count: 20 },
				total: 31,
				result: "Traveler, you've already checked in today~",
				assets: genshinAssets
			}
		],
		[]
	);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].name, "Genshin Impact");
	assert.deepEqual(groups[0].assets, genshinAssets);
	assert.deepEqual(groups[0].rows, [
		{ level: "ok", ign: "KidClutch", text: "Primogem ×20 · Day 12" },
		{ level: "info", ign: "Rairu", text: "already claimed · Day 31" }
	]);
});

test("groupCheckInResults splits games and falls back to uid when username is missing", () => {
	const groups = groupCheckInResults(
		[
			{
				platform: "tot",
				uid: "100",
				award: { name: "Stellin", count: 30 },
				total: 2,
				result: "success",
				assets: { game: "Tears of Themis", author: "MC", logo: "l", color: 0x1 }
			},
			{
				platform: "genshin",
				username: "KidClutch",
				uid: "801604887",
				award: { name: "Mora", count: 10000 },
				total: 13,
				result: "success",
				assets: genshinAssets
			}
		],
		[]
	);
	assert.equal(groups.length, 2);
	assert.equal(groups[0].name, "Tears of Themis");
	assert.deepEqual(groups[0].rows, [{ level: "ok", ign: "100", text: "Stellin ×30 · Day 2" }]);
});

test("groupCheckInResults renders errors as alert rows, including error-only games", () => {
	const groups = groupCheckInResults(
		[],
		[{ game: "honkai", name: "Honkai Impact 3rd", assets: null, error: "Request timed out" }]
	);
	assert.equal(groups.length, 1);
	assert.equal(groups[0].name, "Honkai Impact 3rd");
	assert.equal(groups[0].assets, null);
	assert.deepEqual(groups[0].rows, [
		{ level: "alert", ign: "Honkai Impact 3rd", text: "Request timed out" }
	]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: new tests FAIL with `Cannot find module '../summarize.js'`.

- [ ] **Step 3: Implement the helper**

Create `commands/checkin/summarize.js`:

```js
const groupCheckInResults = (results, errors) => {
	const groups = new Map();
	const ensure = (key, name, assets) => {
		if (!groups.has(key)) {
			groups.set(key, { name, assets, rows: [] });
		}
		return groups.get(key);
	};

	for (const r of results) {
		const group = ensure(r.platform, r.assets?.game ?? r.platform, r.assets ?? null);
		const signed = /already/i.test(r.result ?? "");
		group.rows.push({
			level: signed ? "info" : "ok",
			ign: r.username ?? r.uid,
			text: signed
				? `already claimed · Day ${r.total}`
				: `${r.award.name} ×${r.award.count} · Day ${r.total}`
		});
	}

	for (const e of errors) {
		const group = ensure(e.game, e.name ?? e.game, e.assets ?? null);
		group.rows.push({ level: "alert", ign: e.name ?? e.game, text: e.error });
	}

	return [...groups.values()];
};

module.exports = { groupCheckInResults };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write commands/checkin/summarize.js commands/checkin/__tests__/summarize.test.js
git add commands/checkin/summarize.js commands/checkin/__tests__/summarize.test.js
git commit -m "feat(checkin): pure per-game grouping helper"
```

---

### Task 5: wire `/checkin` Discord path to grouped embeds

**Files:**
- Modify: `commands/checkin/index.js:84-128` (the `platform.id === 1` branch) and the top of the file (requires)

**Interfaces:**
- Consumes: `groupCheckInResults(results, errors)` from Task 4; `buildGroupedEmbed(group, { titleSuffix })` from `core/notify.js`; `GAMES`, `gameKeyFromEngineName` from `config/games.js`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add requires at the top of `commands/checkin/index.js`**

```js
const { buildGroupedEmbed } = require("../../core/notify.js");
const { GAMES, gameKeyFromEngineName } = require("../../config/games.js");
const { groupCheckInResults } = require("./summarize.js");
```

- [ ] **Step 2: Replace the per-account embed block**

Replace the whole `if (platform.id === 1) { ... }` body (lines 84-128 — the `results.map` field-grid embeds and the `❌ Check-In Errors` embed) with:

```js
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
```

Leave the Telegram branch (`platform.id === 2`) and the final plain-text `else` branch exactly as they are.

- [ ] **Step 3: Verify**

Run: `npm test` — expected PASS.
Run: `npm run lint` — expected clean.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write commands/checkin/index.js
git add commands/checkin/index.js
git commit -m "feat(checkin): group manual check-in embeds by game"
```

---

### Task 6: changelog, full verification, manual check

**Files:**
- Modify: `CHANGELOG.md` (Unreleased section)

**Interfaces:**
- Consumes: everything above.
- Produces: the finished branch.

- [ ] **Step 1: Add changelog entries under `## [Unreleased]`**

```markdown
## [Unreleased]

### Changed

- `/redeem` bulk mode now replies with one embed per game (🟢/🔴/⚪ row per account, codes-checked footer) instead of plain text, and the single-code path replies with a code embed.
- `/checkin` now replies with one embed per game listing each account as a row; failures appear as 🔴 rows in their game's embed instead of a separate error embed.
```

- [ ] **Step 2: Full gate**

Run: `npm test` → all pass. `npm run lint` → clean. `npm run format:check` → clean.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for redeem and check-in embed redesign"
```

- [ ] **Step 4: Manual in-Discord verification (user-assisted)**

Per testing policy, command wiring is verified live: run the bot, then in Discord run `/redeem` (bulk), `/redeem` with `game+account+code`, and `/checkin`, and compare against the approved mockups (https://claude.ai/code/artifact/32443ff7-195f-4fcf-8aa5-29f7955bee98). Report results honestly; do not claim success without this check or explicit user sign-off that they'll do it.
