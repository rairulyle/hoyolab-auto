# DB-backed Command-managed Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `config.json5` with an embedded NeDB database managed entirely through Discord slash commands, modeling one profile (cookie) → many games, with multi-guild isolation, result logging, and live reload.

**Architecture:** A config **assembler** reads NeDB + `.env` + code defaults and emits the legacy `{accounts[], platforms[], crons{}}` shape the existing engine already consumes — engine internals stay untouched except a tiny per-account check-in filter. One `reload()` path serves boot and every mutating command. Commands live in the existing `commands/<name>/index.js` registry; an interactive editor adds a component/modal router to the Discord platform.

**Tech Stack:** Node ≥20 CommonJS, `@seald-io/nedb` (document DB, one file per collection), `dotenv`, `discord.js` 14 (already present), `cron` 3 (already present, IANA `timeZone` support), built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-07-db-command-config-design.md`

## Global Constraints

- DB files live at the fixed path `data/db/` (next to the existing `data/cache.json`). Never configurable via env — relocation is a docker-compose volume concern.
- `.env` holds only `DISCORD_TOKEN` (required) and optional `DISCORD_BOT_ID` override. No DB path, no owner-id lists.
- Admin gating = Discord **guild Administrator permission**, checked both via `setDefaultMemberPermissions` on the builder and at runtime.
- Game keys (DB + code): `genshin | starrail | zenless | honkai | termis`. Engine-internal names differ for two (`zenless`→`nap`, `termis`→`tot`); only `config/games.js` may know that mapping.
- Check-in statuses stored: `ok | already | error | captcha` (v1 emits `ok|already|error`; `captcha` reserved). Redeem statuses stored: `ok | already | invalid | expired | error` (v1 cron emits `ok|error`; the engine's own cache already dedupes terminal codes).
- Per-guild scheduling applies to **check-in only**. Code-redeem stays an every-minute global poller (codes are redeemed on discovery); it gets per-guild *notification routing* and result logging. The `check-in` and `missed-check-in` global crons are blacklisted — per-guild jobs own daily check-in timing.
- Profiles store `settings` as **partial overrides**; `config/defaults.js` is merged in at assemble time.
- Tests live in a **co-located `__tests__/` folder next to the source** (e.g. `core/cookie.js` → `core/__tests__/cookie.test.js`), never a top-level `tests/` dir. Require paths are relative to `__tests__/` (one extra `../`). The `npm test` glob is `node --test "**/__tests__/**/*.test.js"`.
- All new code: tabs for indentation, double quotes, semicolons (match existing ESLint config). Run `npx eslint <changed files>` before every commit.
- No code comments unless a non-obvious gotcha requires one.
- Conventional Commits for every commit. No Co-Authored-By trailers, no AI attribution.

## File Map

| File | Responsibility |
|---|---|
| `config/games.js` (new) | Game catalog: key ↔ engine type ↔ record-card game_id ↔ display names |
| `config/defaults.js` (new) | Global defaults (loglevel/userAgent/retry/cron expressions/guild defaults) + per-game default settings + `mergeSettings` |
| `core/cookie.js` (new) | Cookie string → normalized map, `ltuid`, redeem capability |
| `core/time.js` (new) | `todayInTz`, `hhmmToCron`, `nextOccurrenceUnix`, `isValidTimezone`, `isValidHhmm` |
| `db/index.js` (new) | `Database` class — the only NeDB consumer |
| `core/assembler.js` (new) | DB + env + defaults → legacy config object |
| `core/hoyolab-api.js` (new) | `getGameRecordCard` + detection → `[{key, uid, region, nickname, level}]` |
| `core/admin.js` (new) | `requireGuildAdmin(interaction)` runtime gate |
| `core/notify.js` (new) | `sendToGuildChannel(guildId, kind, payload)` |
| `core/guild-jobs.js` (new) | `runGuildCheckIn(guildId)` — per-guild check-in + record + notify |
| `core/reload.js` (new) | `reload()` / `scheduleReload()` — assemble, rebuild HoyoLab.list, reschedule crons |
| `commands/link/index.js` (new) | `/link` definition + subcommand dispatch |
| `commands/link/service.js` (new) | `buildGames`, `mergeGames`, `linkProfile` (testable logic) |
| `commands/link/editor.js` (new) | Interactive settings editor (panels, toggles, modal) |
| `commands/config/index.js` (new) | `/config schedule|channel|timezone` |
| `commands/migrate/index.js` (new) | `/migrate` — import config.json5 attachment |
| `classes/command.js` (modify) | Support `buildSlashData` escape hatch |
| `platforms/discord.js` (modify) | Component/modal router + `sendToChannel` |
| `hoyolab-modules/*/check-in.js` ×5 (modify) | `checkAndExecute(accountData)` optional filter |
| `hoyolab-modules/zenless/index.js` (modify) | pass `accountData` through `checkIn` |
| `crons/index.js` (modify) | `initCrons(cronConfig)` param instead of `require config.js` |
| `crons/hilichurl/index.js`, `crons/mimo/index.js` (modify) | jitter from `app.Config` |
| `crons/code-redeem/index.js` (modify) | record results + guild notify |
| `index.js` (rewrite) | dotenv → db → assemble → reload → connect platform |
| Deleted | `config.js`, `default.config.json5`, `convert.js`, `setup/` |
| `<dir>/__tests__/*.test.js` (new, co-located) | node:test suites |

---

### Task 1: Dependencies, test harness, game catalog, defaults

**Files:**
- Modify: `package.json`
- Create: `config/games.js`
- Create: `config/defaults.js`
- Test: `config/__tests__/defaults.test.js`

**Interfaces:**
- Produces: `GAMES` map (each entry carries `engineAccountId`) + `gameKeyFromRecordCardId(id)` (config/games.js); `defaults` object with `loglevel, userAgent, retry, crons, guild, gameSettings` + `mergeSettings(base, override)` (config/defaults.js).

- [ ] **Step 1: Install dependencies and add test script**

```bash
npm install @seald-io/nedb dotenv
```

In `package.json` `scripts`, add/replace (the `__tests__` glob is required — Node ≥22's `--test` treats a bare directory as a single file, and its no-arg discovery greedily matches `test-*.js` source files like `singleton/test-notification.js`):

```json
"test": "node --test \"**/__tests__/**/*.test.js\""
```

- [ ] **Step 2: Write failing test for mergeSettings and catalog**

Create `config/__tests__/defaults.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { GAMES, gameKeyFromRecordCardId } = require("../games.js");
const defaults = require("../defaults.js");

test("catalog maps record card ids to game keys", () => {
	assert.equal(gameKeyFromRecordCardId(2), "genshin");
	assert.equal(gameKeyFromRecordCardId(6), "starrail");
	assert.equal(gameKeyFromRecordCardId(8), "zenless");
	assert.equal(gameKeyFromRecordCardId(1), "honkai");
	assert.equal(gameKeyFromRecordCardId(999), null);
	assert.equal(GAMES.termis.recordCardGameId, null);
});

test("every game has default settings", () => {
	for (const key of Object.keys(GAMES)) {
		assert.ok(defaults.gameSettings[key], `missing defaults for ${key}`);
	}
	assert.equal(defaults.gameSettings.genshin.stamina.check, false);
	assert.equal(typeof defaults.gameSettings.genshin.stamina.threshold, "number");
});

