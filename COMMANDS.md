# Commands

All commands are Discord **slash commands**. There are two groups:

- **Management commands** (`/link`, `/config`, `/migrate`) — configure the bot's
  profiles and per-server settings. These require the **Administrator**
  permission and are **scoped to the server** they're run in (a profile added in
  one server is only visible there).
- **Action commands** (`/checkin`, `/redeem`, …) — run a HoYoLAB action or check
  on demand against the bot's linked accounts.

A **profile** is one HoYoLAB login (one cookie). A profile can have **many games**
attached; you never duplicate a cookie per game. Games are auto-detected from the
cookie when you link.

An option marked **(required)** must be supplied; others are optional.

---

## Management

### `/link` — manage profiles

| Subcommand | Options | What it does |
|---|---|---|
| `/link add` | `cookie` (required), `label` | Links a HoYoLAB account by cookie and auto-detects every game it plays. `label` defaults to your Discord username; re-using a label updates that profile (keeping its per-game settings). |
| `/link list` | — | Lists this server's profiles with their games and token status (🟢 active / 🔴 expired). |
| `/link edit` | `label` (required) | Opens an interactive editor: pick a game → toggle its settings with buttons (green = on) → use **Edit values…** for numeric settings like the stamina threshold. |
| `/link remove` | `label` (required) | Removes a profile from this server. |
| `/link refresh` | `label` (required), `cookie` (required) | Replaces a profile's cookie (e.g. after it expires) and marks it active again. |

The `label` option on `/link edit`, `/link remove`, and `/link refresh`
autocompletes from this server's existing profiles.

**Getting your cookie:** follow the HoYoLAB cookie guide —
<https://github.com/torikushiii/hoyolab-auto?tab=readme-ov-file#installation>.
Treat the cookie like a password; only paste it into `/link add` or
`/link refresh` (replies are private/ephemeral).

### `/config` — per-server settings

| Subcommand | Options | What it does |
|---|---|---|
| `/config schedule` | `time` | Sets the daily check-in time as `HH:MM` (24-hour), interpreted in this server's timezone. Run with no `time` to see the current schedule and next run. |
| `/config channel` | `type` (required: `check-in` or `redeem`), `channel` | Sets which channel a notification type posts to. Run with no `channel` to see the current one. |
| `/config timezone` | `tz` | Sets this server's IANA timezone (e.g. `Asia/Manila`), which governs the check-in time and the daily boundary. Run with no `tz` to see the current one. Defaults to `UTC`. |

Times shown by `/config` render as Discord timestamps, so they appear in each
viewer's own local time.

### `/migrate` — import a legacy config

| Options | What it does |
|---|---|
| `file` (required) | Upload an existing `config.json5`; the bot imports its accounts as profiles for this server (one profile per HoYoLAB login), carrying over each game's settings. Rename/adjust afterward with `/link` and `/link edit`. |

---

## Actions

These run against the bot's linked accounts on demand. `game` accepts
`genshin`, `starrail` (`hsr`), `zenless` (`zzz`), `honkai` (`hi3`), or `tot`
where applicable; `account` is a specific in-game UID (offered as choices).

| Command | Options | What it does |
|---|---|---|
| `/checkin` | `game` | Runs daily check-in now — for one game, or all games if `game` is omitted. |
| `/redeem` | `game` (required), `account` (required), `code` (required) | Redeems a gift code for the given account. |
| `/notes` | `game` (required), `account` | Shows your HoYoLAB notes (resin/stamina, expeditions, etc.). |
| `/stamina` | `game` (required) | Shows current stamina/resin for a game. |
| `/expedition` | `game` (required) | Shows expedition status. |
| `/diary` | `game` (required), `account` (required) | Shows your monthly income (Traveler's Diary / equivalent). |
| `/mimo` | `game` | Runs Traveling Mimo automation — for one game, or all supported games if omitted. |
| `/hilichurl` | — | Runs the Hilichurl Machine Workshop automation for Genshin Impact. |
| `/test-notification` | `message` | Sends a test notification to verify platform delivery. |

---

## Notes

- **Permissions:** `/link`, `/config`, and `/migrate` require the server
  **Administrator** permission (enforced both by Discord's default command
  permissions and a runtime check).
- **Scheduling:** the daily check-in runs per server at its configured
  `/config schedule` time and timezone; results post to the `check-in` channel.
  Gift-code redemption runs automatically on a global poll and posts to each
  server's `redeem` channel.
- **Dead cookies:** if HoYoLAB rejects a profile's cookie, it's marked 🔴
  expired (visible in `/link list`) and skipped until you `/link refresh` it.
- Changes made through commands apply live — no bot restart needed.
