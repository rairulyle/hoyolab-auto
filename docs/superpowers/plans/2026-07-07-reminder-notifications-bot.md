# Reminder Notifications via Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every reminder cron (and code-redeem) through the Discord bot via one shared `notifyAccount`/`notifyGuildsForGame` helper that also keeps webhook/telegram delivery centralized, with a `default` channel fallback.

**Architecture:** A single helper in `core/notify.js` maps an account → its guild(s) via `findProfilesByGameUid` and posts to each guild's channel (resolving `${kind}ChannelId ?? defaultChannelId`), then fans out to webhook/telegram platforms (inert today, kept for later). Each of the nine reminder crons and `code-redeem` drops its own duplicated delivery loops and calls the helper once.

**Tech Stack:** Node ≥24 CommonJS, discord.js 14, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-07-reminder-notifications-bot-design.md`

## Global Constraints

- Game keys (DB): `genshin | starrail | zenless | honkai | termis`. Engine names differ for two: `zenless`→`nap`, `termis`→`tot` (via `GAMES[key].engineName`). Reminder crons carry `account.platform` = the **engine** name.
- Channel resolution for every notification: `guild[`${kind}ChannelId`] ?? guild.defaultChannelId ?? null`.
- Notify helpers **never throw** (wrap in try/catch, log + continue).
- Ping mentions ride in the message `content` (`<@id>`), never in embeds.
- Tests co-located in a `__tests__/` folder next to source; `npm test` runs `node --test "**/__tests__/**/*.test.js"`.
- Indentation TABS, double quotes, semicolons; `npx eslint <changed files>` must be clean (fix findings incl. warnings; don't disable).
- No code comments unless a non-obvious gotcha requires one.
- Conventional Commits; NO `Co-Authored-By:` / AI attribution.

## File Map

| File | Responsibility |
|---|---|
| `config/games.js` (modify) | add `gameKeyFromEngineName(engineName)` |
| `config/__tests__/defaults.test.js` (modify) | add `gameKeyFromEngineName` cases |
| `core/notify.js` (modify) | add `resolveChannelId`, `notifyAccount`, `notifyGuildsForGame`; switch `sendToGuildChannel` to `resolveChannelId` |
| `core/__tests__/notify.test.js` (new) | `resolveChannelId` unit tests |
| `commands/config/index.js` (modify) | add `default` + `reminder` to the `channel` type choices |
| `crons/{stamina,expedition,realm-currency,mimo,dailies-reminder,weeklies-reminder,hilichurl,shop-status,howl-scratch-card}/index.js` (modify) | replace delivery loops with `notifyAccount` |
| `crons/code-redeem/index.js` (modify) | fold into `notifyAccount` / `notifyGuildsForGame` |
| `COMMANDS.md` (modify) | document the `default`/`reminder` channel types |

---

### Task 1: `gameKeyFromEngineName`

**Files:**
- Modify: `config/games.js`
- Test: `config/__tests__/defaults.test.js`

**Interfaces:**
- Produces: `gameKeyFromEngineName(engineName)` → DB game key or `null` (reverse of `GAMES[key].engineName`).

- [ ] **Step 1: Add the failing test**

In `config/__tests__/defaults.test.js`, extend the existing games require —
change `const { GAMES, gameKeyFromRecordCardId } = require("../games.js");` to
also pull in `gameKeyFromEngineName` — then append this test:

```js
test("gameKeyFromEngineName reverses engine names to DB keys", () => {
	assert.equal(gameKeyFromEngineName("nap"), "zenless");
	assert.equal(gameKeyFromEngineName("tot"), "termis");
	assert.equal(gameKeyFromEngineName("genshin"), "genshin");
	assert.equal(gameKeyFromEngineName("starrail"), "starrail");
	assert.equal(gameKeyFromEngineName("honkai"), "honkai");
	assert.equal(gameKeyFromEngineName("unknown"), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `gameKeyFromEngineName is not a function`.

- [ ] **Step 3: Implement it**

In `config/games.js`, add after `gameKeyFromRecordCardId`:

```js
const gameKeyFromEngineName = (engineName) => Object.keys(GAMES).find(key => GAMES[key].engineName === engineName) ?? null;
```

and update the export:

```js
module.exports = { GAMES, gameKeyFromRecordCardId, gameKeyFromEngineName };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint config/ && git add config/
git commit -m "feat(config): add gameKeyFromEngineName lookup"
```

---

### Task 2: notify helpers + channel fallback

**Files:**
- Modify: `core/notify.js`
- Test: `core/__tests__/notify.test.js`

**Interfaces:**
- Consumes: `gameKeyFromEngineName` (Task 1); `app.db.findProfilesByGameUid`, `app.db.getGuild`, `app.db.listAllProfiles`, `app.Platform`, `app.Logger`.
- Produces:
  - `resolveChannelId(guild, kind)` → `guild[`${kind}ChannelId`] ?? guild.defaultChannelId ?? null` (pure).
  - `notifyAccount(account, { embeds, telegramText, ping = false, kind })` → posts to each of the account's guilds (bot) plus webhook/telegram; never throws.
  - `notifyGuildsForGame(gameKey, { embeds, telegramText, kind })` → posts once to each guild that has the game active (bot) plus webhook/telegram broadcast; never throws.

- [ ] **Step 1: Write the failing test for `resolveChannelId`**

Create `core/__tests__/notify.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { resolveChannelId } = require("../notify.js");

test("resolveChannelId returns the specific channel when set", () => {
	assert.equal(resolveChannelId({ checkinChannelId: "a", defaultChannelId: "d" }, "checkin"), "a");
});

test("resolveChannelId falls back to the default channel", () => {
	assert.equal(resolveChannelId({ defaultChannelId: "d" }, "reminder"), "d");
});

test("resolveChannelId returns null when neither is set", () => {
	assert.equal(resolveChannelId({}, "checkin"), null);
	assert.equal(resolveChannelId(null, "checkin"), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `resolveChannelId is not a function`.

- [ ] **Step 3: Rewrite `core/notify.js`**

```js
const { gameKeyFromEngineName } = require("../config/games.js");

const resolveChannelId = (guild, kind) => guild?.[`${kind}ChannelId`] ?? guild?.defaultChannelId ?? null;

const sendToGuildChannel = async (guildId, kind, payload) => {
	try {
		const guild = await app.db.getGuild(guildId);
		const channelId = resolveChannelId(guild, kind);
		if (!channelId) {
			app.Logger.warn("Notify", `Guild ${guildId} has no ${kind} (or default) channel configured; skipping notification`);
			return false;
		}

		const discord = app.Platform.get(1);
		if (!discord?.client) {
			app.Logger.warn("Notify", "Discord platform not connected; skipping notification");
			return false;
		}

		await discord.sendToChannel(channelId, payload);
		return true;
	}
	catch (e) {
		app.Logger.error("Notify", { message: `Failed to notify guild ${guildId}`, error: e.message });
		return false;
	}
};

const sendWebhookTelegram = async (platforms, { embeds, telegramText, account, ping = false }) => {
	for (const webhook of platforms.filter(p => p.name === "webhook")) {
		const content = ping && account ? webhook.createUserMention(account.discord) : undefined;
		for (const embed of embeds) {
			await webhook.send(embed, { content });
		}
	}
	if (telegramText) {
		for (const telegram of platforms.filter(p => p.name === "telegram")) {
			await telegram.send(telegramText);
		}
	}
};

const notifyAccount = async (account, { embeds, telegramText, ping = false, kind }) => {
	try {
		const gameKey = gameKeyFromEngineName(account.platform);
		if (gameKey) {
			const profiles = await app.db.findProfilesByGameUid(gameKey, account.uid);
			for (const profile of profiles) {
				const content = ping && profile.discordUserId ? `<@${profile.discordUserId}>` : undefined;
				await sendToGuildChannel(profile.guildId, kind, { content, embeds });
			}
		}

		const platforms = app.Platform.getForAccount(account);
		await sendWebhookTelegram(platforms, { embeds, telegramText, account, ping });
	}
	catch (e) {
		app.Logger.error("Notify", { message: "notifyAccount failed", error: e.message });
	}
};

const notifyGuildsForGame = async (gameKey, { embeds, telegramText, kind }) => {
	try {
		const profiles = (await app.db.listAllProfiles())
			.filter(p => p.tokenStatus !== "expired" && (p.games ?? []).some(g => g.active && g.key === gameKey));
		const guildIds = [...new Set(profiles.map(p => p.guildId))];
		for (const guildId of guildIds) {
			await sendToGuildChannel(guildId, kind, { embeds });
		}

		await sendWebhookTelegram(app.Platform.list, { embeds, telegramText });
	}
	catch (e) {
		app.Logger.error("Notify", { message: "notifyGuildsForGame failed", error: e.message });
	}
};

module.exports = { sendToGuildChannel, resolveChannelId, notifyAccount, notifyGuildsForGame };
```

Note: the webhook mention uses `createUserMention` which is a webhook-platform method; since no webhook platform is built today this branch is inert. The bot ping uses `<@id>` directly. Both are correct for their channel.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/notify.js core/__tests__/notify.test.js && git add core/notify.js core/__tests__/notify.test.js
git commit -m "feat(notify): add notifyAccount/notifyGuildsForGame + default-channel fallback"
```

---

### Task 3: `default` + `reminder` channel types

**Files:**
- Modify: `commands/config/index.js`
- Modify: `COMMANDS.md`

**Interfaces:**
- Consumes: the existing `commands/config/channel.js` leaf (generic `${type}ChannelId` writer — no change needed).

- [ ] **Step 1: Add the choices**

In `commands/config/index.js`, the `channel` subcommand's `type` option currently reads:

```js
			.addStringOption(opt => opt.setName("type").setDescription("Which notifications").setRequired(true)
				.addChoices({ name: "check-in", value: "checkin" }, { name: "redeem", value: "redeem" }))
```

Replace with:

```js
			.addStringOption(opt => opt.setName("type").setDescription("Which notifications").setRequired(true)
				.addChoices(
					{ name: "default (fallback for all)", value: "default" },
					{ name: "check-in", value: "checkin" },
					{ name: "redeem", value: "redeem" },
					{ name: "reminder", value: "reminder" }
				))
```

- [ ] **Step 2: Verify the command builds with the new choices**

Run:
```bash
node -e 'globalThis.app={}; const c=require("./commands/config/index.js"); const ch=c.buildSlashData().toJSON().options.find(o=>o.name==="channel"); console.log(ch.options.find(o=>o.name==="type").choices.map(x=>x.value).join(","));'
```
Expected: `default,checkin,redeem,reminder`

- [ ] **Step 3: Update COMMANDS.md**

In the `/config channel` row, change the `type` list to `default | check-in | redeem | reminder` and add a sentence: "`default` is the fallback channel every notification type uses when its own channel isn't set." Also update the `/config channel` bullet in the Notes section if it enumerates the types.

- [ ] **Step 4: Run tests, lint, commit**

Run: `npm test` — Expected: PASS (no behavior change to tested code).

```bash
npx eslint commands/config/ && git add commands/config/ COMMANDS.md
git commit -m "feat(commands): add default + reminder channel types to /config channel"
```

---

### Task 4: Convert the nine reminder crons

**Files:**
- Modify: `crons/stamina/index.js`, `crons/expedition/index.js`, `crons/realm-currency/index.js`, `crons/mimo/index.js`, `crons/dailies-reminder/index.js`, `crons/weeklies-reminder/index.js`, `crons/hilichurl/index.js`, `crons/shop-status/index.js`, `crons/howl-scratch-card/index.js`

**Interfaces:**
- Consumes: `notifyAccount` (Task 2).

No unit test — these crons run over live HoYoLAB data and runtime globals (consistent with the project's convention of not unit-testing cron/engine code). Verified by the Task 6 smoke check.

**The transformation recipe (apply to each cron):**

Every cron has, near the end of its per-account notification, this shape:

```js
const platforms = app.Platform.getForAccount(account);
// ...builds `embed`...
for (const webhook of platforms.filter(p => p.name === "webhook")) {
	const userId = webhook.createUserMention(account.discord);
	await webhook.send(embed, { content: userId, ... });
}
const messageText = [ /* game-specific lines */ ].join("\n");
const escapedMessage = app.Utils.escapeCharacters(messageText);
for (const telegram of platforms.filter(p => p.name === "telegram")) {
	await telegram.send(escapedMessage);
}
```

Replace it with:
1. Delete the `const platforms = app.Platform.getForAccount(account);` line.
2. Keep the `embed` (and the `messageText` array) exactly as they are.
3. Delete both `for` loops.
4. Rename the escaped message to `telegramText` and make the single helper call:

```js
const telegramText = app.Utils.escapeCharacters([ /* the SAME game-specific lines */ ].join("\n"));
await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
```

5. Add the require at the top of the file:

```js
const { notifyAccount } = require("../../core/notify.js");
```

- [ ] **Step 1: Worked examples (the two cron shapes)**

**Direct-loop shape — `crons/stamina/index.js`.** After the `embed` object, the current code is `for (const webhook ...)` + the `messageText`/`escapedMessage` block + `for (const telegram ...)`. Delete the `const platforms = app.Platform.getForAccount(account);` line above the embed, and replace the two loops + escaped-message with:

```js
				const telegramText = app.Utils.escapeCharacters([
					`📢 Stamina Reminder, ${description}`,
					`🎮 **Game**: ${data.assets.game}`,
					`🆔 **UID**: ${account.uid} ${account.nickname}`,
					`🌍 **Region**: ${app.HoyoLab.getRegion(account.region)}`,
					`🔋 **Stamina**: ${current}/${max}`,
					`🕒 **Recovery Time**: ${delta}`
				].join("\n"));
				await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
```

**RegionalTaskManager-callback shape — `crons/dailies-reminder/index.js`.**
The current tail (inside the `registerTask` callback) is lines ~23 and ~46-67. After the `embed` object, replace everything from `for (const webhook ...` through the telegram loop with:

```js
	const telegramText = app.Utils.escapeCharacters([
		`📢 Dailies Reminder, Don't Forget to Do Your Dailies!`,
		`🎮 **Game**: ${data.assets.game}`,
		`🆔 **UID**: ${account.uid} ${account.nickname}`,
		`🌍 **Region**: ${app.HoyoLab.getRegion(account.region)}`,
		`📅 **Completed Dailies**: ${data.dailies.task}/${data.dailies.maxTask}`,
		`🔋 **Current Stamina**: ${current}/${max} (${delta})`
	].join("\n"));
	await notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" });
```

and delete `const platforms = app.Platform.getForAccount(account);` (line ~23). Add `const { notifyAccount } = require("../../core/notify.js");` at the top.

- [ ] **Step 2: Apply the recipe to the remaining crons**

Read each remaining cron and apply the recipe. Per-cron notes:
- **expedition, realm-currency, shop-status** — direct per-account loops, identical shape to the stamina example. Pass `[embed]`.
- **mimo, hilichurl** — build one embed per redeemed/claimed item inside a loop; each already constructs an `embed` (and a telegram text) per item. Convert each notification site the same way — `notifyAccount(account, { embeds: [embed], telegramText, ping: true, kind: "reminder" })`. Keep the surrounding automation logic untouched.
- **weeklies-reminder** — declares `const webhooks = ...; const telegrams = ...;` up front and pushes several embeds. Replace the `webhooks`/`telegrams` declarations and their send loops with a single `notifyAccount(account, { embeds, telegramText, ping: true, kind: "reminder" })` where `embeds` is the array it already assembled.
- **howl-scratch-card** — same recipe inside its `registerTask` callback.

Do NOT change any cron's decision logic (thresholds, `.check` guards, embed contents) — only the delivery block.

- [ ] **Step 3: Verify no cron still references the removed delivery paths**

Run: `grep -rn "getForAccount\|p.name === \"webhook\"\|p.name === \"telegram\"" crons/ | grep -v code-redeem`
Expected: no matches (all reminder crons converted; `code-redeem` is Task 5).

- [ ] **Step 4: Run tests + lint**

Run: `npm test` — Expected: PASS (unchanged; no cron is unit-tested).
Run: `npx eslint crons/stamina crons/expedition crons/realm-currency crons/mimo crons/dailies-reminder crons/weeklies-reminder crons/hilichurl crons/shop-status crons/howl-scratch-card`
Expected: clean for changed lines. (Note: `crons/mimo/index.js:248` has a PRE-EXISTING `max-statements-per-line` error unrelated to this change — leave it.)

- [ ] **Step 5: Commit**

```bash
git add crons/
git commit -m "feat(crons): route reminder notifications through the bot helper"
```

---

### Task 5: Fold `code-redeem` into the helpers

**Files:**
- Modify: `crons/code-redeem/index.js`

**Interfaces:**
- Consumes: `notifyAccount`, `notifyGuildsForGame` (Task 2), `gameKeyFromEngineName` (Task 1).

- [ ] **Step 1: Rewrite the requires + `recordAndNotify`**

Replace the top requires and `recordAndNotify` with:

```js
const {
	fetchCodes,
	checkAndRedeem,
	buildMessage
} = require("./utils");
const { notifyAccount, notifyGuildsForGame } = require("../../core/notify.js");
const { gameKeyFromEngineName } = require("../../config/games.js");

const recordAndNotify = async (data, message, status) => {
	const gameKey = gameKeyFromEngineName(data.account.platform);
	const profiles = await app.db.findProfilesByGameUid(gameKey, data.account.uid);
	for (const profile of profiles) {
		await app.db.recordRedeem({
			profileId: profile._id,
			guildId: profile.guildId,
			game: gameKey,
			code: data.code.code ?? String(data.code),
			source: "auto",
			status,
			message: status === "ok" ? "" : (data.reason ?? "")
		});
	}
	await notifyAccount(data.account, { embeds: [message.embed], telegramText: message.telegram, kind: "redeem" });
};
```

(This keeps per-profile `recordRedeem` but delegates all delivery to `notifyAccount`. No `ping` for redeem.)

- [ ] **Step 2: Simplify the success/failed/manual loops**

Replace the three loops (`for (const data of success)`, `failed`, `manual`) with:

```js
			for (const data of success) {
				const message = buildMessage("success", data);
				await recordAndNotify(data, message, "ok");
			}

			for (const data of failed) {
				const message = buildMessage("failed", data);
				await recordAndNotify(data, message, "error");
			}

			for (const data of manual) {
				const message = buildMessage("manual", data);
				const gameKey = gameKeyFromEngineName(data.gameKey) ?? data.gameKey;
				await notifyGuildsForGame(gameKey, { embeds: [message.embed], telegramText: message.telegram, kind: "redeem" });
			}
```

(Manual entries carry `data.gameKey` as the engine-ish key `"honkai"`/`"tot"`; `gameKeyFromEngineName` maps `"tot"`→`"termis"` and leaves `"honkai"` as-is.)

- [ ] **Step 3: Verify no webhook/telegram loops remain in code-redeem**

Run: `grep -n "getForAccount\|p.name === \"webhook\"\|p.name === \"telegram\"\|sendToGuildChannel" crons/code-redeem/index.js`
Expected: no matches.

- [ ] **Step 4: Run tests + lint**

Run: `npm test` — Expected: PASS.
Run: `npx eslint crons/code-redeem/index.js` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add crons/code-redeem/index.js
git commit -m "feat(redeem): route redeem notifications through the shared bot helper"
```

---

### Task 6: Smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + lint**

Run: `npm test`
Expected: all pass (Task 1 + Task 2 added tests; nothing else regressed).

Run: `npx eslint config/ core/ commands/config/ crons/`
Expected: no NEW findings (the pre-existing `crons/mimo/index.js:248` error remains, out of scope).

- [ ] **Step 2: Boot-time module load (no reference errors in the converted crons)**

The crons are `require`d at boot when the cron registry loads. Confirm the whole registry + notify helper resolve without a syntax/reference error:

Run:
```bash
node -e '
const wrap = { warn(){}, error(){}, info(){}, debug(){}, log(){} };
globalThis.app = { Logger: wrap, Platform: { list: [], get: () => null, getForAccount: () => [] }, db: {}, Utils: { escapeCharacters: (s)=>s, formatTime: ()=>"", convertCase:(s)=>s }, HoyoLab: { get: ()=>null, getRegion: ()=>"", getActiveAccounts: ()=>[] }, RegionalTaskManager: function(){ this.registerTask=()=>{}; this.executeTasks=async()=>{}; } };
require("./core/notify.js");
for (const c of ["stamina","expedition","realm-currency","mimo","dailies-reminder","weeklies-reminder","hilichurl","shop-status","howl-scratch-card","code-redeem"]) {
	require(`./crons/${c}/index.js`);
	console.log("loaded", c);
}
console.log("ALL CRONS + NOTIFY LOAD OK");
'
```
Expected: prints `loaded <cron>` for all ten and `ALL CRONS + NOTIFY LOAD OK` (no throw). This catches require-cycle / reference errors introduced by the conversion.

- [ ] **Step 3: In-Discord manual checklist (user assists, needs a real token)**

1. `/config channel type:default #bot-notifications` → confirm it stores.
2. With a linked profile that has an active game and a reminder enabled (e.g. stamina check), wait for (or manually trigger) the cron → reminder embed posts to the default channel, pinging the profile's user in the message content.
3. `/config channel type:reminder #reminders` → subsequent reminders move to `#reminders`; check-in/redeem still use their own or default.
4. A redeemable code appearing → redeem result posts to the `redeem` (or default) channel.

- [ ] **Step 4: Use superpowers:finishing-a-development-branch**

Decide merge/PR per that skill.