test("mergeSettings deep-merges overrides without mutating base", () => {
	const base = defaults.gameSettings.genshin;
	const merged = defaults.mergeSettings(base, { stamina: { check: true } });
	assert.equal(merged.stamina.check, true);
	assert.equal(merged.stamina.threshold, base.stamina.threshold);
	assert.equal(base.stamina.check, false);
	assert.equal(merged.dailiesCheck, base.dailiesCheck);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../config/games.js'`

- [ ] **Step 4: Implement config/games.js**

```js
const GAMES = {
	genshin: { type: "genshin", engineName: "genshin", name: "Genshin Impact", short: "GI", recordCardGameId: 2, engineAccountId: 3 },
	starrail: { type: "starrail", engineName: "starrail", name: "Honkai: Star Rail", short: "HSR", recordCardGameId: 6, engineAccountId: 4 },
	zenless: { type: "zenless", engineName: "nap", name: "Zenless Zone Zero", short: "ZZZ", recordCardGameId: 8, engineAccountId: 5 },
	honkai: { type: "honkai", engineName: "honkai", name: "Honkai Impact 3rd", short: "HI3", recordCardGameId: 1, engineAccountId: 1 },
	termis: { type: "termis", engineName: "tot", name: "Tears of Themis", short: "ToT", recordCardGameId: null, engineAccountId: 2 }
};

const gameKeyFromRecordCardId = (id) => Object.keys(GAMES).find(key => GAMES[key].recordCardGameId === id) ?? null;

module.exports = { GAMES, gameKeyFromRecordCardId };
```

- [ ] **Step 5: Implement config/defaults.js**

Per-game default settings replicate `default.config.json5` shapes (template.js validates `stamina.{check,threshold,persistent}` and `expedition.{check,persistent}` exist for genshin/starrail/zenless — defaults must always include them). Thresholds stay under each game's `maxStamina` (genshin 200, starrail 300, zenless 240).

```js
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const mergeSettings = (base, override) => {
	const result = { ...base };
	for (const [key, value] of Object.entries(override ?? {})) {
		result[key] = (isPlainObject(value) && isPlainObject(base?.[key]))
			? mergeSettings(base[key], value)
			: value;
	}
	return result;
};

module.exports = {
	loglevel: "info",
	userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	retry: { attempts: 3, delayMs: 1000, timeoutMs: 30000 },
	crons: {
		whitelist: [],
		blacklist: ["check-in", "missed-check-in"]
	},
	guild: { timezone: "UTC", checkinTime: "00:00" },
	gameSettings: {
		honkai: {},
		termis: {},
		genshin: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			realm: { check: false, persistent: false },
			stamina: { check: false, threshold: 150, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false },
			hilichurl: { check: false, redeem: false }
		},
		starrail: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			stamina: { check: false, threshold: 170, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false, redeem: false, lottery: false }
		},
		zenless: {
			redeemCode: false,
			dailiesCheck: false,
			weekliesCheck: false,
			shopStatus: false,
			stamina: { check: false, threshold: 220, persistent: false },
			expedition: { check: false, persistent: false },
			mimo: { check: false, redeem: false, lottery: false }
		}
	},
	mergeSettings
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 7: Lint and commit**

```bash
npx eslint config/ && git add package.json config/
git commit -m "feat(config): add game catalog, code defaults, and test harness"
```

---

### Task 2: Cookie parsing module

**Files:**
- Create: `core/cookie.js`
- Test: `core/__tests__/cookie.test.js`

**Interfaces:**
- Produces: `parseCookie(raw)` → `{ cookie, ltuid, codeRedeem }` or throws `Error` with `.message` naming the missing key. `cookie` is the normalized `key=value; key=value` string containing only the keys the engine builds (`ltoken_v2, ltuid_v2, ltmid_v2` + redeem trio when present).

- [ ] **Step 1: Write failing test**

Create `core/__tests__/cookie.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCookie } = require("../cookie.js");

const BASE = "ltoken_v2=tokenval; ltuid_v2=12345678; ltmid_v2=midval";
const REDEEM = `${BASE}; cookie_token_v2=ctok; account_mid_v2=amid; account_id_v2=12345678`;

test("parses minimal cookie without redeem capability", () => {
	const parsed = parseCookie(BASE);
	assert.equal(parsed.ltuid, "12345678");
	assert.equal(parsed.codeRedeem, false);
	assert.equal(parsed.cookie, "ltoken_v2=tokenval; ltuid_v2=12345678; ltmid_v2=midval");
});

test("detects redeem capability and keeps redeem keys", () => {
	const parsed = parseCookie(REDEEM);
	assert.equal(parsed.codeRedeem, true);
	assert.match(parsed.cookie, /cookie_token_v2=ctok/);
	assert.match(parsed.cookie, /account_id_v2=12345678/);
});

test("tolerates extra keys, whitespace, and trailing semicolons", () => {
	const messy = ` mi18nLang=en-us;${BASE}; DEVICEFP=abc; `;
	const parsed = parseCookie(messy);
	assert.equal(parsed.ltuid, "12345678");
	assert.doesNotMatch(parsed.cookie, /DEVICEFP/);
});

test("throws on missing required keys", () => {
	assert.throws(() => parseCookie("ltoken_v2=x; ltmid_v2=y"), /ltuid_v2/);
	assert.throws(() => parseCookie(""), /ltoken_v2/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/cookie.js'`

- [ ] **Step 3: Implement core/cookie.js**

```js
const REQUIRED = ["ltoken_v2", "ltuid_v2", "ltmid_v2"];
const REDEEM = ["cookie_token_v2", "account_mid_v2", "account_id_v2"];

const parseCookie = (raw) => {
	const map = Object.fromEntries(
		String(raw ?? "")
			.split(";")
			.map(part => part.trim())
			.filter(Boolean)
			.map(part => {
				const eq = part.indexOf("=");
				return eq === -1 ? [part, ""] : [part.slice(0, eq), part.slice(eq + 1)];
			})
	);

	for (const key of REQUIRED) {
		if (!map[key]) {
			throw new Error(`Cookie is missing required key: ${key}`);
		}
	}

	const codeRedeem = REDEEM.every(key => Boolean(map[key]));
	const keys = codeRedeem ? [...REQUIRED, ...REDEEM] : REQUIRED;
	const cookie = keys.map(key => `${key}=${map[key]}`).join("; ");

	return { cookie, ltuid: map.ltuid_v2, codeRedeem };
};

module.exports = { parseCookie };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/ && git add core/cookie.js core/__tests__/cookie.test.js
git commit -m "feat(core): add cookie parsing with ltuid and redeem detection"
```

---

### Task 3: Time utilities

**Files:**
- Create: `core/time.js`
- Test: `core/__tests__/time.test.js`

**Interfaces:**
- Produces: `isValidHhmm(str)`, `isValidTimezone(tz)`, `hhmmToCron(hhmm)` → `"0 M H * * *"`, `todayInTz(tz)` → `"YYYY-MM-DD"`, `nextOccurrenceUnix(hhmm, tz, now?)` → unix seconds of the next HH:MM in tz.

- [ ] **Step 1: Write failing test**

Create `core/__tests__/time.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { isValidHhmm, isValidTimezone, hhmmToCron, todayInTz, nextOccurrenceUnix } = require("../time.js");

test("isValidHhmm", () => {
	assert.equal(isValidHhmm("00:00"), true);
	assert.equal(isValidHhmm("23:59"), true);
	assert.equal(isValidHhmm("24:00"), false);
	assert.equal(isValidHhmm("9:30"), false);
	assert.equal(isValidHhmm("abc"), false);
});

test("isValidTimezone", () => {
	assert.equal(isValidTimezone("Asia/Manila"), true);
	assert.equal(isValidTimezone("UTC"), true);
	assert.equal(isValidTimezone("Mars/Olympus"), false);
});

test("hhmmToCron", () => {
	assert.equal(hhmmToCron("09:30"), "0 30 9 * * *");
	assert.equal(hhmmToCron("00:00"), "0 0 0 * * *");
});

test("todayInTz returns ISO date shifted by timezone", () => {
	assert.match(todayInTz("UTC"), /^\d{4}-\d{2}-\d{2}$/);
	const utcPlus14 = todayInTz("Pacific/Kiritimati");
	const utcMinus11 = todayInTz("Pacific/Pago_Pago");
	assert.notEqual(utcPlus14, utcMinus11);
});

test("nextOccurrenceUnix is in the future and lands on the requested wall time", () => {
	const now = new Date("2026-07-07T10:00:00Z");
	const unix = nextOccurrenceUnix("12:00", "UTC", now);
	assert.equal(unix, Date.parse("2026-07-07T12:00:00Z") / 1000);
	const past = nextOccurrenceUnix("09:00", "UTC", now);
	assert.equal(past, Date.parse("2026-07-08T09:00:00Z") / 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/time.js'`

- [ ] **Step 3: Implement core/time.js**

The `nextOccurrenceUnix` trick: compute the tz's wall-clock "now" via `Intl`, build today's target wall time, and convert back by applying the tz offset delta.

```js
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidHhmm = (value) => HHMM_REGEX.test(value);

const isValidTimezone = (tz) => {
	try {
		Intl.DateTimeFormat("en", { timeZone: tz });
		return true;
	}
	catch {
		return false;
	}
};

const hhmmToCron = (hhmm) => {
	const [, hours, minutes] = hhmm.match(HHMM_REGEX);
	return `0 ${Number(minutes)} ${Number(hours)} * * *`;
};

const todayInTz = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

const wallClockParts = (date, tz) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false
	}).formatToParts(date);
	return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
};

const tzOffsetMs = (date, tz) => {
	const wall = wallClockParts(date, tz);
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour % 24, wall.minute, wall.second);
	return asUtc - date.getTime();
};

const nextOccurrenceUnix = (hhmm, tz, now = new Date()) => {
	const [, hours, minutes] = hhmm.match(HHMM_REGEX);
	const offset = tzOffsetMs(now, tz);
	const wall = wallClockParts(now, tz);
	let target = Date.UTC(wall.year, wall.month - 1, wall.day, Number(hours), Number(minutes), 0) - offset;
	if (target <= now.getTime()) {
		target += 24 * 60 * 60 * 1000;
	}
	return Math.floor(target / 1000);
};

module.exports = { isValidHhmm, isValidTimezone, hhmmToCron, todayInTz, nextOccurrenceUnix };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/time.js core/__tests__/time.test.js && git add core/time.js core/__tests__/time.test.js
git commit -m "feat(core): add timezone-aware time utilities"
```

---

### Task 4: Database repository

**Files:**
- Create: `db/index.js`
- Test: `db/__tests__/index.test.js`

**Interfaces:**
- Produces: `Database` class. Constructor `new Database(dir?)` (default `path.join(process.cwd(), "data", "db")`). Methods (all async): `init()`, `upsertProfile(profile)` → doc, `getProfile(guildId, label)` → doc|null, `listProfiles(guildId)` → docs, `listAllProfiles()` → docs, `removeProfile(guildId, label)` → number, `setTokenStatus(profileId, status)`, `updateGameEntry(profileId, gameKey, patch)` → doc|null (deep-merges `patch.settings`, shallow-assigns other fields like `active`), `findProfilesByGameUid(gameKey, uid)` → docs, `getGuild(guildId)` → doc|null, `listGuilds()` → docs, `setGuildField(guildId, field, value)` → doc, `recordCheckin(row)`, `recordRedeem(row)`, `getCheckin(profileId, game, date)` → doc|null.
- Consumes: `mergeSettings` from `config/defaults.js`.

- [ ] **Step 1: Write failing test**

Create `db/__tests__/index.test.js`:

```js
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("../index.js");

let dir;
let db;

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyodb-"));
	db = new Database(dir);
	await db.init();
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const profile = (over = {}) => ({
	guildId: "g1",
	label: "main",
	cookie: "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b",
	ltuid: "111",
	tokenStatus: "active",
	discordUserId: "u1",
	games: [
		{ key: "genshin", uid: "800", region: "os_asia", nickname: "Trav", active: true, settings: {} }
	],
	...over
});

test("upsert + get + list are guild-scoped", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2", label: "main", ltuid: "222" }));

	const found = await db.getProfile("g1", "main");
	assert.equal(found.ltuid, "111");
	assert.equal((await db.listProfiles("g1")).length, 1);
	assert.equal((await db.listAllProfiles()).length, 2);
});

test("upsert same guild+label updates instead of duplicating", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ discordUserId: "u2" }));
	const all = await db.listProfiles("g1");
	assert.equal(all.length, 1);
	assert.equal(all[0].discordUserId, "u2");
});

test("label lookup is case-insensitive", async () => {
	await db.upsertProfile(profile());
	assert.ok(await db.getProfile("g1", "MAIN"));
});

test("removeProfile only removes in its guild", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2" }));
	assert.equal(await db.removeProfile("g1", "main"), 1);
	assert.equal((await db.listAllProfiles()).length, 1);
});

test("updateGameEntry deep-merges settings and sets active", async () => {
	const saved = await db.upsertProfile(profile());
	await db.updateGameEntry(saved._id, "genshin", { settings: { stamina: { check: true } } });
	await db.updateGameEntry(saved._id, "genshin", { active: false });
	const found = await db.getProfile("g1", "main");
	assert.equal(found.games[0].settings.stamina.check, true);
	assert.equal(found.games[0].active, false);
});

test("findProfilesByGameUid finds across guilds", async () => {
	await db.upsertProfile(profile());
	await db.upsertProfile(profile({ guildId: "g2" }));
	const hits = await db.findProfilesByGameUid("genshin", "800");
	assert.equal(hits.length, 2);
});

test("guild settings upsert", async () => {
	await db.setGuildField("g1", "timezone", "Asia/Manila");
	await db.setGuildField("g1", "checkinChannelId", "c1");
	const guild = await db.getGuild("g1");
	assert.equal(guild.timezone, "Asia/Manila");
	assert.equal(guild.checkinChannelId, "c1");
	assert.equal((await db.listGuilds()).length, 1);
});

test("recordCheckin upserts one row per profile+game+date", async () => {
	const saved = await db.upsertProfile(profile());
	const row = { profileId: saved._id, guildId: "g1", game: "genshin", date: "2026-07-07", status: "ok", message: "done" };
	await db.recordCheckin(row);
	await db.recordCheckin({ ...row, status: "already" });
	const found = await db.getCheckin(saved._id, "genshin", "2026-07-07");
	assert.equal(found.status, "already");
});

test("setTokenStatus flips status", async () => {
	const saved = await db.upsertProfile(profile());
	await db.setTokenStatus(saved._id, "expired");
	assert.equal((await db.getProfile("g1", "main")).tokenStatus, "expired");
});

test("recordRedeem appends", async () => {
	const saved = await db.upsertProfile(profile());
	await db.recordRedeem({ profileId: saved._id, guildId: "g1", game: "genshin", code: "CODE1", source: "auto", status: "ok", message: "" });
	await db.recordRedeem({ profileId: saved._id, guildId: "g1", game: "genshin", code: "CODE1", source: "auto", status: "ok", message: "" });
	const rows = await db.collections.redeemResults.findAsync({ code: "CODE1" });
	assert.equal(rows.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../db/index.js'`

- [ ] **Step 3: Implement db/index.js**

NeDB has no compound unique indexes; a computed `key` field (`guildId:lowercased-label`) carries the uniqueness. `_id` on checkin rows is computed the same way for upsert-by-composite-key.

```js
const fs = require("node:fs");
const path = require("node:path");
const Datastore = require("@seald-io/nedb");

const { mergeSettings } = require("../config/defaults.js");

const profileKey = (guildId, label) => `${guildId}:${String(label).toLowerCase()}`;

module.exports = class Database {
	constructor (dir = path.join(process.cwd(), "data", "db")) {
		this.dir = dir;
		this.collections = {};
	}

	async init () {
		fs.mkdirSync(this.dir, { recursive: true });

		const open = async (name) => {
			const store = new Datastore({ filename: path.join(this.dir, `${name}.db`) });
			await store.loadDatabaseAsync();
			return store;
		};

		this.collections.profiles = await open("profiles");
		this.collections.guilds = await open("guilds");
		this.collections.checkinResults = await open("checkin-results");
		this.collections.redeemResults = await open("redeem-results");

		await this.collections.profiles.ensureIndexAsync({ fieldName: "key", unique: true });
		await this.collections.profiles.ensureIndexAsync({ fieldName: "guildId" });
	}

	async upsertProfile (profile) {
		const key = profileKey(profile.guildId, profile.label);
		const existing = await this.collections.profiles.findOneAsync({ key });
		const doc = {
			...existing,
			...profile,
			key,
			createdAt: existing?.createdAt ?? new Date().toISOString()
		};
		delete doc._id;
		const { affectedDocuments } = await this.collections.profiles.updateAsync(
			{ key },
			doc,
			{ upsert: true, returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async getProfile (guildId, label) {
		return await this.collections.profiles.findOneAsync({ key: profileKey(guildId, label) });
	}

	async listProfiles (guildId) {
		return await this.collections.profiles.findAsync({ guildId });
	}

	async listAllProfiles () {
		return await this.collections.profiles.findAsync({});
	}

	async removeProfile (guildId, label) {
		return await this.collections.profiles.removeAsync({ key: profileKey(guildId, label) }, {});
	}

	async setTokenStatus (profileId, status) {
		await this.collections.profiles.updateAsync({ _id: profileId }, { $set: { tokenStatus: status } }, {});
	}

	async updateGameEntry (profileId, gameKey, patch) {
		const doc = await this.collections.profiles.findOneAsync({ _id: profileId });
		if (!doc) {
			return null;
		}

		const games = doc.games.map(game => {
			if (game.key !== gameKey) {
				return game;
			}
			const { settings, ...rest } = patch;
			return {
				...game,
				...rest,
				settings: settings ? mergeSettings(game.settings ?? {}, settings) : (game.settings ?? {})
			};
		});

		const { affectedDocuments } = await this.collections.profiles.updateAsync(
			{ _id: profileId },
			{ $set: { games } },
			{ returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async findProfilesByGameUid (gameKey, uid) {
		return await this.collections.profiles.findAsync({
			games: { $elemMatch: { key: gameKey, uid } }
		});
	}

	async getGuild (guildId) {
		return await this.collections.guilds.findOneAsync({ _id: guildId });
	}

	async listGuilds () {
		return await this.collections.guilds.findAsync({});
	}

	async setGuildField (guildId, field, value) {
		const { affectedDocuments } = await this.collections.guilds.updateAsync(
			{ _id: guildId },
			{ $set: { [field]: value } },
			{ upsert: true, returnUpdatedDocs: true }
		);
		return affectedDocuments;
	}

	async recordCheckin (row) {
		const _id = `${row.profileId}:${row.game}:${row.date}`;
		await this.collections.checkinResults.updateAsync(
			{ _id },
			{ ...row, _id, ranAt: new Date().toISOString() },
			{ upsert: true }
		);
	}

	async getCheckin (profileId, game, date) {
		return await this.collections.checkinResults.findOneAsync({ _id: `${profileId}:${game}:${date}` });
	}

	async recordRedeem (row) {
		await this.collections.redeemResults.insertAsync({ ...row, redeemedAt: new Date().toISOString() });
	}
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint db/ && git add db/
git commit -m "feat(db): add NeDB repository for profiles, guilds, and results"
```

---

### Task 5: Config assembler

**Files:**
- Create: `core/assembler.js`
- Test: `core/__tests__/assembler.test.js`

**Interfaces:**
- Consumes: `Database` instance (`listAllProfiles`), `config/defaults.js`, `config/games.js`, `process.env.DISCORD_TOKEN` / `DISCORD_BOT_ID`.
- Produces: `assemble(db, env?)` → legacy config: `{ loglevel, userAgent, retry, testNotification: {enabled:false}, platforms: [discordPlatform], crons: {whitelist, blacklist}, accounts: [{id, active, type, data: []}] }`. Only games present in at least one active profile appear in `accounts`. Expired profiles are excluded. Duplicate `(gameKey, ltuid)` across guilds: first wins (engine identity), a `warnings` array on the result reports drops.

- [ ] **Step 1: Write failing test**

Create `core/__tests__/assembler.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { assemble } = require("../assembler.js");

const fakeDb = (profiles) => ({ listAllProfiles: async () => profiles });
const ENV = { DISCORD_TOKEN: "token.abc.def", DISCORD_BOT_ID: "999" };

const profile = (over = {}) => ({
	_id: "p1",
	guildId: "g1",
	label: "main",
	cookie: "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b",
	ltuid: "111",
	tokenStatus: "active",
	discordUserId: "u1",
	games: [
		{ key: "genshin", uid: "800", region: "os_asia", nickname: "T", active: true, settings: { stamina: { check: true } } }
	],
	...over
});

test("assembles game-grouped accounts with merged settings", async () => {
	const cfg = await assemble(fakeDb([profile()]), ENV);
	assert.equal(cfg.accounts.length, 1);
	const genshin = cfg.accounts[0];
	assert.equal(genshin.type, "genshin");
	assert.equal(genshin.data.length, 1);
	const acc = genshin.data[0];
	assert.equal(acc.cookie, "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b");
	assert.equal(acc.stamina.check, true);
	assert.equal(typeof acc.stamina.threshold, "number");
	assert.deepEqual(acc.discord, { userId: "u1" });
});

test("one profile with two games yields two account groups sharing the cookie", async () => {
	const games = [
		{ key: "genshin", uid: "800", active: true, settings: {} },
		{ key: "starrail", uid: "801", active: true, settings: {} }
	];
	const cfg = await assemble(fakeDb([profile({ games })]), ENV);
	assert.equal(cfg.accounts.length, 2);
	assert.equal(cfg.accounts[0].data[0].cookie, cfg.accounts[1].data[0].cookie);
});

test("skips expired profiles, inactive games, and duplicate ltuid per game", async () => {
	const cfg = await assemble(fakeDb([
		profile({ _id: "p1" }),
		profile({ _id: "p2", guildId: "g2", label: "other" }),
		profile({ _id: "p3", guildId: "g3", label: "dead", tokenStatus: "expired", ltuid: "333" }),
		profile({ _id: "p4", guildId: "g4", label: "off", ltuid: "444", games: [{ key: "genshin", uid: "900", active: false, settings: {} }] })
	]), ENV);
	assert.equal(cfg.accounts.length, 1);
	assert.equal(cfg.accounts[0].data.length, 1);
	assert.equal(cfg.warnings.length, 1);
	assert.match(cfg.warnings[0], /111/);
});

test("builds discord platform from env", async () => {
	const cfg = await assemble(fakeDb([]), ENV);
	assert.deepEqual(cfg.platforms, [{ id: 1, active: true, type: "discord", botId: "999", token: "token.abc.def" }]);
	assert.equal(cfg.accounts.length, 0);
	assert.equal(cfg.testNotification.enabled, false);
});

test("derives botId from token when DISCORD_BOT_ID absent", async () => {
	const id = "123456789012345678";
	const token = `${Buffer.from(id).toString("base64")}.x.y`;
	const cfg = await assemble(fakeDb([]), { DISCORD_TOKEN: token });
	assert.equal(cfg.platforms[0].botId, id);
});

test("throws without DISCORD_TOKEN", async () => {
	await assert.rejects(() => assemble(fakeDb([]), {}), /DISCORD_TOKEN/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/assembler.js'`

- [ ] **Step 3: Implement core/assembler.js**

```js
const defaults = require("../config/defaults.js");
const { GAMES } = require("../config/games.js");

const botIdFromToken = (token) => {
	try {
		const decoded = Buffer.from(token.split(".")[0], "base64").toString("utf8");
		return /^\d{15,21}$/.test(decoded) ? decoded : null;
	}
	catch {
		return null;
	}
};

const assemble = async (db, env = process.env) => {
	const token = env.DISCORD_TOKEN;
	if (!token) {
		throw new Error("DISCORD_TOKEN is not set. Add it to your .env file.");
	}

	const botId = env.DISCORD_BOT_ID ?? botIdFromToken(token);
	if (!botId) {
		throw new Error("Could not derive bot ID from DISCORD_TOKEN; set DISCORD_BOT_ID in .env.");
	}

	const profiles = (await db.listAllProfiles()).filter(p => p.tokenStatus !== "expired");

	const warnings = [];
	const seen = new Set();
	const grouped = {};

	for (const profile of profiles) {
		for (const game of profile.games ?? []) {
			if (!game.active || !GAMES[game.key]) {
				continue;
			}

			const identity = `${game.key}:${profile.ltuid}`;
			if (seen.has(identity)) {
				warnings.push(`Skipped duplicate account ${identity} (label "${profile.label}" in guild ${profile.guildId}); ltuid ${profile.ltuid} already assembled for ${game.key}`);
				continue;
			}
			seen.add(identity);

			grouped[game.key] ??= [];
			grouped[game.key].push({
				cookie: profile.cookie,
				discord: { userId: profile.discordUserId ?? null },
				allowedPlatforms: null,
				...defaults.mergeSettings(defaults.gameSettings[game.key], game.settings ?? {})
			});
		}
	}

	const accounts = Object.entries(grouped).map(([key, data]) => ({
		id: GAMES[key].engineAccountId,
		active: true,
		type: GAMES[key].type,
		data
	}));

	return {
		loglevel: defaults.loglevel,
		userAgent: defaults.userAgent,
		retry: defaults.retry,
		testNotification: { enabled: false },
		platforms: [{ id: 1, active: true, type: "discord", botId, token }],
		crons: { ...defaults.crons },
		accounts,
		warnings
	};
};

module.exports = { assemble };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/assembler.js core/__tests__/assembler.test.js && git add core/assembler.js core/__tests__/assembler.test.js
git commit -m "feat(core): add config assembler producing legacy engine shape"
```

---

### Task 6: Command-class escape hatch + admin gate

**Files:**
- Modify: `classes/command.js`
- Create: `core/admin.js`
- Test: `core/__tests__/admin.test.js`

**Interfaces:**
- Produces: command definitions may set `buildSlashData: () => SlashCommandBuilder` which `getSlashCommandData()` returns verbatim; `requireGuildAdmin(interaction)` → boolean, replying ephemerally itself when denied.

- [ ] **Step 1: Write failing test**

Create `core/__tests__/admin.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");

const { requireGuildAdmin } = require("../admin.js");

const fakeInteraction = ({ inGuild, admin }) => {
	const replies = [];
	return {
		replies,
		inGuild: () => inGuild,
		memberPermissions: { has: (flag) => flag === PermissionFlagsBits.Administrator && admin },
		reply: async (payload) => replies.push(payload)
	};
};

test("denies outside guilds", async () => {
	const interaction = fakeInteraction({ inGuild: false, admin: true });
	assert.equal(await requireGuildAdmin(interaction), false);
	assert.match(interaction.replies[0].content, /server/i);
});

test("denies non-admins", async () => {
	const interaction = fakeInteraction({ inGuild: true, admin: false });
	assert.equal(await requireGuildAdmin(interaction), false);
	assert.match(interaction.replies[0].content, /administrator/i);
});

test("allows guild admins without replying", async () => {
	const interaction = fakeInteraction({ inGuild: true, admin: true });
	assert.equal(await requireGuildAdmin(interaction), true);
	assert.equal(interaction.replies.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/admin.js'`

- [ ] **Step 3: Implement core/admin.js**

```js
const { PermissionFlagsBits } = require("discord.js");

const requireGuildAdmin = async (interaction) => {
	if (!interaction.inGuild()) {
		await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
		return false;
	}

	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await interaction.reply({ content: "You need the Administrator permission to use this command.", ephemeral: true });
		return false;
	}

	return true;
};

module.exports = { requireGuildAdmin };
```

Note: the pinned discord.js 14.14.1 uses the `ephemeral: true` reply option (the `MessageFlags.Ephemeral` flags style only became canonical in later 14.x). Use `ephemeral: true` in all new command code.

- [ ] **Step 4: Add buildSlashData support to classes/command.js**

In `classes/command.js`, inside the constructor after `this.description = data.description;`, add:

```js
		this.buildSlashData = typeof data.buildSlashData === "function" ? data.buildSlashData : null;
```

At the top of `getSlashCommandData()` (before the `if (!this.params || ...)` check), add:

```js
		if (this.buildSlashData) {
			return this.buildSlashData();
		}
```

- [ ] **Step 5: Run tests, lint, commit**

Run: `npm test` — Expected: PASS

```bash
npx eslint core/admin.js classes/command.js core/__tests__/admin.test.js
git add core/admin.js classes/command.js core/__tests__/admin.test.js
git commit -m "feat(commands): add slash-builder escape hatch and guild-admin gate"
```

---

### Task 7: HoYoLAB detection API

**Files:**
- Create: `core/hoyolab-api.js`
- Test: `core/__tests__/hoyolab-api.test.js`

**Interfaces:**
- Produces: `detectGames(cookie, ltuid, got?)` → `[{ key, uid, region, nickname, level }]` for record-card games; throws `Error` with `retcode` property on API failure (retcode -100/10001 → message contains "cookie"). `got` defaults to `(options) => app.Got("HoYoLab", options)` so tests inject a fake.

- [ ] **Step 1: Write failing test**

Create `core/__tests__/hoyolab-api.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { detectGames } = require("../hoyolab-api.js");

const CARD_RESPONSE = {
	statusCode: 200,
	body: {
		retcode: 0,
		data: {
			list: [
				{ game_id: 2, game_role_id: "800000001", region: "os_asia", nickname: "Trav", level: 60 },
				{ game_id: 6, game_role_id: "801000001", region: "prod_official_asia", nickname: "Blaze", level: 70 },
				{ game_id: 999, game_role_id: "x", region: "y", nickname: "z", level: 1 }
			]
		}
	}
};

test("maps record cards to game keys, skipping unknown ids", async () => {
	const got = async () => CARD_RESPONSE;
	const games = await detectGames("cookie", "111", got);
	assert.deepEqual(games, [
		{ key: "genshin", uid: "800000001", region: "os_asia", nickname: "Trav", level: 60 },
		{ key: "starrail", uid: "801000001", region: "prod_official_asia", nickname: "Blaze", level: 70 }
	]);
});

test("throws with cookie hint on auth retcode", async () => {
	const got = async () => ({ statusCode: 200, body: { retcode: -100, message: "Please login" } });
	await assert.rejects(() => detectGames("cookie", "111", got), /cookie/i);
});

test("throws on http error", async () => {
	const got = async () => ({ statusCode: 500, body: {} });
	await assert.rejects(() => detectGames("cookie", "111", got), /500/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core/hoyolab-api.js'`

- [ ] **Step 3: Implement core/hoyolab-api.js**

```js
const { gameKeyFromRecordCardId } = require("../config/games.js");

const RECORD_CARD_URL = "https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard";
const AUTH_RETCODES = [-100, 10001, 10102];

const defaultGot = (options) => app.Got("HoYoLab", options);

const detectGames = async (cookie, ltuid, got = defaultGot) => {
	const res = await got({
		url: RECORD_CARD_URL,
		responseType: "json",
		throwHttpErrors: false,
		searchParams: { uid: ltuid },
		headers: { Cookie: cookie }
	});

	if (res.statusCode !== 200) {
		throw new Error(`HoYoLAB returned HTTP ${res.statusCode} while detecting games.`);
	}

	const { retcode, message, data } = res.body;
	if (retcode !== 0) {
		const hint = AUTH_RETCODES.includes(retcode)
			? "Cookie rejected by HoYoLAB. Copy a fresh cookie and try again."
			: `HoYoLAB error: ${message ?? "unknown"}`;
		const error = new Error(`${hint} (retcode ${retcode})`);
		error.retcode = retcode;
		throw error;
	}

	return (data?.list ?? [])
		.map(card => {
			const key = gameKeyFromRecordCardId(card.game_id);
			if (!key) {
				return null;
			}
			return {
				key,
				uid: String(card.game_role_id),
				region: card.region,
				nickname: card.nickname,
				level: card.level
			};
		})
		.filter(Boolean);
};

module.exports = { detectGames };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/hoyolab-api.js core/__tests__/hoyolab-api.test.js && git add core/hoyolab-api.js core/__tests__/hoyolab-api.test.js
git commit -m "feat(core): add HoYoLAB game record card detection"
```

---

### Task 8: Engine touch — per-account check-in filter

**Files:**
- Modify: `hoyolab-modules/genshin/check-in.js`, `hoyolab-modules/starrail/check-in.js`, `hoyolab-modules/zenless/check-in.js`, `hoyolab-modules/honkai/check-in.js`, `hoyolab-modules/termis/check-in.js`
- Modify: `hoyolab-modules/zenless/index.js:161`

**Interfaces:**
- Produces: `platform.checkIn(accountData)` checks in only `accountData` (single runtime account object) when provided, all accounts when omitted — consistently across all five games. Return shape unchanged (array of result messages).

No unit test (engine code exercised over live HTTP is out of scope); verified by the existing `checkin` command path in the Task 14 smoke test.

- [ ] **Step 1: Apply the filter to all five check-in.js files**

In each `hoyolab-modules/<game>/check-in.js`, the `checkAndExecute` method starts with (message text varies per game):

```js
	async checkAndExecute () {
		const accounts = this.#instance.accounts;
```

Change the two lines in every file to:

```js
	async checkAndExecute (accountData) {
		const accounts = accountData ? [accountData].flat() : this.#instance.accounts;
```

Files where the signature already reads `checkAndExecute (accountData)` but ignores the parameter get only the second line changed.

- [ ] **Step 2: Fix zenless passthrough**

`hoyolab-modules/zenless/index.js` line 161:

```js
	async checkIn () {
```

becomes:

```js
	async checkIn (accountData) {
```

and inside it, `ci.checkAndExecute()` becomes `ci.checkAndExecute(accountData)`.

- [ ] **Step 3: Verify no other checkAndExecute callers break**

Run: `grep -rn "checkAndExecute" hoyolab-modules/ crons/ commands/`
Expected: only the five `index.js` passthroughs and five `check-in.js` definitions; all pass `accountData` through or accept undefined.

- [ ] **Step 4: Lint and commit**

```bash
npx eslint hoyolab-modules/ && git add hoyolab-modules/
git commit -m "feat(hoyolab): allow per-account check-in execution"
```

---

### Task 9: Guild notification helper

**Files:**
- Create: `core/notify.js`
- Modify: `platforms/discord.js` (add `sendToChannel`)

**Interfaces:**
- Consumes: `app.db` (Database), `app.Platform.get(1)` (DiscordController).
- Produces: `DiscordController.sendToChannel(channelId, { content?, embeds? })`; `sendToGuildChannel(guildId, kind, payload)` → boolean (false + warn log when guild/channel unconfigured or send fails; never throws). `kind` ∈ `"checkin" | "redeem"` resolving `checkinChannelId` / `redeemChannelId`.

- [ ] **Step 1: Add sendToChannel to platforms/discord.js**

After the existing `send` method:

```js
	async sendToChannel (channelId, options = {}) {
		const channelData = await this.client.channels.fetch(channelId);
		if (!channelData) {
			throw new app.Error({ message: "Discord channel not found", args: { channelId } });
		}

		await channelData.send({
			content: options.content ?? undefined,
			embeds: options.embeds ?? []
		});
	}
```

- [ ] **Step 2: Implement core/notify.js**

```js
const sendToGuildChannel = async (guildId, kind, payload) => {
	try {
		const guild = await app.db.getGuild(guildId);
		const channelId = guild?.[`${kind}ChannelId`];
		if (!channelId) {
			app.Logger.warn("Notify", `Guild ${guildId} has no ${kind} channel configured; skipping notification`);
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

module.exports = { sendToGuildChannel };
```

The entire body is inside the try/catch so a DB-layer failure in `getGuild` also resolves to `false` — the helper must never throw (crons call it in a loop).

- [ ] **Step 3: Lint and commit**

```bash
npx eslint core/notify.js platforms/discord.js
git add core/notify.js platforms/discord.js
git commit -m "feat(notify): add per-guild channel notification helper"
```

---

### Task 10: Guild check-in job

**Files:**
- Create: `core/guild-jobs.js`

**Interfaces:**
- Consumes: `app.db`, `app.HoyoLab` (`get`, `getActiveAccounts`), `sendToGuildChannel` (core/notify.js), `todayInTz` (core/time.js), `GAMES` (config/games.js), `defaults.guild` (config/defaults.js).
- Produces: `runGuildCheckIn(guildId)` — for every active profile+game in the guild: skips when today's row is already terminal, runs `platform.checkIn(account)`, records `ok|already|error`, sends one embed batch to the guild's checkin channel with content pings (from message content, not embeds) for profiles whose run errored.

- [ ] **Step 1: Implement core/guild-jobs.js**

`status` derivation: the engine pushes already-signed accounts with `result === platform.config.signedMessage`; anything else in the result array is a fresh sign-in (`ok`). An empty result array for a specifically-passed account means its flow failed (`error`) — the engine logs details itself. A thrown error is also `error`. `captcha` is not derivable from this integration and stays unemitted (vocabulary reserves it).

```js
const { sendToGuildChannel } = require("./notify.js");
const { todayInTz } = require("./time.js");
const { GAMES } = require("../config/games.js");
const defaults = require("../config/defaults.js");

const TERMINAL = new Set(["ok", "already"]);

const runGuildCheckIn = async (guildId) => {
	const guild = await app.db.getGuild(guildId);
	const timezone = guild?.timezone ?? defaults.guild.timezone;
	const date = todayInTz(timezone);

	const profiles = (await app.db.listProfiles(guildId)).filter(p => p.tokenStatus !== "expired");
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
			const account = platform?.accounts.find(a => a.uid === game.uid)
				?? platform?.accounts.find(a => a.cookie === profile.cookie);
			if (!platform || !account) {
				continue;
			}

			let status = "error";
			let message = "Check-in did not complete; see logs.";
			let resultMessage = null;

			try {
				const results = await platform.checkIn(account);
				resultMessage = (results ?? []).find(r => r.uid === account.uid) ?? (results ?? [])[0] ?? null;
				if (resultMessage) {
					status = resultMessage.result === platform.config.signedMessage ? "already" : "ok";
					message = resultMessage.result;
				}
			}
			catch (e) {
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
					color: 0xFF0000,
					title: `${GAMES[game.key].name} Check-In Failed`,
					description: `**${profile.label}** (${game.uid ?? "unknown uid"}): ${message}`,
					timestamp: new Date()
				});
			}
			else if (resultMessage) {
				embeds.push({
					color: resultMessage.assets.color,
					title: resultMessage.assets.game,
					author: { name: resultMessage.assets.author, icon_url: resultMessage.assets.logo },
					thumbnail: { url: resultMessage.award?.icon },
					fields: [
						{ name: "Profile", value: profile.label, inline: true },
						{ name: "UID", value: String(resultMessage.uid), inline: true },
						{ name: "Region", value: resultMessage.region, inline: true },
						{ name: "Today's Reward", value: resultMessage.award ? `${resultMessage.award.name} x${resultMessage.award.count}` : "—", inline: true },
						{ name: "Total Sign-ins", value: String(resultMessage.total), inline: true },
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
```

- [ ] **Step 2: Lint and commit**

```bash
npx eslint core/guild-jobs.js && git add core/guild-jobs.js
git commit -m "feat(core): add per-guild check-in job with result logging"
```

---

### Task 11: reload() + cron rewiring

**Files:**
- Create: `core/reload.js`
- Modify: `crons/index.js` (accept config param; stop returning early on missing config.js)
- Modify: `crons/hilichurl/index.js:2,9`, `crons/mimo/index.js:2,9` (jitter from `app.Config`)

**Interfaces:**
- Consumes: `assemble` (core/assembler.js), `runGuildCheckIn` (core/guild-jobs.js), `hhmmToCron` (core/time.js), `initCrons` (crons/index.js), `app.db`, `app.HoyoLab`.
- Produces: `reload()` → `{ warnings, accountCount, guildJobCount }`; `scheduleReload(delayMs=3000)` debounced; `initCrons(cronConfig)` where `cronConfig` = the assembled `crons` object (same `{whitelist, blacklist, [camelName]: expression}` contract as the old file config). Platforms are NOT rebuilt by reload — boot-only.

- [ ] **Step 1: Refactor crons/index.js to take config as a parameter**

Remove line 17 (`const config = require("../config.js");`). Change the function signature and the two internal `config.crons` reads:

```js
const initCrons = (cronConfig = {}) => {
	const { blacklist = [], whitelist = [] } = cronConfig;
```

and

```js
		const expression = cronConfig[name] || definition.expression;
```

Also collect jobs so they can be stopped on reload — replace the buggy `crons.job = job;` lines (both occurrences) with nothing, and make the function return the array of `{ name, job }`:

In the `BlacklistedCrons` branch, `crons.push({ name, job });` already exists — keep it. In the main branch, change `crons.push(cron);` to `crons.push({ name, job });`.

- [ ] **Step 2: Fix jitter reads in hilichurl and mimo crons**

In both `crons/hilichurl/index.js` and `crons/mimo/index.js`: delete line 2 (`const config = require("../../config.js");`) and change line 9 from

```js
		const jitterSeconds = config.crons?.hilichurlJitter ?? 0;
```

to (`mimoJitter` in the mimo file):

```js
		const jitterSeconds = app.Config.get("crons")?.hilichurlJitter ?? 0;
```

- [ ] **Step 3: Implement core/reload.js**

```js
const { CronJob } = require("cron");

const { assemble } = require("./assembler.js");
const { runGuildCheckIn } = require("./guild-jobs.js");
const { hhmmToCron } = require("./time.js");
const defaults = require("../config/defaults.js");

let globalCrons = [];
let guildJobs = [];
let reloadTimer = null;

const stopAll = () => {
	for (const { job } of [...globalCrons, ...guildJobs]) {
		job.stop();
	}
	globalCrons = [];
	guildJobs = [];
};

const rebuildAccounts = async (config) => {
	for (const instance of app.HoyoLab.list) {
		instance.destroy();
	}
	app.HoyoLab.list.length = 0;

	let count = 0;
	for (const definition of config.accounts) {
		const instance = app.HoyoLab.create(definition.type, definition);
		if (!instance) {
			continue;
		}

		try {
			await instance.login();
			count += instance.accounts.length;
		}
		catch (e) {
			app.Logger.error("Reload", {
				message: `Login failed for ${definition.type}; dropping its accounts this cycle`,
				error: e.message ?? String(e)
			});
			const index = app.HoyoLab.list.indexOf(instance);
			if (index !== -1) {
				app.HoyoLab.list.splice(index, 1);
			}
		}
	}
	return count;
};

const scheduleGuildJobs = async () => {
	const guildIds = new Set([
		...(await app.db.listGuilds()).map(g => g._id),
		...(await app.db.listAllProfiles()).map(p => p.guildId)
	]);

	for (const guildId of guildIds) {
		const guild = await app.db.getGuild(guildId);
		const timezone = guild?.timezone ?? defaults.guild.timezone;
		const checkinTime = guild?.checkinTime ?? defaults.guild.checkinTime;

		const job = new CronJob(
			hhmmToCron(checkinTime),
			() => runGuildCheckIn(guildId).catch(e => app.Logger.error("GuildCheckIn", { guildId, error: e.message })),
			null,
			true,
			timezone
		);
		guildJobs.push({ name: `guild-checkin:${guildId}`, job });
	}
	return guildIds.size;
};

const reload = async () => {
	const config = await assemble(app.db);
	for (const warning of config.warnings) {
		app.Logger.warn("Reload", warning);
	}

	stopAll();
	const accountCount = await rebuildAccounts(config);

	const { initCrons } = require("../crons/index.js");
	globalCrons = initCrons(config.crons);
	const guildJobCount = await scheduleGuildJobs();

	app.Logger.info("Reload", `Reloaded: ${accountCount} account(s), ${guildJobCount} guild job(s)`);
	return { warnings: config.warnings, accountCount, guildJobCount };
};

const scheduleReload = (delayMs = 3000) => {
	clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		reload().catch(e => app.Logger.error("Reload", { message: "Deferred reload failed", error: e.message }));
	}, delayMs);
};

module.exports = { reload, scheduleReload };
```

- [ ] **Step 4: Verify nothing else requires config.js from crons, run tests**

Run: `grep -rn "require(.*config\.js" crons/ && npm test`
Expected: no `../config.js` / `../../config.js` matches remain in `crons/`; tests PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint core/reload.js crons/
git add core/reload.js crons/index.js crons/hilichurl/index.js crons/mimo/index.js
git commit -m "feat(core): add live reload with per-guild check-in scheduling"
```

---

### Task 12: /link command (add, list, remove, refresh) + service

**Files:**
- Create: `commands/link/service.js`
- Create: `commands/link/index.js`
- Test: `commands/link/__tests__/service.test.js`

**Interfaces:**
- Consumes: `parseCookie`, `detectGames`, `Database.upsertProfile/getProfile/removeProfile`, `scheduleReload`.
- Produces: service — `buildGames(detected, includeTot)` → games array with `settings: {}`; `mergeGames(oldGames, newGames)` → preserves `settings`+`active` for matching keys; `linkProfile({ db, guildId, label, discordUserId, cookie, includeTot, detect? })` → `{ profile, detected }` (throws user-friendly `Error` on bad cookie / zero games). Command: `/link add|list|remove|refresh` with `buildSlashData`, admin-gated, ephemeral replies.

- [ ] **Step 1: Write failing service test**

Create `commands/link/__tests__/service.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("../../../db/index.js");
const { buildGames, mergeGames, linkProfile } = require("../service.js");

const COOKIE = "ltoken_v2=a; ltuid_v2=111; ltmid_v2=b";
const DETECTED = [
	{ key: "genshin", uid: "800", region: "os_asia", nickname: "T", level: 60 },
	{ key: "starrail", uid: "801", region: "prod_official_asia", nickname: "B", level: 70 }
];

test("buildGames maps detections and optionally appends tot", () => {
	const games = buildGames(DETECTED, true);
	assert.equal(games.length, 3);
	assert.deepEqual(games[0], { key: "genshin", uid: "800", region: "os_asia", nickname: "T", active: true, settings: {} });
	assert.equal(games[2].key, "termis");
	assert.equal(games[2].uid, null);
});

test("mergeGames preserves settings and active for matching keys", () => {
	const oldGames = [{ key: "genshin", uid: "800", active: false, settings: { stamina: { check: true } } }];
	const merged = mergeGames(oldGames, buildGames(DETECTED, false));
	const genshin = merged.find(g => g.key === "genshin");
	assert.equal(genshin.active, false);
	assert.equal(genshin.settings.stamina.check, true);
	assert.equal(merged.find(g => g.key === "starrail").active, true);
});

test("linkProfile validates, detects, and upserts; relink preserves settings", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hoyolink-"));
	const db = new Database(dir);
	await db.init();

	const { profile } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: "u1",
		cookie: COOKIE,
		includeTot: false,
		detect: async () => DETECTED
	});
	assert.equal(profile.ltuid, "111");
	assert.equal(profile.games.length, 2);
	assert.equal(profile.tokenStatus, "active");

	await db.updateGameEntry(profile._id, "genshin", { settings: { stamina: { check: true } } });
	const { profile: relinked } = await linkProfile({
		db,
		guildId: "g1",
		label: "main",
		discordUserId: "u1",
		cookie: COOKIE,
		includeTot: false,
		detect: async () => DETECTED
	});
	assert.equal(relinked.games.find(g => g.key === "genshin").settings.stamina.check, true);

	await assert.rejects(() => linkProfile({
		db, guildId: "g1", label: "x", discordUserId: "u1", cookie: "garbage", includeTot: false, detect: async () => DETECTED
	}), /ltoken_v2/);

	await assert.rejects(() => linkProfile({
		db, guildId: "g1", label: "x", discordUserId: "u1", cookie: COOKIE, includeTot: false, detect: async () => []
	}), /No games/i);

	fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../commands/link/service.js'`

- [ ] **Step 3: Implement commands/link/service.js**

```js
const { parseCookie } = require("../../core/cookie.js");
const { detectGames } = require("../../core/hoyolab-api.js");

const buildGames = (detected, includeTot) => {
	const games = detected.map(d => ({
		key: d.key,
		uid: d.uid,
		region: d.region,
		nickname: d.nickname,
		active: true,
		settings: {}
	}));

	if (includeTot) {
		games.push({ key: "termis", uid: null, region: null, nickname: null, active: true, settings: {} });
	}

	return games;
};

const mergeGames = (oldGames, newGames) => newGames.map(game => {
	const previous = (oldGames ?? []).find(g => g.key === game.key);
	return previous
		? { ...game, active: previous.active, settings: previous.settings ?? {} }
		: game;
});

const linkProfile = async ({ db, guildId, label, discordUserId, cookie, includeTot, detect = detectGames }) => {
	const parsed = parseCookie(cookie);
	const detected = await detect(parsed.cookie, parsed.ltuid);

	const games = buildGames(detected, includeTot);
	if (games.length === 0) {
		throw new Error("No games found for this HoYoLAB account. Nothing to link.");
	}

	const existing = await db.getProfile(guildId, label);
	const profile = await db.upsertProfile({
		guildId,
		label,
		cookie: parsed.cookie,
		ltuid: parsed.ltuid,
		tokenStatus: "active",
		discordUserId,
		games: existing ? mergeGames(existing.games, games) : games
	});

	return { profile, detected };
};

module.exports = { buildGames, mergeGames, linkProfile };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Implement commands/link/index.js**

The definition uses `buildSlashData` (subcommands aren't expressible via the legacy `params` array) and reads options from `context.interaction` directly. `/link edit` is a stub replying "coming soon" until Task 13 wires the editor.

```js
const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { linkProfile } = require("./service.js");
const { GAMES } = require("../../config/games.js");

const summarize = (profile) => profile.games
	.map(g => `${g.active ? "🟢" : "⚪"} **${GAMES[g.key].name}**${g.uid ? ` — \`${g.uid}\` ${g.nickname ?? ""}` : ""}`)
	.join("\n");

module.exports = {
	name: "link",
	description: "Manage HoYoLAB profiles for this server.",
	params: [],
	buildSlashData: () => new SlashCommandBuilder()
		.setName("link")
		.setDescription("Manage HoYoLAB profiles for this server.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false)
		.addSubcommand(sub => sub
			.setName("add")
			.setDescription("Link a HoYoLAB account by cookie; games are auto-detected.")
			.addStringOption(opt => opt.setName("cookie").setDescription("Your HoYoLAB cookie string").setRequired(true))
			.addStringOption(opt => opt.setName("label").setDescription("Profile name (defaults to your username)"))
			.addBooleanOption(opt => opt.setName("tot").setDescription("Also enable Tears of Themis (not auto-detectable)")))
		.addSubcommand(sub => sub
			.setName("list")
			.setDescription("List this server's profiles."))
		.addSubcommand(sub => sub
			.setName("edit")
			.setDescription("Edit a profile's per-game settings.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true)))
		.addSubcommand(sub => sub
			.setName("remove")
			.setDescription("Remove a profile from this server.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true)))
		.addSubcommand(sub => sub
			.setName("refresh")
			.setDescription("Replace a profile's cookie.")
			.addStringOption(opt => opt.setName("label").setDescription("Profile name").setRequired(true))
			.addStringOption(opt => opt.setName("cookie").setDescription("The new cookie string").setRequired(true))),
	run: (async function link (context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!await requireGuildAdmin(interaction)) {
			return;
		}

		const guildId = interaction.guildId;
		const sub = interaction.options.getSubcommand();

		if (sub === "add" || sub === "refresh") {
			await interaction.deferReply({ ephemeral: true });

			const label = sub === "add"
				? (interaction.options.getString("label") ?? interaction.user.username)
				: interaction.options.getString("label");

			if (sub === "refresh" && !await app.db.getProfile(guildId, label)) {
				return await interaction.editReply({ content: `No profile named **${label}** in this server.` });
			}

			try {
				const { profile } = await linkProfile({
					db: app.db,
					guildId,
					label,
					discordUserId: interaction.user.id,
					cookie: interaction.options.getString("cookie"),
					includeTot: interaction.options.getBoolean("tot") ?? false
				});
				scheduleReload();
				return await interaction.editReply({
					embeds: [{
						color: 0x2ECC71,
						title: sub === "add" ? `Linked profile: ${profile.label}` : `Refreshed profile: ${profile.label}`,
						description: summarize(profile),
						footer: { text: "Settings are editable via /link edit" }
					}]
				});
			}
			catch (e) {
				return await interaction.editReply({ content: `❌ ${e.message}` });
			}
		}

		if (sub === "list") {
			const profiles = await app.db.listProfiles(guildId);
			if (profiles.length === 0) {
				return await interaction.reply({ content: "No profiles linked in this server yet. Use `/link add`.", ephemeral: true });
			}

			return await interaction.reply({
				ephemeral: true,
				embeds: [{
					color: 0x3498DB,
					title: `Profiles in this server (${profiles.length})`,
					fields: profiles.map(p => ({
						name: `${p.tokenStatus === "expired" ? "🔴" : "🟢"} ${p.label}`,
						value: summarize(p) || "(no games)"
					}))
				}]
			});
		}

		if (sub === "remove") {
			const label = interaction.options.getString("label");
			const removed = await app.db.removeProfile(guildId, label);
			if (removed === 0) {
				return await interaction.reply({ content: `No profile named **${label}** in this server.`, ephemeral: true });
			}
			scheduleReload();
			return await interaction.reply({ content: `Removed profile **${label}**.`, ephemeral: true });
		}

		if (sub === "edit") {
			const { openEditor } = require("./editor.js");
			return await openEditor(interaction);
		}
	})
};
```

Until Task 13 creates `editor.js`, create a placeholder `commands/link/editor.js`:

```js
const openEditor = async (interaction) => {
	await interaction.reply({ content: "Editor coming soon.", ephemeral: true });
};

module.exports = { openEditor };
```

- [ ] **Step 6: Run tests, lint, commit**

Run: `npm test` — Expected: PASS

```bash
npx eslint commands/link/
git add commands/link/
git commit -m "feat(commands): add /link add, list, remove, refresh"
```

---

### Task 13: /config command

**Files:**
- Create: `commands/config/index.js`

**Interfaces:**
- Consumes: `app.db.getGuild/setGuildField`, `requireGuildAdmin`, time utils, `scheduleReload`, `defaults.guild`.
- Produces: `/config schedule [time]`, `/config channel type:<checkin|redeem> [channel]`, `/config timezone [tz]` — blank arg shows current (times rendered as `<t:unix:t>` Discord timestamps), set writes + `scheduleReload()`.

- [ ] **Step 1: Implement commands/config/index.js**

```js
const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { isValidHhmm, isValidTimezone, nextOccurrenceUnix } = require("../../core/time.js");
const defaults = require("../../config/defaults.js");

module.exports = {
	name: "config",
	description: "Configure this server's schedules and channels.",
	params: [],
	buildSlashData: () => new SlashCommandBuilder()
		.setName("config")
		.setDescription("Configure this server's schedules and channels.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false)
		.addSubcommand(sub => sub
			.setName("schedule")
			.setDescription("Show or set the daily check-in time for this server.")
			.addStringOption(opt => opt.setName("time").setDescription("HH:MM in this server's timezone (e.g. 00:30)")))
		.addSubcommand(sub => sub
			.setName("channel")
			.setDescription("Show or set a notification channel.")
			.addStringOption(opt => opt.setName("type").setDescription("Which notifications").setRequired(true)
				.addChoices({ name: "check-in", value: "checkin" }, { name: "redeem", value: "redeem" }))
			.addChannelOption(opt => opt.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText)))
		.addSubcommand(sub => sub
			.setName("timezone")
			.setDescription("Show or set this server's IANA timezone.")
			.addStringOption(opt => opt.setName("tz").setDescription("e.g. Asia/Manila"))),
	run: (async function config (context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!await requireGuildAdmin(interaction)) {
			return;
		}

		const guildId = interaction.guildId;
		const sub = interaction.options.getSubcommand();
		const guild = await app.db.getGuild(guildId);
		const timezone = guild?.timezone ?? defaults.guild.timezone;
		const reply = (content) => interaction.reply({ content, ephemeral: true });

		if (sub === "schedule") {
			const time = interaction.options.getString("time");
			if (!time) {
				const current = guild?.checkinTime ?? defaults.guild.checkinTime;
				const unix = nextOccurrenceUnix(current, timezone);
				return await reply(`Daily check-in runs at **${current}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
			}
			if (!isValidHhmm(time)) {
				return await reply("Couldn't parse that time. Use 24-hour `HH:MM`, e.g. `00:30`.");
			}
			await app.db.setGuildField(guildId, "checkinTime", time);
			scheduleReload();
			const unix = nextOccurrenceUnix(time, timezone);
			return await reply(`Daily check-in will now run at **${time}** (${timezone}) — next run <t:${unix}:t> (<t:${unix}:R>).`);
		}

		if (sub === "channel") {
			const type = interaction.options.getString("type");
			const channel = interaction.options.getChannel("channel");
			const field = `${type}ChannelId`;
			if (!channel) {
				const current = guild?.[field];
				return await reply(current ? `**${type}** notifications go to <#${current}>.` : `No **${type}** channel configured yet.`);
			}
			await app.db.setGuildField(guildId, field, channel.id);
			return await reply(`**${type}** notifications will go to <#${channel.id}>.`);
		}

		if (sub === "timezone") {
			const tz = interaction.options.getString("tz");
			if (!tz) {
				return await reply(`This server's timezone is **${timezone}**.`);
			}
			if (!isValidTimezone(tz)) {
				return await reply(`\`${tz}\` is not a valid IANA timezone. Try e.g. \`Asia/Manila\`.`);
			}
			await app.db.setGuildField(guildId, "timezone", tz);
			scheduleReload();
			return await reply(`Timezone set to **${tz}**. Schedules now fire in this timezone.`);
		}
	})
};
```

- [ ] **Step 2: Run tests, lint, commit**

Run: `npm test` — Expected: PASS (existing suites; command file has no unit test)

```bash
npx eslint commands/config/ && git add commands/config/
git commit -m "feat(commands): add /config schedule, channel, timezone"
```

---

### Task 14: /link edit interactive editor + component router

**Files:**
- Create: `commands/link/editor.js` (replace placeholder)
- Modify: `platforms/discord.js` (route component/modal interactions)
- Test: `commands/link/__tests__/editor.test.js`

**Interfaces:**
- Consumes: `app.db.getProfile/updateGameEntry/listProfiles`, `scheduleReload`, `GAMES`, `defaults`.
- Produces: `openEditor(interaction)` (from `/link edit`), `handleComponent(interaction)` (router target for customIds starting `hle:`), pure helpers `buildGamePanel(profile, gameKey)` → `{ embeds, components }` and `TOGGLES` map (exported for tests). CustomId grammar: `hle:<action>:<profileId>:<gameKey>[:<field>]` with actions `game|toggle|values|modal`.

- [ ] **Step 1: Write failing test for the pure panel builder**

Create `commands/link/__tests__/editor.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildGamePanel, TOGGLES } = require("../editor.js");

