# Conventions

How this codebase is organized. Read this before adding a command or a module.
Commit / test-policy / code-style rules live in [`CLAUDE.md`](CLAUDE.md); this
file is about **code structure**.

## Architecture: feed the engine, don't rewrite it

This is a fork of torikushiii/hoyolab-auto. Its **engine** — the crons,
`hoyolab-modules/<game>/`, `platforms/`, and the `HoyoLab`/`Platform` classes —
is reused as-is. We replaced only the _source_ of its configuration.

```
.env (DISCORD_TOKEN, optional DISCORD_BOT_ID)
config/defaults.js  (all fallback values — replaces default.config.json5)
NeDB  (data/db/ — profiles, guilds, checkin/redeem results)
        │
   core/assembler.js  ──►  legacy { accounts[], platforms[], crons{} }  ──►  engine
        ▲
   core/reload.js — one reload() shared by boot AND every mutating command
                    (live reload; no restart). Rebuilds HoyoLab.list, reschedules crons.
```

- The engine consumes a `config`-shaped object. `core/assembler.js` produces that
  shape from the DB + `.env` + `config/defaults.js`. **Don't change the engine to
  read the DB** — extend the assembler.
- Every mutating command calls `scheduleReload()`; the debounced `reload()` is
  the single bootstrap path.

## Module layout

```
config/     games.js (catalog + key↔engine lookups), defaults.js (fallbacks)
core/       assembler, reload, notify, guild-jobs, cookie, time, admin, hoyolab-api
db/         index.js — the ONLY module that touches NeDB (a hand-rolled repository)
commands/   slash commands (see per-leaf rules below)
crons/      the engine's scheduled jobs (notify via core/notify.js)
hoyolab-modules/  the game engine (torikushiii) — treat as vendored; don't restructure
platforms/  notification platform classes (discord bot, webhook, telegram)
index.js    boot: dotenv → db.init → assemble → connect Discord → reload()
```

- **`db/index.js` is the single NeDB consumer.** No other file opens a
  collection or runs a query. Everything goes through its repository methods.
- **Catalog and defaults are code, not migrations.** New games / default values
  are edited in `config/games.js` and `config/defaults.js`.

## Commands: one file per leaf command

A slash group is a folder `commands/<group>/`. **Every leaf subcommand gets its
own file**, and `index.js` holds only the definition + dispatch.

1. **File name == the subcommand's `name`.** `/link add` → `commands/link/add.js`;
   `/config schedule` → `commands/config/schedule.js`.
2. **Folder name == the group's `name`.** `/link` → `commands/link/`,
   `/config` → `commands/config/`.
3. **`index.js` holds only** the slash definition (via a `buildSlashData()`
   returning a `SlashCommandBuilder` with all subcommands), the admin gate, and a
   dispatcher. It gates once, then routes:

    ```js
    // commands/link/index.js
    const leaves = { add: require("./add.js").run, list: require("./list.js").run /* … */ };

    module.exports = {
    	name: "link",
    	buildSlashData: () =>
    		new SlashCommandBuilder()
    			.setName("link")
    			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    			.addSubcommand(/* add */)
    			.addSubcommand(/* list */) /* … */,
    	run: async (context) => {
    		const { interaction } = context;
    		if (!interaction || !(await requireGuildAdmin(interaction))) return;
    		const leaf = leaves[interaction.options.getSubcommand()];
    		return leaf && (await leaf(interaction));
    	}
    };
    ```

4. **Each leaf exports `run(interaction)`** and does one subcommand's work:

    ```js
    // commands/link/add.js
    const run = async (interaction) => {
    	/* … */
    };
    module.exports = { run };
    ```

5. **The command loader only reads `commands/<dir>/index.js`.** Leaf files
   (`add.js`, `schedule.js`) are plain modules required by `index.js` — they are
   **not** registered as separate top-level commands.
6. **Shared code is its own module, never duplicated.** Presentation/logic used
   by more than one leaf lives beside them (`commands/link/summarize.js`,
   `service.js`, `editor.js`) and is imported.
7. **Single-command groups stay flat.** A command with no subcommands is just
   `commands/<name>/index.js` (e.g. `commands/migrate/index.js`).
8. **Admin-gate + guild-scope every management command.**
   `setDefaultMemberPermissions(Administrator)` on the builder AND a runtime
   `requireGuildAdmin(interaction)` (in the dispatcher); scope to
   `interaction.guildId`; replies are ephemeral.
9. **Interactive components** (buttons/select menus/modals) use a `customId`
   prefix (`hle:` for the link editor) and are routed in `platforms/discord.js`'s
   `interactionCreate` handler, before the chat-input branch. Autocomplete is an
   `autocomplete(interaction)` method on the command definition, routed the same
   way.

## Tests: co-located `__tests__/`

- Tests live in a **`__tests__/` folder next to the source**, and the test file
  mirrors the source name: `core/cookie.js` → `core/__tests__/cookie.test.js`;
  `db/index.js` → `db/__tests__/index.test.js`. Never a top-level `tests/`.
- `node:test` + `node:assert/strict`. `npm test` runs
  `node --test "**/__tests__/**/*.test.js"` (the glob is required — a bare
  directory is treated as a single file on Node ≥ 22, and no-arg discovery
  greedily matches `test-*.js` source files).
- **Test the pure units, not the globals.** The DB repository (against a temp-dir
  NeDB), and pure helpers (`cookie`, `time`, `assembler`, `resolveChannelId`,
  `gameKeyFromEngineName`, the link `service`/`editor` builders) get real unit
  tests. Code that depends on runtime globals (`app.db`, `app.HoyoLab`,
  `app.Platform`) or live HoYoLAB HTTP is verified by the boot/load smoke and
  manual checks — not mocked into a fake `app`.

## Notifications: one shared helper

All bot delivery goes through `core/notify.js` — do not re-scatter platform
loops into crons.

- `sendToGuildChannel(guildId, kind, payload)` resolves the channel as
  `guild[`${kind}ChannelId`] ?? guild.defaultChannelId` and posts via the bot;
  it **never throws** (warn + skip on missing channel / disconnected client).
- `notifyAccount(account, { embeds, telegramText, ping, kind })` maps the
  account to its guild(s) via `findProfilesByGameUid` and posts to each; ping
  mentions ride in `content` (`<@id>`), never in embeds.
- `notifyGuildsForGame(gameKey, …)` handles game-level notifications with no
  account (e.g. manual redeem codes).

## Game keys vs engine names

Profiles/DB use the keys `genshin | starrail | zenless | honkai | termis`. The
engine's internal platform names differ for two: **`zenless`→`nap`**,
**`termis`→`tot`**. Reminder crons carry `account.platform` = the _engine_ name.
Convert with `GAMES[key].engineName` and `gameKeyFromEngineName()` in
`config/games.js` — never hard-code the mapping elsewhere.
