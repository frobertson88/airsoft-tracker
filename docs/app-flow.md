# App flow and navigation

Status: agreed design direction; implementation defaults are identified where needed. Screens follow the [design direction](design-direction.md) agreed 11 October 2026.

## 1. Core decisions

- The full journey is sign in → pick an open Game Day (or host one) → check in → lobby → games → day results.
- A Game Day owns membership, day roles, teams, sections, permissions and game history.
- **Check in on one screen:** team, today's role and an optional section are chosen together (11 October 2026; replaces the earlier role → team → section steps). The role belongs to the player for the whole day and persists when their team or section changes.
- Team and section membership persist between games unless explicitly changed or cleared.
- A game owns its rules, timer, scores, objectives and player gameplay state.
- Restart creates a new game instance with the same configuration; completed results remain intact.
- Changing game type ends the current game and prepares another instance.
- Admins get a **Host tab** in the bottom bar (11 October 2026; replaces the Admin Mode toggle in More). A playing admin uses the normal player tabs and opens Host when needed; the tab never grants permissions, and non-admins never see it.
- Keep the structure to **team and section**; no platoon level.

## 2. Sign in and home

First launch:

1. Sign in with Apple or Google; email/code can be added later.
2. Create a persistent profile with display name/callsign and optional photo.
3. Open Home.

The permanent profile does not contain the player's day role.