const profile = {
	_id: "p1",
	label: "main",
	games: [{ key: "genshin", uid: "800", nickname: "T", active: true, settings: { stamina: { check: true } } }]
};

test("genshin panel renders its toggles with merged state", () => {
	const panel = buildGamePanel(profile, "genshin");
	assert.ok(panel.embeds[0].title.includes("Genshin Impact"));

	const buttons = panel.components.flatMap(row => row.components);
	const staminaButton = buttons.find(b => b.data.custom_id === "hle:toggle:p1:genshin:stamina.check");
	assert.ok(staminaButton);
	assert.equal(staminaButton.data.style, 3);

	const dailies = buttons.find(b => b.data.custom_id === "hle:toggle:p1:genshin:dailiesCheck");
	assert.equal(dailies.data.style, 2);
});

test("toggle catalog only offers fields the game supports", () => {
	assert.ok(TOGGLES.genshin.some(t => t.path === "realm.check"));
	assert.ok(!TOGGLES.starrail.some(t => t.path === "realm.check"));
	assert.ok(TOGGLES.starrail.some(t => t.path === "mimo.check"));
	assert.deepEqual(TOGGLES.honkai.map(t => t.path), ["active"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `buildGamePanel is not a function` (placeholder exports only `openEditor`)

- [ ] **Step 3: Implement commands/link/editor.js**

```js
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

const setPath = (dotted, value) => dotted
	.split(".")
	.reverse()
	.reduce((acc, key) => ({ [key]: acc }), value);

const effectiveState = (gameEntry, path) => {
	if (path === "active") {
		return Boolean(gameEntry.active);
	}
	const merged = defaults.mergeSettings(defaults.gameSettings[gameEntry.key] ?? {}, gameEntry.settings ?? {});
	return Boolean(getPath(merged, path));
};

const buildGamePanel = (profile, gameKey) => {
	const gameEntry = profile.games.find(g => g.key === gameKey);
	const rows = [];

	const toggles = TOGGLES[gameKey] ?? [];
	for (let i = 0; i < toggles.length; i += 5) {
		rows.push(new ActionRowBuilder().addComponents(
			toggles.slice(i, i + 5).map(toggle => new ButtonBuilder()
				.setCustomId(`hle:toggle:${profile._id}:${gameKey}:${toggle.path}`)
				.setLabel(toggle.label)
				.setStyle(effectiveState(gameEntry, toggle.path) ? ButtonStyle.Success : ButtonStyle.Secondary))
		));
	}

	const hasThreshold = ["genshin", "starrail", "zenless"].includes(gameKey);
	if (hasThreshold) {
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`hle:values:${profile._id}:${gameKey}`)
				.setLabel("Edit values…")
				.setStyle(ButtonStyle.Primary)
		));
	}

	const merged = defaults.mergeSettings(defaults.gameSettings[gameKey] ?? {}, gameEntry.settings ?? {});
	return {
		embeds: [{
			color: 0x9B59B6,
			title: `${GAMES[gameKey].name} — ${profile.label}`,
			description: [
				gameEntry.uid ? `UID \`${gameEntry.uid}\` ${gameEntry.nickname ?? ""}` : "No in-game UID (check-in only)",
				hasThreshold ? `Stamina threshold: **${merged.stamina.threshold}**` : null,
				"Green = enabled. Click a button to toggle."
			].filter(Boolean).join("\n")
		}],
		components: rows
	};
};

