# Airsoft game modes

Status: initial design scope, 5 October 2026. Proposed defaults and open decisions are labelled. Technical boundaries live in [architecture](architecture.md); the shared journey lives in [app flow](app-flow.md).

## Shared behaviour

Follow [app flow](app-flow.md#8-start-pause-and-resume) for countdowns, pause/resume defaults and alerts, and its [new-game rules](app-flow.md#10-end-restart-and-next-game) for assignment persistence, fresh round state and retained results. Modes add their own setup, progress and end conditions below.

- Each game selects its participating teams. If no restriction is set, use all active Game Day teams. Deathmatch requires at least two.
- Every mode supports a finite duration or unlimited duration. Unlimited removes the time limit; natural win conditions and admin End still apply.
- Select a medic ruleset independently of the game mode. [Medic gameplay](medic-gameplay.md) owns treatment and return-to-play rules.
- Reconnecting players restore their current authoritative team, injuries, life and participation without admin approval, rather than resetting state or replaying old alerts. Day admins may admit new late arrivals while live, starting in play on their first life; existing participants cannot use readmission to reset life/injuries. Safe entry and mode-specific validation follow [app flow](app-flow.md).

## King of the Hill

**Goal:** control a circular zone by having the most active players inside it.

### Setup

- Admin marks the allowed hill-placement area on the field map.
- Configure hill radius, participating teams and finite/unlimited game duration.
- Scoring is optional; when enabled configure a points-per-second rate.
- Agreed: the organiser chooses a fixed hill for the round or automatic relocation at a configured interval. Fixed means the randomly selected initial location stays in place, not manual initial placement.
- Agreed: place the initial hill randomly, with the entire circle inside the allowed area and outside all No-go/Danger areas and any other configured exclusions. Apply the same exclusions on relocation. Manual initial placement is outside the agreed initial scope. Reject setup if no valid placement exists.

### Play

- All participating players see the current hill.
- Count eligible active players inside the circle, grouped by team.
- A unique highest count controls the hill. Agreed: equal highest nonzero counts mean contested and nobody accrues score, including the previous controller. Zero eligible players means uncontrolled.
- Only the controlling team accrues score, when scoring is enabled.
- On relocation, choose another valid random location, notify players and recompute control. Pause freezes the relocation clock.
- Dead and wounded players unable to participate do not count. GPS blackout affects what a player sees; it does not remove their actual position from control calculations.

### End

- Agreed: at the time limit or an early admin End, highest score wins when scoring is enabled; equal scores draw. With scoring disabled, finish without an automatic winner.
- Unlimited games continue until admin ends them. A score-target ending could be added later.

**Before implementation:** define scoring-rate defaults/limits, hill radius and relocation interval validation. Agree location freshness, accuracy and boundary tolerance. Stale/missing locations are unknown, not proof that a player is outside or dead; the UI must show uncertainty. GPS alone cannot guarantee physical occupancy.

## Team Deathmatch

**Goal:** eliminate the opposing teams until only one team can continue.

### Setup and play

- Select two or more teams, a medic ruleset and finite/unlimited duration.
- Hits, wound progression and treatment follow that ruleset.
- Agreed: no respawning during TDM, even if the reusable medic ruleset otherwise permits it. Validate and display this mode restriction in configuration/start review; a dead player stays out for the round. Treatment of wounds remains available where the rules permit it.
- A team can be eliminated even when some players are injured rather than dead: no member can continue or recover through a legal action available under the selected rules.
- Agreed: automatically end when only one viable team remains; that team wins. Simultaneous elimination of all teams is a draw. Automatic ending is not an organiser toggle in the initial scope.
- Agreed: at time expiry or an early admin End, the team with the most players currently in play wins; equal highest counts draw. Wounded, dead, withdrawn and not-yet-admitted players do not count as in play. Do not turn missing GPS or connection loss into an injury/elimination.
- Agreed departure policy: explicitly leaving during the round marks the player withdrawn. They cannot participate or help others recover and are excluded from team viability and the time-expiry in-play count. Retain their life/injury and accepted history; withdrawal is not a death or respawn. Recompute viability using the accepted withdrawal. Connection loss alone is not withdrawal, and reconnect must not undo an accepted departure.

**Before implementation:** define team viability for each supported medic ruleset, including who can treat whom, wound restrictions and delayed recovery under the no-respawn rule. All players being injured does not by itself establish elimination if legal recovery remains possible. Disconnection is not elimination. Where viability is uncertain, flag it for admin rather than ending automatically. Resolve concurrent elimination/treatment/withdrawal/end ordering and re-entry after withdrawal before implementation. Late first-life admission and early-end count results are agreed.

## Objective / Mission mode

**Goal:** complete missions that reference physical points on the field.

### Points and setup

- Register reusable named points, for example Points 1–10, and link each to an NFC card. The card identifies the point; its mission is defined by the current game.
- Admin selects available points, participating teams, finite/unlimited duration, missions and optional rewards.
- Missions can be planned or generated from approved templates. Random generation chooses valid points for a template, rather than inventing arbitrary instructions.
- Missions can differ between teams. Later, paired templates could deliberately give one team Defend 6 and another Capture 6.

### Initial mission primitives

| Primitive | Example | Completion evidence |
| --- | --- | --- |
| Visit / Patrol | Scan 1 → 5 → 6 | Valid scans of the required points in order |
| Defend | Activate 6 and hold for 5 minutes | Activation scan plus the agreed retention rule for the required time |
| Capture | Take Point 6 | Valid scan accepted under the point's capture rules |
| Deliver | Collect at 2, deliver to 8 | Accepted collection then delivery scan; carrier rules must be defined |

- Support a simple linear sequence: Patrol 1 → 5 → 6, then Defend 6, then Deliver 6 → 9.
- Reveal/activate the next step only after the preceding step completes.
- Grant each completion/reward once, even if scans are retried.
- Branching missions, a scripting editor and complex random opposition scheduling are deferred.

### Proposed first implementation

Start with planned ordered Patrol missions, then template-generated Patrol. Add Defend, Capture and Deliver after their completion rules are agreed. The four primitives are the target scope; Patrol is the smallest usable slice.

Built: see [patrol.md](patrol.md) for the Patrol game as built on 24 October 2026.

### Agreed Patrol rules

- Mission progress belongs to the assigned team, not a section or individual. Any admitted, in-play member of that team may scan the required point; successive steps need not use the same player.
- Reject an out-of-order scan and show the team's required next point. Do not save it to complete a future step later. Scans from wounded/dead/withdrawn or unassigned players do not advance progress.
- On completion, award the organiser-configured points for that mission once and automatically activate the team's next queued mission while the round remains live. If the queue is exhausted, show all assigned missions complete; do not invent or repeat missions.
- When the round ends, the highest accumulated mission score wins, with equal highest scores drawing. Scores come from accepted configured rewards, not simply counting missions. With scoring disabled, finish without an automatic score-based winner.
- Agreed: the organiser selects the queue-completion ending in game options: continue until time limit/admin End, end when the first team finishes its full queue, or end when every participating team finishes its full queue. Finite time limits and admin End remain available whichever option is selected. Triggering an end does not change the highest-mission-score winner rule.
- Agreed Patrol departure: mark a leaving player withdrawn, preventing further mission scans/participation while retaining the team's accepted mission progress and rewards. Other eligible teammates can continue without admin review. Preserve attribution/history; connection loss alone is not withdrawal. Do not clear progress or replay completed rewards when the player leaves.

**Before implementation:** define reward defaults/limits, mission queue validation (including empty queues), simultaneous completion/end ordering and re-entry/permission checks for pending scans. Patrol withdrawal preserves team progress and late new participants start on their first life. For later primitives, define defend interruption/loss and presence evidence; capture ownership/repeat scoring; delivery carrier/death rules; and mission replacement. Two scans alone prove a visit sequence, not transport of a physical object. A single NFC scan proves an interaction, not continuous presence.

## Cross-game mechanics and later extensions

Keep NFC identity, medic, map markers, roles, notifications and scoring reusable across modes. Leave room for dog-tag collection, Bluetooth props, perks, GPS blackout/reveal, UV, commander abilities and further objectives without implementing them now. UV's exact meaning remains to be defined.

Use [map marker targeting](map-marker-targeting.md) for audiences, commander permissions and Player/Admin visibility; these rules are shared across modes.
