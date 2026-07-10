# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [SemVer](https://semver.org/).

Entries are written **one line per paragraph and bullet** (no hard-wrapping) so that a section pasted into GitHub release notes reflows to full width instead of breaking at the source wrap points.

## [Unreleased]

## [1.4.1] - 2026-07-10

### Changed

- `/checkin` reverted to one embed per account (the detailed per-account card with reward thumbnail), undoing the per-game grouping introduced in 1.4.0; the `/redeem` embeds from 1.4.0 are kept.

### Fixed

- `/link edit` with a `mention` now replies with a confirmation that the ping target was set, instead of opening the editor panel.

## [1.4.0] - 2026-07-10

### Changed

- `/redeem` bulk mode now replies with one embed per game (🟢/🔴/⚪ row per account, codes-checked footer) instead of plain text, and the single-code path replies with a code embed.
- `/checkin` now replies with one embed per game listing each account as a row; failures appear as 🔴 rows in their game's embed instead of a separate error embed.

## [1.3.0] - 2026-07-10

### Added

- `/link add` takes an optional `mention` (Discord user picker) to choose who gets @mentioned in a profile's notifications; when omitted, no one is pinged. The `label` is now required and should be unique — it identifies the profile for `/link edit`, `/link remove`, and `/link refresh`.
- `/link edit` takes an optional `mention` to set the ping target, and its editor panel has a **Remove mention** button to clear it.

### Changed

- `/link add` refuses to overwrite a label already linked to a different account, preventing accidental profile replacement; re-adding the same account still updates it.
- Notifications @mention the recipient only once, in the message content, instead of repeating the mention on every embed row.
- `/link edit` wording uses "label" throughout — the panel title is the label, and the rename control is "Rename label".
- `/link list` shows "no ping set" for a profile with no mention target.

### Fixed

- `/link refresh` no longer resets a profile's notification mention to whoever ran the refresh — it preserves the existing target.

## [1.2.0] - 2026-07-09

### Changed

- `/link list` shows each profile as `label · @owner` with its games beneath, dropping the separate "Linked by" line; the owner mention now renders inline.

### Added

- `/link list` shows a footer legend (`🔴 = cookie expired — re-link with /link refresh`) whenever a profile's cookie is expired.

## [1.1.0] - 2026-07-09

### Added

- `/checkin` now posts its results publicly in the channel instead of only to the person who ran it.
- `/link list` shows which Discord user linked each profile (`Linked by @user`).
- `/link edit` can rename a profile's label via a "Rename profile…" button, rejecting a name already used in the server.
- `/redeem` with no code bulk-redeems every available code for each eligible account: it skips codes already redeemed for that account, stops an account's run when its cookie is invalid/expired (marking the profile 🔴 expired), and — when you pick an account — scopes the run to just that account.

### Changed

- Notifications are now **grouped by subject** instead of one message per account: auto check-in sends one embed per game, reminders (stamina, dailies, weeklies, expeditions, realm currency, Howl's News Stand, shop status) one embed per game and type, and auto-redeem one embed per code. Each account is a compact row (owner mention + in-game name + its own values), so a cycle that used to fire four near-identical messages now fires one.
- Notification embeds drop labels that repeated on every row and show the in-game name instead of the raw UID; each embed follows a shared casing convention.

### Fixed

- Notification embeds no longer carry a redundant clock, and footers that only restated the bot or the title are gone (informative footers like `/link edit` hints are kept).

## [1.0.1] - 2026-07-08

### Fixed

- Slash commands with subcommands (all of `/link` and `/config`) crashed the bot with `TypeError: Cannot read properties of undefined (reading 'replace')` — subcommand interaction options carry no top-level value, so an `undefined` argument reached the command runner. Arguments are now sanitized (undefined dropped, values coerced to strings) before dispatch.

## [1.0.0] - 2026-07-08

Complete rework of the upstream [torikushiii/hoyolab-auto](https://github.com/torikushiii/hoyolab-auto) bot into a DB-backed, command-managed, multi-guild HoYoLAB automation bot. Accounts and per-server configuration now live in an embedded database and are managed entirely through Discord slash commands — the static `config.json5` is gone.

### Added

- **Database-backed state.** Embedded NeDB store at `data/db/` for profiles, per-guild settings, and check-in/redeem results.
- **Command-managed configuration** through Discord slash commands:
  - `/link add`, `/link list`, `/link remove`, `/link refresh` to manage HoYoLAB accounts, with profile-label autocomplete.
  - `/link edit`, an interactive settings editor (also how Tears of Themis is enabled, since it has no game record card to auto-detect).
  - `/config schedule`, `/config channel`, `/config timezone` for the per-guild check-in cron, notification channels, and timezone.
  - `/migrate` to import an existing `config.json5`.
- **Multi-guild support.** Profiles belong to the guild they were linked in; notification channels, timezone, and the check-in cron are per-guild, with a `default` channel fallback.
- **Cron-based scheduling.** Per-guild check-in runs on a cron expression in the guild's timezone (default UTC); redeem-code polling is a single server-wide poll with a shared code cache.
- **HoYoLAB game-record-card detection** to auto-add supported games on link.
- **Reminder and redeem notifications** routed through a shared Discord-bot helper (`notifyAccount` / `notifyGuildsForGame`), with default and reminder channel types.
- **Core building blocks:** cookie parsing (ltuid + redeem detection), timezone-aware time utilities, a config assembler that produces the legacy engine shape, live reload, and a game catalog.
- **Docker and runtime:** `node:24-alpine` image with LinuxServer-style `PUID`/`PGID` privilege drop, a `./data` bind mount holding all state, and a pinned `.nvmrc` (Node ≥ 24).
- **Release engineering:** Prettier + ESLint, husky + lint-staged + commitlint (Conventional Commits), a `node:test` suite, CI (lint/format/test/build), versioned GHCR image publishing on tag, and the `/release` + `/release-dev` skills.
- **Contributor docs:** `CLAUDE.md` / `AGENTS.md`, `CONVENTIONS.md`, and `COMMANDS.md`.

### Changed

- **Boot from the database instead of `config.json5`** (breaking change vs. upstream): the entry point assembles engine config from DB state at startup and live-reloads on command changes.

### Removed

- Static `config.json5` as the source of truth, superseded by the database and slash commands.
- The Discord **webhook** notification platform — notifications now go through the bot and Telegram only.

### Fixed

- Tolerate per-account login failures during check-in and mark dead cookies' `tokenStatus` as `expired` (🔴 in `/link list`, excluded from future runs).
- `HoyoLab.get` returns `null` on no match instead of throwing.
- Restore the significant-activity ping gate for the mimo and hilichurl crons.
- Escape Telegram text before delivery in redeem notifications, matching the reminder crons.
- Guard the husky `prepare` script so production installs (`npm install --omit=dev`, e.g. the Docker image build) succeed when husky is absent.
