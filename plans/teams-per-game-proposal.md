# Proposal: team count per game and reassignment (12 October 2026)

Status: built 12 October 2026 as Stage 5 (migration 0006 applied), with admin Move hill for KOTH; waiting on phone testing. Fraser chose Shuffle as the default when the team count changes.

Today every Game Day has exactly two teams (Blue, Red), fixed in the database.
[App flow](../docs/app-flow.md) already lists "number of teams" in game setup and a
confirmed **Clear Team Assignments** action between games.

## Proposal

1. **Teams in game setup (2, 3 or 4):** shared by every team mode (Free play, KOTH,
   later TDM) and saved in setups. Colours Blue, Red, Yellow, Purple. Day roles and
   past results are never touched.
2. **When the host sets up the next game, choose how teams are filled:**
   - **Keep teams** (default when the count is unchanged). New teams start empty;
     players on a removed team must pick again.
   - **Shuffle**: random, balanced teams (sizes differ by at most one). Sections are
     cleared because they belong to a team.
   - **Clear**: everyone picks again.
3. **Team changes lock while a game is running**; players can switch between games.
4. **Prompting players:** anyone without a team, or whose team changed, gets a full-screen
   "Pick your team" / "You're now on Red" card on the Game tab with a buzz.
5. **Host before Start:** "3 players have no team" with **Start anyway**. Players with no
   team sit the game out (not counted for KOTH).

## Open choices

- Default when the count changes: **Shuffle** (decided 12 October 2026).
- Block Start or warn: warn (built).
- Shuffle keeps sections together: later option, not in the first version.