Home leads with the list of **open Game Days**: each card shows name, field, host, current state (Lobby or Round N live), a Blue/Red split bar with player counts, and Join. **Host a game day** sits below the list. A **Your kit** row gives Fields ([Field Library](field-library.md)), Medic rules ([rulesets](medic-gameplay.md#reusable-medic-rulesets)) and History. A small label shows whether location is on.

On reopening the app, restore the signed-in session and current Game Day. Route to unfinished setup or the current game state. Do not require players to repeat joining after each game.

## 3. Joining and day setup

Agreed (10 October 2026): join from a **public list** of open Game Days; there are no join codes, QR codes or invite links. Every open day is visible to every signed-in user. Each list entry shows the Game Day name, host, player count and current/next round. Closed days are not listed.

Agreed: choosing an open day admits the player to day membership immediately, without an admin approval queue. This does not bypass role/team setup or grant participation in an already-running round. Removed players cannot rejoin from the list until a day admin readmits them.

Agreed: **location permission is required to join**. If it is denied, Join is blocked with an explanation and an Allow location / Open settings action. Revoking permission after joining does not remove the player or cause death/elimination; show **Tracking unavailable** with a re-enable action. See [location and device operation](location-and-device-operation.md#permissions-and-privacy).

Check in (one screen, top to bottom):

1. **Team — required to participate:** large team cards with current counts.
2. **Today's Role — required:** chips for Rifleman, Machine Gunner, Sniper, Medic, Team Commander or Other. Expand the list later as needed. Leading a section is not a role (see [§4](#4-teams-and-sections)); anyone who had the old Section Leader role is asked to pick a role again.
3. **Section — optional:** chips for that team's sections and None, with a small **+ Start a new section** link below (create, join and lead it).
4. A one-line note that teammates see your position, then **Check in**, whose button repeats the choice (for example "Rifleman · Blue · Alpha").

Sensible defaults are preselected where possible so most players only tap Check in.

Display the result as:

> Today's Role: Machine Gunner  
> Assignment: Blue · Alpha

The day role persists by default, rather than being immutable. Allow explicit edits between games for equipment changes. Moving teams preserves the day role and clears a section belonging to the previous team.

**Permission rule:** choosing a role label must not automatically grant admin or commander authority. Admins assign privileged leadership permissions. Medic interactions follow the selected game's medic rules.

## 4. Teams and sections

The **Squad** tab shows your own team's sections open, with members, day roles and each section's lead; other sections and other teams are folded and open on tap.

**Section leads** (agreed 11 October 2026; replaces the Section Leader role): each section has at most one lead. Whoever creates a section leads it. The lead or a day admin can hand the lead to another member of that section (**Make lead**); a section with no lead can be taken by any of its members (**Take the lead**). Leaving the section or the day gives up the lead. Leading a section does not grant admin or commander permissions by itself.

Create Section asks only for a name and offers **Create & Join**. Initial default: players can create sections within their own team. Admins can manage either team; authorised commanders manage their own team's assignments.

Agreed: players choose their team during setup and may change teams themselves between games, without requiring admin approval. Admins can correct assignments. Players can also change section or day role between games. During countdown, live play and pause, normal assignment edits are locked. Organisers can set an optional player limit per team; selection/admission must respect configured limits. Limit defaults/validation, admin overrides and lowering a limit below existing membership remain to be defined.

Admins can correct assignments when needed. For a live-game correction, pause first, preview the affected player/team state, and record the change. Historical results retain the assignments used in that game.

**Clear Team Assignments** is a separate, confirmed action between games: clear team/section membership, retain day roles and prior results, and return affected players to assignment setup. Do not clear teams automatically when starting another game.

## 5. Navigation and player screens

Within a Game Day, use **Game · Map · Scan · Squad · More**; for admins the fifth tab is **Host**, and More's items move behind the profile button. Keep the bottom bar on the main screens except Map. Map has no bottom navigation; its generic Scan action sits in the left toolbar, and the top-right menu provides navigation.

On the iPhone Map screen, retain the [compact game strip and drawing controls](map-screen-layout.md). Add Scan to the left toolbar, with no self-medic icon. Show the player's known/pending condition in a separate status label. **I'm hit** is a direct button at the bottom. New injuries are revealed only after a medic scan, as defined in [medic gameplay](medic-gameplay.md#reporting-and-revealing-an-injury). The layout document owns the map shell and placement of its controls.

| Area | Purpose |
| --- | --- |
| Game | Current stage, game information, objective, status and results |
| Map | Field, relevant teammates, markers and objectives |
| Scan | One NFC reader entry point for wristbands and objective tags; resolve the tag and present or complete the eligible action |
| Squad | Today's role, team/section assignment, section leads and members; other sections and teams folded |
| More | Rules, settings, NFC identity and leave day |
| Host (admins only, replaces More) | Day status, next game, players, field, end day; see [§12](#12-admin-and-marker-views) |

The Game screen adapts to state:

| State | Player sees |
| --- | --- |
| Setup incomplete | Next required setup step |
| Lobby / between games | Assignment, next game, waiting message and previous result |
| Countdown | Remaining countdown, game type and starting instructions |
| Live | Remaining time or Unlimited, objective, score when enabled and personal status |
| Paused | Clear paused banner and admin instruction |
| Complete | Final result and return-to-staging instruction |
| Game Day closed | Day summary, game history and return to Home |

State changes update automatically without requiring players to navigate back to Game. Keep pause/start/end status visible on the Map and other gameplay screens.

Location tracking continues throughout Game Day participation, including lobby/between games and pause, with background/locked-screen operation targeted on both iPhone and Android. Stop tracking on leaving/removal or day closure. Tracking observations do not advance paused gameplay. All teammates can see current locations, with last-known positions labelled by age when stale. Location permission is required to join (see [joining](#3-joining-and-day-setup)); if later revoked, tracking is unavailable and valid GPS remains required for location objectives. Store routes for post-game review and offer an optional less-frequent battery-saving mode; see [location and device operation](location-and-device-operation.md) for device verification and open history/interval rules.

Record replay routes only during live rounds. After each round finishes, all day participants can review all teams' routes for that round. Routes expire automatically after 30 days; only organisers can delete them earlier. Completed-round replays do not reveal opposing live positions or routes from unfinished rounds.

## 6. Creating a Game Day

1. Enter the Game Day name and create the day; creator receives admin permission. An existing day can be opened instead.
2. In that day's admin lobby, choose a saved field (or create one), review its layout and confirm the day copy. Field selection can follow day creation but must be completed before the first game countdown. Optional location details belong to the field; see [Field Library](field-library.md#selecting-a-field-for-a-game-day).
3. Start with two renameable teams.
4. The day appears in the public Join list while open.
5. Manage teams, players, sections and admins.
6. Add games to an ordered list.

The creator can complete player setup if playing. An admin who is only hosting can manage the day without a playing assignment.

Latest agreed admin policy: all Game Day admins have equal day-management rights, including the creator. Any day admin can grant/revoke admin access, assign/manage commanders, remove players, approve readmission, manage games and perform authorised corrections. This replaces the earlier creator-only admin-access policy. Retain creator identity as provenance, without a separate owner permission tier or ownership-transfer workflow. A chosen role label still does not grant authority. Agreed safeguard: reject removal, demotion or departure that would leave the day without an admin; another admin must remain. Revalidate this atomically for concurrent requests. Permission revocation timing still needs implementation detail.

A removed player cannot simply rejoin from the public list: require explicit readmission by a day admin and revalidate participation before entering a round.

The admin lobby shows **Field not selected → Choose Field** until selection, then identifies the selected field and provides **Review Field**. Day admins can edit the day layout before play or while paused, notifying affected players; only the template creator can edit the saved original. The same day field is the starting map for each game; selecting medic rules and game-specific objectives remains separate. Template edits do not automatically change an existing day. See [Field Library](field-library.md#templates-and-game-day-copies) for outstanding paused-edit validation details.

The admin lobby shows joined players, team counts, incomplete setups, next game and **Start Game**. Missing sections are informational because sections are optional. Missing roles/teams prevent those players from participating; late arrivals remain in setup/staging until admitted.

Agreed late-arrival policy: a day admin may admit a fully configured late arrival while the current round remains live, without pausing, and notify the admitted player. Joining the day or choosing a team does not automatically admit them. A newly admitted player starts in play on their first life for that round. Admission must validate the round/team and record the participation change; safe entry instructions remain to be defined by the mode. First-life admission applies to new participants, not resetting an existing participant's injuries/life on reconnect or readmission. Until admitted, show a clear waiting/staging state.

## 7. Adding and preparing games

**Add Game → choose type → configure → save.**

The admin lobby includes **Medic Rulesets**, giving access to saved sets reusable across the organiser's Game Days. Any day admin may edit saved sets available to that day and select one through **Configure Game → Medic Rules → Choose Ruleset**. The first editor configures treatment, helper permissions and field instructions for the simple three-hit sequence. Set bleed-out duration separately in the game configuration; the ruleset chooses death or remaining out of play awaiting help at expiry. A game retains its own copy; editing a saved set does not alter existing game copies. See [medic gameplay](medic-gameplay.md#reusable-medic-rulesets).

Initial types: King of the Hill, Team Deathmatch and Objective Game. Custom can be added later.

All types support a duration or **Unlimited**, a start countdown and their own rules. Store queued configuration separately from a started game's results.

Use [game modes](game-modes.md) for each type's configuration, play and end rules. Objective Game is the player-facing name for Objective / Mission mode. Its initial proposed slice is planned ordered Patrol; later mission primitives remain scoped in the mode document.

Detailed cross-mode rules belong in [medic gameplay](medic-gameplay.md), [dog-tag gameplay](dog-tag-gameplay.md), [NFC interactions](nfc-interactions.md) and [map marker targeting](map-marker-targeting.md). Dog-tag capture/scoring is a proposed feature; a dedicated Kill Confirmed / Dog Tag game type is not part of the initial type list above.

## 8. Start, pause and resume

Start review shows game type, teams/eligible player counts, duration, optional countdown and key rules. The organiser can disable the countdown or set a preparation duration, including several minutes (for example five minutes for players to step off). No fixed default duration is agreed. **Start Countdown** starts one shared countdown, then automatically changes the game to Live; with countdown disabled, a validated **Start Game** starts immediately.

Agreed: an admin can **Force Start** during a start countdown to begin live play immediately. This ends the remaining preparation countdown, preserves the configured round duration, and notifies players. Force Start must still pass backend start validation and cannot bypass invalid configuration, field selection or participation permissions. It is not permission to resume paused gameplay without the resume workflow.

Admins see **Pause**, **Manage Game**, **Manage Players** and **End Game** during play.

Pause immediately shows **Game Paused** to players. Freeze game time, scoring, zone movement and gameplay actions that require live play. Pause is not permission to change teams freely.

Resume can use a short shared countdown. Gameplay remains frozen until that countdown completes. Proposed default: 10 seconds, configurable. Cancelling a start countdown returns the game to Ready; cancelling a resume countdown leaves it Paused.

Start, pause, resume and end generate clear alerts. Sound/vibration are optional enhancements; the in-app state is always visible.

## 9. Changes during a game

Manage Game exposes only supported operational changes, such as add time, move a zone now, change zone interval/size or disable an objective.

Show the proposed effect before applying it. Keep existing scores and elapsed time unless a specific action explicitly changes them. Record the change and alert affected players. Each game mode defines which edits are allowed and whether a pause is required, within the static mode boundaries in [architecture](architecture.md#2-small-implementation-with-clear-boundaries).

Agreed: admins may change the current game's medic rules while paused, with player notification. This is an explicit change to the game's rule copy, not automatic propagation from a saved template edit. Changes apply to future hits only; existing injuries keep their original rules and existing timers keep their remaining time. Preview and validate the change, retain rule history, and preserve mode restrictions such as TDM's no-respawn rule; see [medic rulesets](medic-gameplay.md#reusable-medic-rulesets).

Agreed: an admin can undo an accidental accepted hit with a recorded reason. This is an audited correction, not ordinary treatment or respawn. If treatment or tag capture has followed, require review of affected actions and scores. Capture rewards, later hits/treatment and already-ended results must not be silently erased. The correction's dependent-event and timing mechanics remain to be defined before implementation.

**Change Game Type** means **End Current Game & Set Up Next**. Keep current results, preserve day assignments, configure the replacement and require a new start countdown.

## 10. End, restart and next game

End Game asks for confirmation, finalises the result and alerts everyone. Games can also end automatically according to their victory/duration rules. If scoring is disabled or no winner is determined, show completion without inventing a winner.

Exception for agreed queued offline scans: when submissions reconnect after round completion, send them to admin review before results are finalised. Gameplay remains ended while results may be provisional. Review detection/deadlines and result corrections still need definition; see [pending scans](nfc-interactions.md#pending-offline-scans).

Players return to the between-games lobby without leaving the Game Day.

Admin actions:

| Action | Result |
| --- | --- |
| Play again | New instance of the finished game configuration; review, then countdown |
| Start Next Game | Review the next queued game, then countdown |
| Choose a new game mode | Select/configure another game (mode, number of teams, length, medic rules), then countdown |
| Edit Teams | Adjust or explicitly clear assignments between games |
| End Game Day | Close the day and show its summary |

Each new game starts with fresh scores, timers, captures, objectives, wounds, deaths and other game-specific state. Preserve identity, day role, team, section and NFC binding. Future carry-over rules must be explicit.

## 11. Ending or leaving the day

End Game Day is distinct from End Game. Initial default: end any active game first, then confirm day closure. Retain results and history, show the day summary, and allow return to Home.

Agreed: a closed Game Day cannot reopen; create another day for further play. Historical results remain available subject to their retention rules. Any outstanding offline results review is a separate administrative process and does not reopen gameplay.

A player can leave the day from More, subject to the last-admin safeguard. During play, confirm the action and apply the game mode's departure policy so leaving cannot silently erase an elimination or affect scoring unpredictably. TDM and Patrol use withdrawal without erasing history/team progress; other mode-specific details remain in [game modes](game-modes.md).

## 12. Admin and marker views

Admins manage the day from the **Host tab** (agreed 11 October 2026). Between rounds it shows day status, team split, players still choosing a team, **Play again**, **Choose a new game mode**, the field, player management and End game day; during a round it shows Pause, Manage Game, Manage Players and End Game. Opening Host does not change the game's state or grant permissions.

The player tabs use that player's team/section visibility even for admins. [Map marker targeting](map-marker-targeting.md) owns affiliation, available audiences and visibility permissions for every role. The [map toolbar](map-toolbar.md) owns placement controls.

## 13. State and data boundaries

Keep these independent:

- Account/profile: identity and sign-in.
- GameDay: Setup/Open/Closed, teams, sections and game queue/history.
- GameDayPlayer: role, current team/section, membership and permissions.
- GameInstance: Ready/Countdown/Live/Paused/Complete, configuration and result.
- GamePlayerState: participation snapshot, injury/death and other per-game state.
- UI view: Player/Admin, within the user's actual permissions.

Lobby and Between Games are screen states derived from an open day with no active game. Resume countdown retains the paused game state until play resumes.

The backend is authoritative for permissions, game transitions, shared time and scores. Only one game instance is active per day. Retain a participation snapshot/history so later assignment changes do not rewrite old results.

Agreed reconnect policy: after connection loss, restore the same player's current authoritative team, injuries, current life, participation and shared time without requiring admin approval. Reconnection must not reset wounds, start a new life or award respawn. Use the latest server state rather than pre-disconnection cached values. This does not override removal, departure or game completion; those transitions need their own policy. Show connection loss clearly rather than displaying stale play as confirmed Live. Detailed offline gameplay, background alerts and late-admission validation are implementation follow-ups.

Agreed disconnected map behaviour: retain the last authorised cached field and markers, visibly labelled **Offline — last known**, with observation ages and pending actions. Cached information must not imply fresh tracking or accepted gameplay. Clear/filter cached data when known membership/permissions change; see [location and device operation](location-and-device-operation.md#offline-map) for verification and caching limits.

## 14. First implementation scope

Build sign-in/profile, join/create day, one-screen check-in, teams/sections, the bottom-tab navigation, the admin Host tab, game queue and lifecycle, assignment persistence, results and reopening/reconnect routing.

Keep watches, Bluetooth items, advanced perks, role quotas, automatic balancing and advanced offline gameplay for later. The [documentation index](README.md) links the gameplay proposals that attach to this shared flow; each feature document defines its own initial and future scope. This suggested flow scope does not replace `plans/current.md`.
