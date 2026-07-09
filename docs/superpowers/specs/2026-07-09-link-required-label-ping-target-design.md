# Design: `/link add` & `/link edit` — required labels + editable ping target

**Date:** 2026-07-09
**Status:** Approved (design reviewed via Lavish — "lgtm")

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
- **Ping target is editable in `/link edit`** via a `mention` slash option (same
  native picker as `/link add`); cleared via a **"Remove mention"** button in the
  editor panel (components can't host a clean user *picker*, but a plain button
  works).
- **Notifications ping once.** The mention lives only in the content line above
  the embed; the redundant per-row `<@id>` is dropped. Rows keep the IGN only.

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

### 4. `/link edit` ping target — new `mention` slash option

Message components and modals can't offer a clean native user picker, so the
ping target is set via a **slash option on `/link edit`**, mirroring `/link add`.

- **Slash option** (`commands/link/index.js`, the `edit` subcommand): add
  `.addUserOption` `mention`, optional, description *"Set who to @mention in
  this profile's notifications."* (`label` stays required + autocomplete.)
- **Handler** (`commands/link/editor.js` `openEditor`): after loading the
  profile, if `interaction.options.getUser("mention")` is present, call
  `app.db.setProfileOwner(profile._id, user.id)` and `scheduleReload()` before
  rendering the panel; surface the change in the panel (or reply). If omitted,
  the current owner is unchanged and the editor panel opens as today.
- **Editor panel additions** (`buildGameSelect`): show the current ping (e.g.
  `🔔 Ping: <@id>` or `no ping set`) plus a hint line pointing to the command
  option — *"To set or change the ping, run `/link edit label mention:@user`."*
  This keeps a user who's hunting for a ping control from getting lost.
- **Clearing to none — resolved:** a **"Remove mention" button** in the editor
  panel (a plain button component, no picker). New handler branch
  `action === "clearping"` → `app.db.setProfileOwner(profileId, null)` +
  `scheduleReload()` + refresh the panel. So: *set/change* via the `mention`
  command option; *clear* via the panel button. No `clear_mention` flag.

**Copy consistency in the editor (user-facing wording = "label", not
"profile"):**

- `buildGameSelect` panel title: drop the `Edit profile: ` prefix — show just
  the label value (e.g. `Skull - US`).
- Rename control: button `Rename profile…` → **`Rename label`** (no ellipsis);
  modal title `Rename profile` → `Rename label`; text input label
  `New profile label` → `New label`; success reply `Renamed profile to …` →
  `Renamed label to …`.
- This is copy only — the underlying entity/collection stays `profile`
  internally; only the words shown to users change.

### 5. Notifications — single ping, null-owner safe (`core/notify.js`)

The recipient is already pinged in the **content line above the embed**
(`notify.js:140`, `[...pings].join(" ")`). Each embed row *also* renders the
owner mention — `**${ign}** ${owner} — …` in `buildGroupedEmbed` (`:89`) and
`buildRedeemEmbed` (`:162-163`) — which is a redundant second ping.

- **Drop the `<@id>` owner token from embed rows** for all grouped
  notifications (reminders + redeem). Rows keep the in-game name (`**${ign}**`)
  for identification; the content line remains the single ping.
- This also removes any `<@null>` risk in embeds. The top ping already only
  includes profiles with a `discordUserId` (`:123-124`), so a null owner simply
  contributes no ping — correct by construction.
- **Resolved:** rows show **IGN only** (`**${ign}**`). The in-game name is
  enough to identify each account; no plain-text owner label is added.

### 5b. `/link list` null-owner display

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

/link edit (label*, mention?) → editor panel
        │  mention option → setProfileOwner(profileId, user.id)
        │  "Remove mention" button → setProfileOwner(profileId, null)
        ▼
scheduleReload() (mirrors rename)
```

Note: `core/notify.js` reads `discordUserId` live from the DB per run
(`findProfilesByGameUid` → profile), so an owner change takes effect without a
reload; `scheduleReload()` is called only to stay consistent with `renameProfile`.

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