const buildGameSelect = (profile) => ({
	embeds: [{
		color: 0x9B59B6,
		title: `Edit profile: ${profile.label}`,
		description: "Pick a game to configure."
	}],
	components: [new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`hle:game:${profile._id}:-`)
			.setPlaceholder("Select a game")
			.addOptions(profile.games.map(g => ({
				label: GAMES[g.key].name,
				value: g.key,
				description: g.uid ? `UID ${g.uid}` : undefined
			})))
	)]
});

const getProfileById = async (profileId) => await app.db.collections.profiles.findOneAsync({ _id: profileId });

const openEditor = async (interaction) => {
	const label = interaction.options.getString("label");
	const profile = await app.db.getProfile(interaction.guildId, label);
	if (!profile) {
		return await interaction.reply({ content: `No profile named **${label}** in this server.`, ephemeral: true });
	}
	return await interaction.reply({ ...buildGameSelect(profile), ephemeral: true });
};

const handleComponent = async (interaction) => {
	const [, action, profileId, gameKey, field] = interaction.customId.split(":");
	const profile = await getProfileById(profileId);
	if (!profile || profile.guildId !== interaction.guildId) {
		return await interaction.reply({ content: "This editor session is no longer valid.", ephemeral: true });
	}

	if (action === "game") {
		const selected = interaction.values[0];
		return await interaction.update(buildGamePanel(profile, selected));
	}

	if (action === "toggle") {
		const gameEntry = profile.games.find(g => g.key === gameKey);
		const next = !effectiveState(gameEntry, field);
		const patch = field === "active" ? { active: next } : { settings: setPath(field, next) };
		await app.db.updateGameEntry(profileId, gameKey, patch);
		scheduleReload();
		return await interaction.update(buildGamePanel(await getProfileById(profileId), gameKey));
	}

	if (action === "values") {
		const gameEntry = profile.games.find(g => g.key === gameKey);
		const merged = defaults.mergeSettings(defaults.gameSettings[gameKey] ?? {}, gameEntry.settings ?? {});
		const modal = new ModalBuilder()
			.setCustomId(`hle:modal:${profileId}:${gameKey}`)
			.setTitle(`${GAMES[gameKey].name} values`)
			.addComponents(new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("staminaThreshold")
					.setLabel("Stamina alert threshold")
					.setStyle(TextInputStyle.Short)
					.setValue(String(merged.stamina.threshold))
					.setRequired(true)
			));
		return await interaction.showModal(modal);
	}

	if (action === "modal") {
		const raw = interaction.fields.getTextInputValue("staminaThreshold");
		const threshold = Number(raw);
		if (!Number.isInteger(threshold) || threshold < 0) {
			return await interaction.reply({ content: `\`${raw}\` is not a valid number.`, ephemeral: true });
		}
		await app.db.updateGameEntry(profileId, gameKey, { settings: { stamina: { threshold } } });
		scheduleReload();
		return await interaction.reply({ content: `Stamina threshold set to **${threshold}**.`, ephemeral: true });
	}
};

