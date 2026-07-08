# CLAUDE.md

Guidance for AI agents (Claude Code and others) working in this repository.
`AGENTS.md` is a symlink to this file.

## What this is

A fork of [torikushiii/hoyolab-auto](https://github.com/torikushiii/hoyolab-auto)
(Node.js) reworked into a **DB-backed, command-managed, multi-guild** HoYoLAB
automation bot. Accounts and per-server config live in an embedded database and
are managed entirely through Discord slash commands — the static `config.json5`
is gone. State lives in NeDB at `data/db/`; the entry point is `node index.js`.

**Read [`CONVENTIONS.md`](CONVENTIONS.md) before adding a command or a module** —
it documents the config-assembler architecture, the module layout, and the "one
file per leaf command" structure.

## Tech stack

| Concern         | Tool                                                            |
| :-------------- | :-------------------------------------------------------------- |
| Runtime         | Node.js ≥ 24 (pinned in `.nvmrc`, matches the Docker image)     |
| Modules         | CommonJS (`require`/`module.exports`)                           |
| Discord         | discord.js 14                                                   |
| Database        | `@seald-io/nedb` (embedded document store, one file/collection) |
| Lint            | ESLint 8 (`.eslintrc.json`)                                     |
| Format          | Prettier (`.prettierrc`)                                        |
| Git hooks       | husky + lint-staged + commitlint                                |
| Commit messages | Conventional Commits (commitlint `commit-msg` hook)             |
| Tests           | `node:test`                                                     |
| Releases        | `commit-and-tag-version` + the `/release` skill                 |

## Common commands

```bash
npm install                 # install deps (Node >= 24)
npm test                    # node:test — glob "**/__tests__/**/*.test.js"
npm run lint                # eslint .
npm run format              # prettier --write .
npm run format:check        # prettier --check .   (CI gate)
npm start                   # node index.js (needs .env with DISCORD_TOKEN)
docker compose up -d --build
```

## Testing policy — REQUIRED

**When you touch code, add or update a test for it in the same change.** If you
fix a bug, add a test that fails without the fix; if you change behavior, update
the affected tests.

- Tests live in a **`__tests__/` folder next to the source**, mirroring the
  source filename (`core/cookie.js` → `core/__tests__/cookie.test.js`). Full
  rules in [`CONVENTIONS.md`](CONVENTIONS.md).
- **Test pure units, not globals.** The DB repository (temp-dir NeDB) and pure
  helpers get real unit tests. Code bound to runtime globals (`app.db`,
  `app.HoyoLab`, `app.Platform`) or live HoYoLAB HTTP is verified by a boot/load
  smoke and a manual in-Discord check, not mocked.
- Run `npm test` and confirm it passes before claiming work is done. Pure
  behavior-preserving refactors don't need a new test — say so explicitly rather
  than skipping silently.

## Domain rules

- **Game keys vs engine names.** DB/profile keys: `genshin | starrail | zenless |
honkai | termis`. Engine internal names differ for two: `zenless`→`nap`,
  `termis`→`tot`. Map only via `config/games.js` (`GAMES[key].engineName` /
  `gameKeyFromEngineName()`).
- **Status vocabularies (fixed).** Check-in stored: `ok | already | error |
captcha`. Redeem stored: `ok | already | invalid | expired | error`. A dead
  cookie (auth failure at login) flips the profile's `tokenStatus` to `expired`
  (shown 🔴 in `/link list`, excluded from future assembles).
- **Multi-guild.** A profile belongs to the guild it was linked in. Per-guild:
  profiles, notification channels, timezone, and the **check-in** cron. Redeem is
  a single **server-wide** poll (shared code cache), not per-guild. Channels fall
  back to a `default` channel (`${kind}ChannelId ?? defaultChannelId`).
- **Scheduling is cron.** `/config schedule` takes a cron expression (per-guild
  check-in, run in the guild's `/config timezone`, default `UTC`). Container `TZ`
  is intentionally unused — timezone is per-server.
- **Tears of Themis isn't auto-detectable** (no game record card) — it's enabled
  via `/link edit`, never auto-added on `/link add`.

## Commits

- Messages MUST follow **Conventional Commits** (`feat:`, `fix:`, `chore:`,
  `refactor:`, `style:`, `test:`, `docs:`, `build:`, `ci:`, `perf:`). The
  `commit-msg` hook rejects anything else. Keep titles short; no ticket-ID
  prefix.
- **Do not** add `Co-Authored-By` trailers or any AI/Claude attribution — in
  commits, PRs, or issues.
- Feature work happens on `<type>/<description>` branches, never directly on
  `main`. Exception: the release flow's changelog/`bump:` commits go to `main`.
- `.env`, `data/`, and `logs/` are gitignored; tokens never appear in code,
  tests, fixtures, commits, or logs.

## Code style

- **Prettier owns formatting** (`.prettierrc`: tabs, `tabWidth 4`, double quotes,
  semicolons, `trailingComma: none`, `printWidth 100`, `arrowParens: always`).
  `lint-staged` runs Prettier + ESLint on staged files pre-commit; run
  `npm run format` on anything you touch. **ESLint owns correctness** — fix
  findings including warnings, don't disable them.
- Prefer arrow functions and functional array/object methods over `for` loops
  where it reads cleanly and matches surrounding code.
- No code comments unless a non-obvious gotcha genuinely requires one.

## Environment & Docker

- `.env`: `DISCORD_TOKEN` (required), optional `DISCORD_BOT_ID` (else derived from
  the token). **No DB path** — the DB is always `data/db/`.
- Docker (`node:24-alpine`): the entrypoint applies `PUID`/`PGID` (LinuxServer
  style) and drops privileges via `su-exec`, chowning `data`/`logs`. The DB
  persists in the `./data:/app/data` bind mount — that one volume is the whole
  bot's state.

## Releases

Use the `/release` skill (`commit-and-tag-version` → push `main` → wait for CI
green → tag `vX.Y.Z` → GHCR image → GitHub release). `/release-dev` publishes a
`dev`-tagged image after CI, with no bump/changelog/tag/release. Keep in sync:
`package.json` version = top `CHANGELOG.md` entry = git tag = `version` file.

## Superpowers

Design specs and implementation plans live in `docs/superpowers/{specs,plans}/`.
Brainstorm → spec → plan → subagent-driven execution, per the superpowers skills.
