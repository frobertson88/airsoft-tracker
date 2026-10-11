# Current plan

Status: Stage 4 built 12 October 2026 (migration 0005 applied to Supabase); waiting on phone testing. Earlier stages: [Stage 1](stage1-2026-10-11.md), [Stage 2](stage2-2026-10-11.md), [Stage 3](stage3-2026-10-11.md).

## Stage 4 — King of the Hill

### Outcome

A host sets up a King of the Hill game. A random hill circle appears on everyone's map; the backend works out which team holds it from live positions, scores the holder, and declares a winner at the end ([game modes](../docs/game-modes.md#king-of-the-hill)).

### Scope

1. **Mode choice in game setup:** Free play (Stage 3 behaviour) or King of the Hill.
2. **KOTH settings:** hill radius, scoring on/off and rate, fixed hill or move every N minutes, participating teams.
3. **Hill placement on the backend:** random, whole circle inside the field boundary and clear of No-go and Danger areas; setup is refused if no spot fits. Same rules on relocation; pause freezes the relocation clock.
4. **Control:** count eligible players inside the circle per team. A unique highest count holds; tied highest is contested (nobody scores); nobody inside is uncontrolled.
5. **Scoring and end:** the holder scores while live. At time-out or admin End, highest score wins; equal scores draw; scoring off means no automatic winner.
6. **Player view:** hill on the Map tab, a status banner (Held by Blue / Contested / Uncontrolled / Unknown) and team scores on the Game tab, vibration on relocation and control changes.
7. **Saved setups:** a host can save a configured game (mode + settings) and pick it next time, like the Field Library. Agreed by Fraser 12 October 2026.
8. **Tests:** placement validity, control and contested rules, score accrual across pause, relocation, results.

### Defaults chosen

- Hill radius 25 m (10–100 m allowed).
- 1 point per second held; scoring can be turned off.
- Fixed hill by default; relocation every 5, 10 or 15 minutes as an option.
- A position counts if it is no older than 30 seconds and its accuracy is 30 m or better; others are "unknown", never "outside" or "dead".
- Tracking stays screen-on (Expo Go) for testing; Fraser will sort pocket tracking before release (12 October 2026).

### Exclusions

Team Deathmatch, medic and hits, NFC, pocket/locked-screen tracking, score-target endings, manual hill placement.