module.exports = { openEditor, handleComponent, buildGamePanel, buildGameSelect, TOGGLES };
```

- [ ] **Step 4: Route components/modals in platforms/discord.js**

In `initListeners()`, the `interactionCreate` handler currently begins:

```js
		client.on("interactionCreate", async (interaction) => {
			if (!interaction.isChatInputCommand()) {
				return;
			}
```

Change the guard to route editor interactions first:

```js
		client.on("interactionCreate", async (interaction) => {
			const isComponent = interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit();
			if (isComponent && interaction.customId?.startsWith("hle:")) {
				const { handleComponent } = require("../commands/link/editor.js");
				try {
					await handleComponent(interaction);
				}
				catch (e) {
					app.Logger.error("Discord", { message: "Editor interaction failed", error: e.message });
				}
				return;
			}

			if (!interaction.isChatInputCommand()) {
				return;
			}
```

- [ ] **Step 5: Run tests, lint, commit**

Run: `npm test` — Expected: PASS

```bash
npx eslint commands/link/editor.js platforms/discord.js commands/link/__tests__/editor.test.js
git add commands/link/editor.js platforms/discord.js commands/link/__tests__/editor.test.js
git commit -m "feat(commands): add interactive /link edit settings editor"
```

---

### Task 15: /migrate command

**Files:**
- Create: `commands/migrate/index.js`

**Interfaces:**
- Consumes: `linkProfile`/`mergeGames` (commands/link/service.js), `parseCookie`, `app.db`, `scheduleReload`, `GAMES`.
- Produces: `/migrate file:<attachment>` — parses a JSON5 config, groups its `accounts[].data[]` by cookie ltuid into one profile per HoYoLAB login, auto-detects games, carries over per-game settings from the file, reports per-profile outcome.

- [ ] **Step 1: Implement commands/migrate/index.js**

Settings carried from a file account entry are exactly the engine's per-game knobs; the entry's game type maps them onto the detected game of that key.

```js
const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const JSON5 = require("json5");

const { requireGuildAdmin } = require("../../core/admin.js");
const { scheduleReload } = require("../../core/reload.js");
const { parseCookie } = require("../../core/cookie.js");
const { linkProfile } = require("../link/service.js");
const { GAMES } = require("../../config/games.js");

const SETTING_KEYS = ["redeemCode", "dailiesCheck", "weekliesCheck", "realm", "stamina", "expedition", "mimo", "hilichurl", "shopStatus"];

const pickSettings = (entry) => Object.fromEntries(
	SETTING_KEYS.filter(key => entry[key] !== undefined).map(key => [key, entry[key]])
);

module.exports = {
	name: "migrate",
	description: "Import profiles from a legacy config.json5 file.",
	params: [],
	buildSlashData: () => new SlashCommandBuilder()
		.setName("migrate")
		.setDescription("Import profiles from a legacy config.json5 file.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.setDMPermission(false)
		.addAttachmentOption(opt => opt.setName("file").setDescription("Your config.json5").setRequired(true)),
	run: (async function migrate (context) {
		const { interaction } = context;
		if (!interaction) {
			return { success: false, reply: "This command is only available as a slash command." };
		}
		if (!await requireGuildAdmin(interaction)) {
			return;
		}

		await interaction.deferReply({ ephemeral: true });

		const attachment = interaction.options.getAttachment("file");
		let config;
		try {
			const res = await app.Got("API", { url: attachment.url, responseType: "text" });
			config = JSON5.parse(res.body);
		}
		catch (e) {
			return await interaction.editReply({ content: `❌ Could not parse that file as JSON5: ${e.message}` });
		}

		const byLtuid = new Map();
		for (const group of config.accounts ?? []) {
			if (!GAMES[group.type === "nap" ? "zenless" : group.type === "tot" ? "termis" : group.type]) {
				continue;
			}
			const key = group.type === "nap" ? "zenless" : group.type === "tot" ? "termis" : group.type;
			for (const entry of group.data ?? []) {
				if (!entry.cookie) {
					continue;
				}
				let parsed;
				try {
					parsed = parseCookie(entry.cookie);
				}
				catch {
					continue;
				}
				const bucket = byLtuid.get(parsed.ltuid) ?? { cookie: entry.cookie, discordUserId: entry.discord?.userId ?? null, settings: {}, hasTot: false };
				bucket.settings[key] = pickSettings(entry);
				if (key === "termis") {
					bucket.hasTot = true;
				}
				byLtuid.set(parsed.ltuid, bucket);
			}
		}

		if (byLtuid.size === 0) {
			return await interaction.editReply({ content: "No usable accounts found in that file." });
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
					cookie: bucket.cookie,
					includeTot: bucket.hasTot
				});
				for (const game of profile.games) {
					const settings = bucket.settings[game.key];
					if (settings && Object.keys(settings).length > 0) {
						await app.db.updateGameEntry(profile._id, game.key, { settings });
					}
				}
				lines.push(`✅ **${label}** — ${profile.games.map(g => GAMES[g.key].short).join(", ")}`);
			}
			catch (e) {
				lines.push(`❌ **${label}** — ${e.message}`);
			}
		}

		scheduleReload();
		return await interaction.editReply({
			embeds: [{
				color: 0x2ECC71,
				title: `Migration finished (${index} login${index === 1 ? "" : "s"})`,
				description: lines.join("\n").slice(0, 4000),
				footer: { text: "Rename with /link remove + /link add, tweak with /link edit" }
			}]
		});
	})
};
```

- [ ] **Step 2: Run tests, lint, commit**

Run: `npm test` — Expected: PASS

```bash
npx eslint commands/migrate/ && git add commands/migrate/
git commit -m "feat(commands): add /migrate for legacy config.json5 import"
```

---

### Task 16: Bootstrap flip + retire file config

**Files:**
- Rewrite: `index.js`
- Modify: `crons/code-redeem/index.js` (record + guild notify)
- Create: `.env.example`
- Modify: `docker-compose.yml`, `package.json` (scripts), `.gitignore` (ensure `.env`), `README.md` (setup section)
- Delete: `config.js`, `default.config.json5`, `convert.js`, `setup/` (directory)

**Interfaces:**
- Consumes: everything above.
- Produces: a boot path with **no config file**: dotenv → `Database.init()` → `app.db` → assemble → engine boot → Discord connect → `reload()`. Bot stays alive with zero profiles (exits only when `DISCORD_TOKEN` is missing).

- [ ] **Step 1: Rewrite index.js**

```js
require("dotenv").config();

const Command = require("./classes/command.js");
const Config = require("./classes/config.js");
const Got = require("./classes/got.js");

const Cache = require("./singleton/cache.js");
const Logger = require("./singleton/logger.js");
const Utils = require("./singleton/utils.js");
const TestNotification = require("./singleton/test-notification.js");

const HoyoLab = require("./hoyolab-modules/template.js");
const Platform = require("./platforms/template.js");

const Date = require("./object/date.js");
const Error = require("./object/error.js");
const RegionalTaskManager = require("./object/regional-task-manager.js");

const Database = require("./db/index.js");
const { assemble } = require("./core/assembler.js");

(async () => {
	const start = process.hrtime.bigint();

	const db = new Database();
	await db.init();

	let config;
	try {
		config = await assemble(db);
	}
	catch (e) {
		console.error(e.message);
		process.exit(1);
	}

	globalThis.app = {
		Date,
		Error,
		RegionalTaskManager,

		Config,
		Command,

		db,
		Got: await Got.initialize(),
		Cache: new Cache(),
		Logger: new Logger(config.loglevel),
		Utils: new Utils(),
		TestNotification
	};

	Config.load(config);

	const { loadCommands } = require("./commands/index.js");
	const commands = await loadCommands();
	await Command.importData(commands.definitions);

	const definitions = require("./gots/index.js");
	await app.Got.importData(definitions);

	globalThis.app = {
		...app,
		Platform,
		HoyoLab
	};

	const platforms = config.platforms.map(definition => Platform.create(definition.type, definition));
	await Promise.all(platforms.map(platform => platform.connect()));

	const { reload } = require("./core/reload.js");
	const result = await reload();
	if (result.accountCount === 0) {
		app.Logger.warn("Client", "No profiles linked yet — use /link add in your server to get started");
	}

	const end = process.hrtime.bigint();
	app.Logger.info("Client", `Initialize completed (${Number(end - start) / 1e6}ms)`);

	process.on("unhandledRejection", (reason) => {
		if (!(reason instanceof Error)) {
			return;
		}

		app.Logger.log("Client", {
			message: "Unhandled promise rejection",
			args: { reason }
		});
	});
})();
```

Gotcha: `Config.load(config)` must run before `Got.importData` (the `Global` got definition reads `app.Config.get("retry")`) — the order above preserves that. `reload()` must run after platform connect so slash registration sees command data and notify can resolve the client; slash commands are registered inside `connect()`, which needs `Command.importData` done first — also preserved.

- [ ] **Step 2: Add result logging + guild notify to code-redeem cron**

In `crons/code-redeem/index.js`, extend the `success` and `failed` loops. After the existing webhook/telegram sends in the `success` loop, add:

```js
			const gameKey = data.account.platform === "nap" ? "zenless" : data.account.platform === "tot" ? "termis" : data.account.platform;
			const profiles = await app.db.findProfilesByGameUid(gameKey, data.account.uid);
			for (const profile of profiles) {
				await app.db.recordRedeem({
					profileId: profile._id,
					guildId: profile.guildId,
					game: gameKey,
					code: data.code.code ?? String(data.code),
					source: "auto",
					status: "ok",
					message: ""
				});
				await require("../../core/notify.js").sendToGuildChannel(profile.guildId, "redeem", { embeds: [message.embed] });
			}
```

Mirror the same block at the end of the `failed` loop with `status: "error"` and `message: data.reason ?? ""`.

Then extract the duplicated block into a local helper at the top of the `code` function (DRY):

```js
		const recordAndNotify = async (data, message, status) => {
			const gameKey = data.account.platform === "nap" ? "zenless" : data.account.platform === "tot" ? "termis" : data.account.platform;
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
				await require("../../core/notify.js").sendToGuildChannel(profile.guildId, "redeem", { embeds: [message.embed] });
			}
		};
```

and call `await recordAndNotify(data, message, "ok");` / `await recordAndNotify(data, message, "error");` in the respective loops. Verify the actual field carrying the code string by reading `crons/code-redeem/utils.js` `buildMessage` before finalizing (`data.code` may be an object with `.code`).

- [ ] **Step 3: Create .env.example, update docker-compose.yml, package.json, .gitignore**

`.env.example`:

```bash
DISCORD_TOKEN=your-bot-token
# Optional: only needed if the bot ID cannot be derived from the token
# DISCORD_BOT_ID=123456789012345678
```

`docker-compose.yml` — remove the `config.json5` bind mount; add `.env`:

```yaml
services:
  instance:
    image: ghcr.io/rairulyle/hoyolab-auto:latest
    restart: on-failure:5
    container_name: hoyolab-auto
    network_mode: bridge
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      TZ: UTC
```

`package.json` scripts — delete `migrate`, `setup:windows`, `setup:linux`.

`.gitignore` — ensure `.env` is listed (add if absent); `data/` should already be ignored — verify `data/db/` is covered.

- [ ] **Step 4: Delete the legacy config surface**

```bash
git rm config.js default.config.json5 convert.js
git rm -r setup/
```

Then verify nothing references them:

Run: `grep -rn "config\.js5\|config\.json5\|require(.*config\.js\"\|convert\.js\|setup/config" --include="*.js" --include="*.json" --include="*.yml" . | grep -v node_modules | grep -v docs/`
Expected: no matches (README mentions get fixed next step).

- [ ] **Step 5: Update README setup section**

Replace the Installation/Migration/Usage instructions that reference `config.json5` with: copy `.env.example` → `.env`, set `DISCORD_TOKEN`, `npm install && npm start` (or docker compose), then in Discord: `/link add cookie:<...>`, `/config channel`, `/config timezone`, `/config schedule`, `/migrate file:<config.json5>` for existing users. Keep the cookie-acquisition guide links intact.

- [ ] **Step 6: Run everything, lint, commit**

Run: `npm test && npx eslint .`
Expected: tests PASS, no lint errors anywhere.

```bash
git add -A
git commit -m "feat!: boot from database instead of config.json5

BREAKING CHANGE: config.json5 is no longer read. Run /migrate with your old
config file, or /link add to link accounts. Discord token moves to .env."
```

---

### Task 17: Smoke test & verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + lint**

Run: `npm test && npx eslint .`
Expected: all tests pass, zero lint errors.

- [ ] **Step 2: Boot without a token**

Run: `env -u DISCORD_TOKEN node index.js`
Expected: exits with `DISCORD_TOKEN is not set. Add it to your .env file.` and exit code 1.

- [ ] **Step 3: Boot with a real token (manual, requires user's .env)**

Run: `node index.js`
Expected log lines: db init silent, `Loaded N configuration entries`-equivalent, `Syncing N application command(s)`, `No profiles linked yet — use /link add`, `Initialize completed`.

- [ ] **Step 4: In-Discord manual checklist (user assists)**

1. `/link add cookie:<real cookie>` → embed listing detected games.
2. `/link list` → shows the profile, green status.
3. `/link edit label:<label>` → select game → toggle Stamina Check → button turns green → `Edit values…` → set threshold → confirmation.
4. `/config timezone tz:Asia/Manila`, `/config channel type:check-in channel:#general`, `/config schedule time:<2 minutes from now>` → after the time passes, check-in embed arrives in #general and `/config schedule` shows next-run as a Discord timestamp.
5. `/link remove` → profile gone; reload logs show 0 accounts.
6. From a second guild (if available): `/link list` shows nothing — isolation confirmed.

- [ ] **Step 5: Use superpowers:finishing-a-development-branch**

Decide merge/PR per that skill. Update `CHANGELOG.md` if Part B has landed by then.
