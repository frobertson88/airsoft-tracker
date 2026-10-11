# Current plan

Status: Stage 3 built 11 October 2026 (migration 0004 applied to Supabase); waiting on phone testing. Earlier stages: [Stage 1](stage1-2026-10-11.md), [Stage 2](stage2-2026-10-11.md).

## Stage 3 — Games and live positions

### Outcome

An admin sets up a game and runs it through countdown, live, pause and end, and every phone follows the same state and clock. While in a Game Day, each phone shares its position; the Map tab shows your own team's players live, with stale positions labelled. No scoring or game modes yet (King of the Hill is Stage 4).

### Scope

1. **Game setup (Host tab):** Set up game with a name, a length (minutes) or Unlimited, and a start countdown (off, or a number of seconds/minutes). One game at a time; results kept after it ends.
2. **Lifecycle on the backend:** Ready → Countdown → Live ⇄ Paused → Complete ([architecture §4](../docs/architecture.md#4-shared-lifecycle-and-clock)). Admin actions: Start countdown / Start now, Force start, Cancel countdown (back to Ready), Pause, Resume with a 10 second countdown (cancel leaves it Paused), Add time, End game. The game clock is counted on the backend and frozen while paused or in a resume countdown; games with a length end automatically.
3. **Between games:** Play again (same settings, new game) and Set up a new game. Teams, sections and roles carry over.
4. **Player view:** Game tab shows the state banner and clock for everyone; a short vibration on start, pause, resume and end. Countdown shows a big timer.
5. **Position sharing:** while you're in an open Game Day (lobby, live, paused, between games), your phone sends its position about every 5 seconds when moving, with accuracy and time. A **Battery saver** setting in More/Host sends less often (about every 20 seconds). Sending stops when you leave or are removed, or the day closes.
6. **Map tab:** your own team's players in team colour, labelled with callsign and section; positions older than a minute are greyed with an age label ("2 min ago"). Enemy positions are never sent to your phone (filtered in the database). Admins who are hosting without playing see everyone. Your own status shows **Tracking unavailable** if location is off.
7. **Reconnects:** reopening the app or getting signal back reloads the game state and clock from the backend.
8. **Tests:** lifecycle transitions and who can make them, clock maths across pause/resume, position visibility between teams, stopping on leave/remove/close.

### Defaults chosen for this stage

- Positions are shared while the app is open on screen (Expo Go). Pocket tracking with the screen locked needs our own test build and comes later.
- Only each player's latest position is stored. Route recording and after-round replay come in a later stage with the 30-day deletion.
- Stale after 60 seconds; positions hidden after 15 minutes without an update.
- No push notifications; alerts are in-app with vibration.

### Exclusions

Game modes and scoring (KOTH is Stage 4), medic and hits, NFC, route recording and replay, background/locked-screen tracking, push notifications, offline play.

### Acceptance checks

- [ ] Admin sets up a game, starts a countdown, and both phones switch to Live at the same moment.
- [ ] Pause freezes the clock on every phone; resume counts down 10 seconds before Live.
- [ ] Cancel countdown returns to Ready; Force start goes Live immediately keeping the full length.
- [ ] A timed game ends by itself; Add time extends it; End game ends it early. Play again starts a fresh game.
- [ ] Non-admins can't change the game state, even by calling the backend directly.
- [ ] Teammates see each other moving on the map within a few seconds; the other team never receives your position.
- [ ] A phone that stops sending shows greyed with its age; leaving the day stops sharing.
- [ ] Closing and reopening the app mid-game shows the right state and clock.
- [ ] One hour live with the screen on: note battery used on each phone (normal vs battery saver).
