# Command & Notification Improvements — Design

Date: 2026-07-08
Status: Draft (awaiting review)

Five independent quality-of-life changes to slash commands and reminder
notifications. Each is small and self-contained except **`/redeem` bulk mode**,
which is a genuine feature and carries the design decisions that need sign-off.

---

## 1. `/checkin` — public output

**Now:** `/checkin` defers with `ephemeral: true`
([checkin/index.js:48](../../../commands/checkin/index.js)), so only the invoker
sees the result.

**Change:** Defer publicly (`deferReply()` with no `ephemeral`), so the
invocation and the result embeds are visible to the whole channel. Every
`editReply` result (success, "already checked in", errors) inherits the public
visibility. The single pre-defer guard ("No active game accounts found") stays
ephemeral — it is a validation, not a result.

**Unchanged:** scope (still every active account, not per-guild/per-user) and the
Telegram / generic-platform branches.

**Test:** bound to Discord + `app` globals → boot smoke + manual in-Discord check
(per repo testing policy). No pure unit added.

---

## 2. `/link list` — show who linked each profile

**Now:** each profile is an embed field: name = `🟢/🔴 <label>`, value = the game
summary ([list.js](../../../commands/link/list.js)).

**Change:** append a line to each field's **value**:
`Linked by <@discordUserId>`. The mention renders as `@username` inside the embed
and does **not** ping (embed field mentions are inert). Profiles missing
`discordUserId` (older/migrated rows) show `Linked by _unknown_`.

**Unchanged:** the list stays ephemeral.

**Test:** presentation only, bound to Discord → manual check. No pure unit.

---

## 3. `/link edit` — rename the profile label

**Now:** the interactive editor
([editor.js](../../../commands/link/editor.js)) keys every component off the
stable NeDB `_id`, and only edits per-game settings. The `label` is part of the
profile's **primary key** (`profileKey(guildId, label) = guildId:label.toLowerCase`
in [db/index.js](../../../db/index.js)).

**Change:**

- Add a **"Rename profile…"** button to the top-level game-select panel
  (`buildGameSelect`), custom id `hle:rename:<_id>:-`.
- Clicking opens a modal (custom id `hle:renameModal:<_id>:-`) with one text
  input prefilled with the current label.
- On submit: trim + validate the new label (non-empty; reuse whatever rule
  `linkProfile` applies — mirror it), then apply.
- New DB method **`renameProfile(_id, newLabel)`**: loads the profile by `_id`,
  computes the new `key`, **rejects (throws) if another profile in the same guild
  already uses that label** (case-insensitive), otherwise updates `label` + `key`
  and returns the updated profile.
- After applying: `scheduleReload()` and refresh the panel (or reply an ephemeral
  confirmation). Because the editor keys off `_id`, the open session survives the
  re-key.

**Test:** `renameProfile` gets real unit tests (temp-dir NeDB, like existing
`db/__tests__`): happy-path re-keys `label` + `key`; collision throws; unknown
`_id` throws. The editor button/modal wiring is Discord-bound → manual check.

---

## 4. `/redeem` — bulk redeem with per-account cookie short-circuit

**Now:** `/redeem` requires **game + account + code** and redeems exactly one code
for one account via `app.HoyoLab.redeemCode`
([redeem/index.js](../../../commands/redeem/index.js)).

**Change:** make the params optional and add a **bulk mode** when no `code` is
given: redeem every available code for every eligible account, mirroring how the
`code-redeem` cron works, but driven manually and reported back in the reply.

### Behavior

- **Dispatch:** if `code` is provided → existing single-code path (unchanged,
  still needs game + account). If `code` is omitted → **bulk mode**.
- **Eligible accounts:** `getActiveAccounts({ blacklist: ["honkai", "tot"] })`
  (only redeemable games), filtered to `tokenStatus !== "expired"` profiles.
- **Available codes:** the shared per-game code cache the cron maintains
  (`genshin-code`, `starrail-code`, `zenless-code`).
- **Per account, per code:**
  - **Skip** codes already recorded successful for this profile+game in the
    `redeemResults` DB collection (status `ok`/`already`) — "don't re-redeem what
    already worked."
  - **Attempt** codes that were never tried or previously `error`.
  - On a redeem call that indicates the **cookie is invalid/expired** (an auth
    retcode, not a bad-code retcode): **stop this account's loop immediately**
    (don't hammer the remaining codes on a dead cookie), flip the profile's
    `tokenStatus` to `expired` (same as the check-in/reload path in
    [core/reload.js](../../../core/reload.js)), record the attempt as `expired`,
    and move to the next account.
  - Record every attempt with `db.recordRedeem({ ..., source: "manual", status })`
    using the fixed vocab `ok | already | invalid | expired | error`.
- **Reply (ephemeral):** a per-account summary — redeemed, skipped
  (already-done), failed, and "stopped: cookie expired". No channel-wide
  notifications (that is the cron's job).

### Engineering notes

- The engine redeem (`platform.redeemCode → redeem-code.js`) currently returns
  only `{ success, message }` and **swallows the `retcode`**. To classify
  auth failure vs bad-code vs already-redeemed, the three redeem-code modules
  (genshin/starrail/zenless) must **surface `retcode`** in their return value.
  `app.HoyoLab.errorMessage(name, retcode)` already exists for messaging; add a
  small classifier that maps auth retcodes (e.g. `-100`, `-1071`) → cookie death,
  bad-code retcodes (`-2001`, `-2003`) → `invalid`, and the already-redeemed
  retcode → `already`.
- New DB read method to support the skip logic, e.g.
  `db.hasSuccessfulRedeem(profileId, game, code)` (any `ok`/`already` row) — the
  `redeemResults` collection is currently append-only with no read accessor.

### Decisions to confirm (please review)

1. **Retry semantics.** Skip codes previously `ok`/`already` **and**
   `invalid`/`expired` (dead codes — retrying them is wasted API calls); retry
   only `error` and never-tried. Alternative: retry everything except
   `ok`/`already`. → *Proposed: skip ok/already/invalid/expired.*
2. **Auto toggle.** Manual `/redeem` **ignores** each account's `redeemCode`
   auto-toggle (an explicit manual request should run even if auto-redeem is off).
   → *Proposed: ignore the toggle.*
3. **Cookie-death retcodes.** Exact auth retcode list to be confirmed against live
   responses during implementation; the classifier centralizes it.

**Test:** `hasSuccessfulRedeem` + the retcode classifier get pure unit tests. The
account/code loop is bound to `app.HoyoLab` + live HTTP → boot smoke + manual
check.

---

## 5. Reminder notifications — remove duplicate header/footer text

**Now:** every reminder embed sets `title: "<X> Reminder"` **and**
`footer.text: "<X> Reminder"` — the same label twice (visible in expedition,
stamina, dailies, weeklies, mimo / howl-scratch-card, hilichurl, realm-currency,
shop-status crons).

**Change:** keep the **title** as the reminder label and drop the redundant
**footer text**. Keep the embed `timestamp` so the time still shows (Discord
renders it in the footer row). Where a footer only carried the duplicate text +
icon, remove the `footer` object; where it carries something unique, keep that.

**Scope:** ~9 cron embed builders, each an inline edit. No shared helper is
introduced (YAGNI) unless the edits reveal enough duplication to justify one.

**Test:** presentation only, Discord-bound → manual check.

---

## Rollout

Independent changes; can land in one branch. Suggested commit split:
`feat(checkin)`, `feat(link)` (list + rename), `feat(redeem)`, `fix(crons)` (embed
dedup). A patch/minor release follows via the `/release` skill.
