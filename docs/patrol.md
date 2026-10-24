# Patrol

Status: phase 2 built 24 October 2026 (migration 0013); mission types, finish points and marking added the same evening (migration 0014). Agreed with Fraser the same day as part of the Patrol game and tag library plan. Uses the field points and codes from the [tag library](tag-library.md).

## The game

Each team works through missions. A mission is up to four field points to scan, in order or in any order, then whatever finishes it (below), with an optional time limit and a points reward. Teams see only their current mission. Two teams can be on the same point at once, and each team keeps its own progress.

## Building a game (Hosting → Games)

Games are saved ahead of time under Hosting → Games and picked on the day from the game setup screen. A Patrol game is built against one saved field, because its missions use that field's points. Missions are saved in the game, not in the field.

Settings, in the list-row style:

- **Field**: the field whose points the missions use. A field saved before point numbers existed gets them when it's picked.
- **Mission order**:
  - **In order**: each team plays the list top to bottom.
  - **Shuffled**: each team gets the list in its own random order.
  - **Scan to get**: there's no list. Every mission is locked to a point, and a team gets that mission by finding the point and scanning it.
- **Game ends**: when time's up, when the first team finishes, or when every team finishes.
- **Scoring**: on or off. With scoring on, the team with the most points wins (a tie is a draw).
- **Points on players' maps**: any point can be hidden from players' maps for this game. Permanent points show by default. Admins in Host view still see every point, and everyone sees them all once the game is over.
- **Missions**: one row showing how many missions there are. Tapping it opens the mission list, and each mission opens on its own screen like the medic rules editor: name and brief, a type, then one row per rule. Back steps out of a mission, then out of the list. Nothing is saved until **Save game**. **Add 5 random missions** fills in a quick set from the field's points. A mission can be moved up or down, duplicated or deleted.

## Mission types

A type is a preset. It fills in the rules below, and every rule can still be changed.

| Type | What teams do |
| --- | --- |
| Recon | Scan 2 to 4 points in any order. |
| Route | Scan the points in a set order. |
| Courier | Pick up at one point, then scan the finish point to drop it. |
| Report back | Do the points, then scan the finish point (such as HQ). |
| Hold | Scan a point, hold it for a set time, then the section lead reports it done. |
| Find | Find a point from its grid reference or clue and scan it (hide the point from players' maps). |
| Task | Nothing to scan, such as rescuing the pilot. The section lead reports it and the host confirms. |
| Custom | Set every rule yourself. |

Each mission's rows:

- **Points to scan**: up to four, in order or any order. A mission a lead reports can have none.
- **Starts**: next in the list, or locked to a point (below). Scan to get games need a point on every mission.
- **Done when**: the last point is scanned; a **finish point** is scanned after the others; the **section lead reports** it done; or the lead reports and the **host confirms**. Reported missions can have a **hold** (1 to 15 minutes) that has to run after the points are scanned before the lead can report.
- **Fails when**: the time limit runs out, or a section lead or the host fails it by hand. Then the next mission starts.
- **Reward**, **Teams**, and **Clue and grid refs** (shown on the mission card).

## Marking missions during play

- **Section leads** (and an admin on the team) see **Report done** on the mission card when the mission is reported by a lead. It unlocks once the points are scanned and any hold is up. **Abort mission** fails it straight away and the next one starts.
- **The host** opens a team's row on the Host tab: **Mark done** pays the reward, **Skip** and **Mark failed** pay nothing, and all three start the next mission. A report waiting for the host shows **Check** on the right, with **Accept** and **Reject**. Reject sends the team back to finish the job. A mission waiting for the host doesn't time out.
- A failed or skipped mission costs nothing; it just pays nothing.

## Locked missions

A mission can be locked to a point. Scanning that point hands the team that mission straight away, ahead of their list. Their list mission waits with its progress kept and carries on afterwards. Its timer starts again when it resumes. A team holds one locked mission at a time.

## Playing

- **Game tab**: your team's mission card shows the brief, the clue, the points with grid references (and the finish point), your progress, any hold, and the time left.
- **Scan tab**: during a live Patrol game, scanning a point counts it for your team's mission. It tells you if you've got the wrong point (and which one you need), if you've already scanned it, when to scan the finish point, when the lead can report it, or if it gave you a new mission. A wounded player (medic rules) can't scan until they're back in play.
- **Game card**: shows each team's score and missions done, and the winner at the end.
- **Host tab**: shows each team's current mission, progress, time left, and failed and skipped missions. Open a team to mark its mission (above).
- A timed mission that runs out fails, and the next one starts.

## Map grid

The Map tab has a grid button. The grid is like a military map: 100 m squares numbered from the field's south-west corner, with eastings (west to east) along the bottom and northings (south to north) up the left. Nothing is highlighted, so players read the map themselves.

- **4 figures**, such as `0412`, give a 100 m square.
- **6 figures**, such as `041127`, give a 10 m spot.

Mission cards show 6-figure references for each point.

## Limits

- Hiding points and missions is what the app shows. It isn't a secret kept by the server, because day members can read the game settings and the day's field copy.
- A game only starts on the day's field it was built for, and every point it uses must still be on that field.
- Later: Race missions (first team wins, others fail), Stealth (a tripwire point fails it), the courier carrier rule (if the carrier is hit, go back), props and abilities in Your kit, extra game-only points, and director rules (intercepts).
