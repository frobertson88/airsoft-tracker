# Design direction (2026 redesign)

Status: **Agreed**, 11 October 2026. This is the current visual and screen-flow reference. Where it differs from an older note in another document, this one wins; the owning documents below have been updated to match.

Design canvas: [Airsoft Tracker Redesign](https://claude.ai/artifact/QpziiRxmDT22bSidYm7dzZ) (16 artboards, most clickable with Play). The older [saved app pages preview](app-pages-preview.html) and [walkthrough](game-day-walkthrough.html) remain as history only.

## Principles

- **Fewer steps.** Sign in to the lobby in three taps: pick a day, check in, done.
- **The field is the app.** During a round the map fills the screen; everything else is one tap away.
- **Hosting is visible, not a hidden mode.** Admins get a Host tab instead of a toggle buried in More.
- **One urgent colour.** Orange means danger and nothing else; team colours are only team colours.
- **Readable in sun and at night.** Ranger green at night, a light Daylight scheme for bright sun. See [colour scheme](colour-scheme.md).

## Screens

| # | Screen | What it does | Owning doc |
| --- | --- | --- | --- |
| 1 | Sign in | Apple, Google or email; callsign asked once on first sign-in. | [App flow §2](app-flow.md#2-sign-in-and-home) |
| 2 | Home | Open Game Days first (status, team split, Join). Host a game day below. "Your kit": Fields, Medic rules, History. | [App flow §2](app-flow.md#2-sign-in-and-home) |
| 3 | Check in | One screen: team, today's role, optional section, location note, Check in. Section Leader is not a role; a small **+ Start a new section** link creates a section you lead. | [App flow §3](app-flow.md#3-joining-and-day-setup) |
| 4 | Lobby (Game tab) | Assignment chip, next game card, section members, last result. Tabs: Game · Map · Scan · Squad · More (Host for admins). | [App flow §5](app-flow.md#5-navigation-and-player-screens) |
| 5 | Live map | Full-bleed map, game strip, status label, left rail (Scan, Friendly/Enemy, Section/Team, Markers, Draw), tool strip, **I'm hit** button, menu sheet. | [Map screen layout](map-screen-layout.md) |
| 6 | Hit | Full-screen bleed-out timer, "awaiting medic", nearest medic with direction and Ping. | [Medic gameplay](medic-gameplay.md#reporting-and-revealing-an-injury) |
| 7 | Round over | Winner, team scores, personal stats, replay, back to lobby. | [App flow §10](app-flow.md#10-end-restart-and-next-game) |
| 8 | Host tab | Between-rounds status, team split, players still choosing, **Play again**, **Choose a new game mode**, field, players, End game day. | [App flow §12](app-flow.md#12-admin-and-marker-views) |
| 9 | New game setup | Mode, number of teams (2–4), length, medic rules, start countdown. | [App flow §7](app-flow.md#7-adding-and-preparing-games) |
| 10 | Medic rules library | Saved rule sets with a hit-by-hit summary; New rule set. | [Medic gameplay](medic-gameplay.md#reusable-medic-rulesets) |
| 11 | Rule set editor | Per hit: instruction and who can treat; what happens when bleed-out reaches zero. | [Medic gameplay](medic-gameplay.md#reusable-medic-rulesets) |
| 12 | Medic scan | Injury revealed on the medic's phone only; confirm treatment to return the player. | [Medic gameplay](medic-gameplay.md#reporting-and-revealing-an-injury) |
| 13–16 | Colour options | Palette board, orange danger, daylight map and lobby. | [Colour scheme](colour-scheme.md) |

## Changes made while building (11 October 2026)

These came up while running the app on phones and override the canvas where they differ:

- **Section leads replace the Section Leader role.** One lead per section, handed on by the lead or an admin; see [app flow §4](app-flow.md#4-teams-and-sections).
- **+ Start a new section** is a small link under the section chips, not a chip.
- **Squad** shows your own team's sections open and other sections and teams folded.
- The app now uses the Barlow Condensed and IBM Plex Sans fonts below.

## Type and shape

- Display: **Barlow Condensed** (bold, uppercase) for titles, team names and big buttons.
- Body: **IBM Plex Sans**. Numbers that change (timers, scores, counts): **IBM Plex Mono**.
- Rounded cards (12–16 px), 44 px minimum touch targets, inline line icons; no emoji.
- Map marker codes are short monospace labels (INF, SNP, MG, FOB…) until final icon art exists; enemy markers use a dashed border as well as colour.

## Not settled by the canvas

- Drawing tools are shown but not drawn (lines, areas, waypoints) in the prototype; [map toolbar](map-toolbar.md) still owns their behaviour, including Cursor and Delete.
- Squad, More, Scan and Field Library screens are not drawn yet.
- Daylight switching: manual setting vs following the phone's light/dark setting.
