# Patrol

Status: phase 2 built 24 October 2026 (migration 0013). Agreed with Fraser the same day as part of the Patrol game and tag library plan. Uses the field points and codes from the [tag library](tag-library.md).

## The game

Each team works through missions. A mission is one to four field points to scan, in order or in any order, with an optional time limit and a points reward. Teams see only their current mission. Two teams can be on the same point at once, and each team keeps its own progress.

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
- **Missions**: one row per mission. Each mission has a name, brief, clue, points (in order or any order), a locked point, a time limit (none to 60 minutes), a reward, which teams play it (all by default), and whether to show grid references. **Add 5 random missions** fills in a quick set from the field's points.

## Locked missions

A mission can be locked to a point. Scanning that point hands the team that mission straight away, ahead of their list. Their list mission waits with its progress kept and carries on afterwards. Its timer starts again when it resumes. A team holds one locked mission at a time.

## Playing

- **Game tab**: your team's mission card shows the brief, the clue, the points with grid references, your progress and the time left.
- **Scan tab**: during a live Patrol game, scanning a point counts it for your team's mission. It tells you if you've got the wrong point (and, for in-order missions, which one you need), if you've already scanned it, or if it gave you a new mission. A wounded player (medic rules) can't scan until they're back in play.
- **Game card**: shows each team's score and missions done, and the winner at the end.
- **Host tab**: shows each team's current mission, progress, time left and failed missions.
- A timed mission that runs out fails, and the next one starts.

## Map grid

The Map tab has a grid button. The grid is like a military map: 100 m squares numbered from the field's south-west corner, with eastings (west to east) along the bottom and northings (south to north) up the left. Nothing is highlighted, so players read the map themselves.

- **4 figures**, such as `0412`, give a 100 m square.
- **6 figures**, such as `041127`, give a 10 m spot.

Mission cards show 6-figure references for each point.

## Limits

- Hiding points and missions is what the app shows. It isn't a secret kept by the server, because day members can read the game settings and the day's field copy.
- A game only starts on the day's field it was built for, and every point it uses must still be on that field.
- Later phases: props and abilities in Your kit, extra game-only points, and director rules (intercepts, races).
