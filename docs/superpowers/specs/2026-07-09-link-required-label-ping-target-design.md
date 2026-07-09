# Design: `/link add` & `/link edit` — required labels + editable ping target

**Date:** 2026-07-09
**Status:** Approved (pending spec review)

## Problem

Two issues surfaced with profile linking:

1. **Accidental overwrite / data loss.** Profiles are keyed by
   `${guildId}:${label.toLowerCase()}` (`db/index.js`), and `/link add` defaults
   the label to the runner's Discord username (`add.js:8`,
   `?? interaction.user.username`). Adding a second HoYoLAB account without an
   explicit label reuses the same key, so the upsert **silently replaces** the
   first profile. This actually happened in production (two different `ltuid`s
   collided on the same `…:skullpluggery` key).

2. **Ping target is tied to the command runner.** The notification mention
   (`discordUserId`) is hardcoded to `interaction.user.id`. An admin linking on
   behalf of someone else can't choose who gets pinged, and it can't be changed
   later.

Out of scope: the auto-redeem `-1071` (short-lived `cookie_token_v2`) bug — a
separate track.

## Decisions

- **Label is required**, not defaulted. A defaulted label is what caused the
  overwrite; forcing a conscious, meaningful, unique label is the fix. The option
  description explains the label identifies the profile for
  edit/remove/refresh, with examples (`Skull - US`, `Skull - Asia`).
- **Ping target is optional and defaults to none.** When `mention` is omitted,
  no one is pinged (`discordUserId = null`) — it does **not** fall back to the
  runner.
- **Ping target uses Discord's native user option** (`addUserOption`) — a
  username picker/typeahead, never a raw snowflake. The resolved user ID is
  stored; Discord renders it back as the username in mentions and lists.
- **Overwrite guard.** `/link add` with a label already used by a *different*
  account is refused. Re-adding the *same* account (matching `ltuid`) under its
  label is allowed and behaves like today (game merge).
- **Ping target is editable in `/link edit`** via a native user-select
  component (modals can't host a user picker), and can be cleared back to none.

## Changes

### 1. `/link add` slash options — `commands/link/index.js`

- `label`: `.setRequired(true)`, `.setMaxLength(80)`, description:
  *"Unique name for this profile — used to edit/remove/refresh it later. Make it
  distinct, e.g. `Skull - US`, `Skull - Asia`."*
- New `mention`: `.addUserOption`, optional, description:
  *"Who to @mention in this profile's notifications (defaults to no one)."*

### 2. `/link add` handler — `commands/link/add.js`

- `const label = interaction.options.getString("label");` (required; drop the
  `?? interaction.user.username` fallback).
- `const discordUserId = interaction.options.getUser("mention")?.id ?? null;`
- Pass both through to `linkProfile` unchanged otherwise.

### 3. Overwrite guard — `commands/link/service.js` (`linkProfile`)

After `parseCookie` yields `parsed.ltuid`, before the upsert:

```js
const existing = await db.getProfile(guildId, label);
if (existing && existing.ltuid !== parsed.ltuid) {
    throw new Error(
        `Label "${label}" is already linked to a different account ` +
        `(uid ${existing.ltuid}). Choose a different label, or use ` +
        `/link refresh to update that profile.`
    );
}
```

- `existing && existing.ltuid === parsed.ltuid` → proceed, `mergeGames` as today
  (idempotent re-add / owner update).
- No existing → normal create.

### 4. `/link edit` ping target — `commands/link/editor.js`

- Add a `UserSelectMenuBuilder` row to `buildGameSelect` (top-level profile
  panel), customId `hle:ping:${profile._id}:-`, placeholder
  *"Set who to @mention…"*, pre-filled with the current owner via
  `setDefaultUsers([profile.discordUserId])` when set.
- New handler branch `action === "ping"`:
  `const userId = interaction.values[0] ?? null;`
  `await app.db.setProfileOwner(profileId, userId);` then refresh the panel with
  the updated mention shown.
- Clearing: a user-select requires a pick, so allow clearing via
  `setMinValues(0)` (deselect → `values` empty → `null`).

### 5. Null-owner handling (display robustness)

- `core/notify.js`: never emit `<@null>` / `<@undefined>` — when
  `discordUserId` is null, render the notification without a mention.
- `commands/link/list.js:14`: a null owner currently prints `_unknown_`; change
  to read as intentional (e.g. `no ping set`) rather than "unknown".

### 6. DB helper — `db/index.js`

- Add `setProfileOwner(profileId, discordUserId)` (mirrors `setTokenStatus` /
  `renameProfile`): `$set: { discordUserId }` on `{ _id: profileId }`, returns
  the updated doc.

## Data flow

```
/link add (label*, cookie*, mention?)
        │  label required, mention?.id ?? null
        ▼
linkProfile(): parseCookie → detectGames
        │  guard: existing.ltuid !== parsed.ltuid → throw
        ▼
db.upsertProfile({ label, cookie, ltuid, discordUserId, games })
        │
        ▼
scheduleReload() → assemble (excludes tokenStatus="expired")

/link edit (label*) → editor panel
        │  UserSelect "ping" → setProfileOwner(profileId, userId|null)
        ▼
scheduleReload() (mirrors rename; plan verifies if mention is read live at
notify time vs baked into assembled config)
```

## Error handling

- Required `label` / `cookie` are enforced by Discord (required options).
- Duplicate-label-different-account → friendly thrown error surfaced by
  `add.js`'s existing `catch` (`❌ ${e.message}`).
- Invalid/expired cookie at detect time → existing `detectGames` error path,
  unchanged.
- Null owner → no mention rendered (Section 5).

## Testing

Per `CONVENTIONS.md` (pure units tested; global/interaction-bound code gets
smoke + manual check):

- **`commands/link/__tests__/service.test.js`** (extend existing): guard throws
  on different `ltuid`; same `ltuid` merges games; brand-new label creates.
  `db` and `detect` are injected, so this stays a pure unit.
- **`db/__tests__/…`**: `setProfileOwner` sets/clears `discordUserId` on a
  temp-dir NeDB instance.
- **Smoke:** boot/load still succeeds with the new option + editor row.
- **Manual in-Discord:** `/link add` with and without `mention`; duplicate-label
  refusal; `/link edit` set + clear ping; `/link list` shows mention / "no ping".

## Non-goals

- No auto-suffixing or nickname-based label defaults (required label chosen
  instead).
- No change to `/link refresh` (still keyed by label, same account).
- Auto-redeem `-1071` fix tracked separately.
