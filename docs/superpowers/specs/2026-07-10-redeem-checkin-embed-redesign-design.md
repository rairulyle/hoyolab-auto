# Redeem & check-in command embeds — align with the notify convention

**Date:** 2026-07-10
**Status:** Approved (Option A chosen for `/redeem` grouping)
**Mockups:** https://claude.ai/code/artifact/32443ff7-195f-4fcf-8aa5-29f7955bee98

## Problem

The bulk path of `/redeem` never builds an embed. It joins plain bold-markdown
lines — one per account — and replies with raw message `content`
(`commands/redeem/index.js`). This bypasses the repo's own notification
convention (`CONVENTIONS.md` § "Notification embeds: group by subject, not by
account") and the existing embed vocabulary in `core/notify.js`
(`buildGroupedEmbed`, `buildRedeemEmbed`: game accent color, author + logo,
`Game · Suffix` title, 🟢/🟡/🔴/⚪ rows).

Audit of similar offenders:

| Where                    | Today                                                          | Verdict             |
| :----------------------- | :------------------------------------------------------------- | :------------------ |
| `/redeem` bulk           | Plain bold text, one line per account                           | Change 1            |
| `/redeem` single code    | Plain text "Successfully redeemed code: X"                      | Change 2            |
| `/checkin`               | One 7-field embed **per account** + detached red error embed    | Change 3            |
| `/mimo`, `/hilichurl`    | Per-account embeds carrying real per-account data               | Keep (out of scope) |
| Telegram / console paths | Plain text by design                                            | Keep                |

## Change 1 — `/redeem` bulk: one embed per game, one row per account

Grouping decision: **per game** (Option A), not per code. The command reports
per-account totals across the whole code cache; per-code embeds could exceed
Discord's 10-embed cap on a full-cache run.

Each targeted game with at least one processed account yields one embed:

- **Color / author:** the game's `assets.color` and `assets.author` +
  `assets.logo`, exactly like `buildRedeemEmbed`.
- **Title:** `<Game Name> · Redeem Summary` (game display name, not the engine
  key — `genshin` → `Genshin Impact`).
- **Description rows**, one per account:
  - `🟢 **IGN** (uid) — 3 redeemed · 1 failed` — only non-zero counts appear.
  - `⚪ **IGN** (uid) — nothing new (5 already redeemed)` — all codes skipped.
  - `🔴 **IGN** (uid) — stopped: cookie expired` — auth failure aborted the
    account.
- **Footer:** `N codes checked` (the shared fact for the group).
- Reply stays ephemeral; falls back to the current plain-text summary for
  non-Discord contexts (`{ success, reply }` return shape unchanged).
- "No codes available to redeem." stays a plain content reply.

## Change 2 — `/redeem` single code: mini embed

The `game + account + code` path returns one embed in the same voice:

- Title `<Game Name> · Code Redeemed`, game accent + author.
- Description: `` `CODE` `` on the head line, then one row —
  `🟢 **IGN** — redeemed` or `🔴 **IGN** — <reason>`.
- Still ephemeral; non-Discord contexts keep the plain `reply` string.

## Change 3 — `/checkin`: regroup by game, errors as rows

`/checkin` (Discord path) currently emits one seven-field card per account plus
a generic red `❌ Check-In Errors` embed — the exact per-account spam the
convention forbids.

- One embed per game: accent color, author + logo, title
  `<Game Name> · Daily Check-In`.
- Description rows: `🟢 **IGN** — <award name> ×<count> · Day <total>`.
- Per-game/per-account failures become `🔴 **name** — <error>` rows inside
  that game's embed (a game with only errors still gets its embed); the
  detached red error embed is removed.
- Telegram (`platform.id === 2`) and generic fallback text paths unchanged.

## Implementation shape

- New pure builders live next to the existing ones in `core/notify.js` (or are
  shared with them): `buildRedeemSummaryEmbed(group)` and a grouped check-in
  builder reusable by both the `/checkin` command and the check-in cron if the
  cron is later aligned.
- Builders are pure (`group` in → embed object out) and unit-tested under
  `core/__tests__/`; command wiring is covered by the boot/load smoke +
  manual in-Discord check, per testing policy.
- No behavior changes: redeem/check-in logic, status vocabularies, and DB
  records are untouched — presentation only.

## Out of scope

- `/mimo` and `/hilichurl` embeds (genuinely per-account data). Their red
  "❌ Errors" boxes may adopt the 🔴-row style in a follow-up.
- Telegram/console formatting.
- The auto-redeem cron's per-code notifications (`buildRedeemEmbed`) — already
  conventional.
