# Dog-tag gameplay

Planning specification for virtual dog tags and scoring. Use [NFC interactions](nfc-interactions.md) for scans, [medic gameplay](medic-gameplay.md) for life/death transitions, and [app flow](app-flow.md) for game lifecycle and assignments.

## First version

- Agreed: dog-tag capture is on by default for a new game, with an organiser toggle to disable it per game. Show the setting in configuration/start review; live setting changes need a separate policy.
- When dog-tag capture is enabled, death makes one virtual dog tag available for the player's current life.
- An enemy physically reaches the dead player and scans their existing NFC wristband to capture it.
- Agreed: any living, in-play enemy can capture; wounded/out-of-play, dead, withdrawn and not-yet-admitted players cannot. Friendly and self scans award nothing; friendly recovery is outside the first version.
- Agreed: one successful capture always awards one point to the capturing team and increments the acting player's individual capture count. A per-game point-value setting is outside initial scope.
- Agreed: a friendly scan may reveal a dead teammate's status under medic assessment rules, but does not capture, recover or deny the tag; it stays available to eligible enemies until capture or a permitted life transition.
- Only one successful capture can exist for a life. Repeated scans, retries and simultaneous attempts cannot award additional points.
- Capture does not treat or respawn the victim. Medic gameplay owns those transitions.

## Capture flow

`Enemy scan → identify victim → load current life → validate → capture once → award +1 → show confirmed result`

At commit time, validate that:

1. The game is Live and dog-tag capture is enabled.
2. Actor and victim are participating in the same game with valid team assignments.
3. The actor is another living, in-play player on an enemy team, using the current Game Day assignment reflected in the game's participation state. Admin corrections follow the app flow's pause/history rules.
4. The victim is dead and the requested life is still their current life.
5. That life's tag is available.

Apply the capture and score award together in authoritative app/server state. Enforce uniqueness by game and life so competing requests cannot both succeed. A stale scan from before respawn must not capture a new life's tag.

Show the confirmed victim, team and `+1` on success. Show a clear refusal such as `Player is not dead`, `Enemy players only` or `Dog tag already captured` without awarding points. Shared NFC rules cover unknown tokens, action selection and unconfirmed/offline results.

## Life and respawn

Each life starts without an available tag. Death makes it available; capture locks it for that life. Where the mode/rules permit respawn, an authorised second party may respawn a dead player whether or not the tag was captured. TDM prohibits respawn regardless of capture status. Respawn ends eligibility for the old life's uncaptured tag and starts a new life; no delayed capture of the previous life is allowed.

Retain the previous life's death and capture history. If the player dies again in the new life, a new tag becomes available. Never reset the old capture record to make the wristband reusable: the wristband identifies the player, while the life identifies the capture opportunity.

## State and history

Suggested capture fields, not an existing schema:

| Field | Meaning |
| --- | --- |
| `capture_id` | Unique successful capture. |
| `game_id`, `life_id` | Game and victim life; at most one capture for this pair. |
| `victim_player_id` | Dead player whose tag was captured. |
| `captured_by_player_id` | Acting player. |
| `capturing_team_id` | Team credited at capture time. |
| `captured_at` | Confirmed capture time. |

Record `DOG_TAG_CAPTURED` in the game action history with the capture reference, victim, actor, credited team and time. Preserve attribution when assignments later change. Medic owns hit, treatment, death and respawn history.

## Scores and game lifecycle

Display team dog-tag totals and the player's individual capture count separately from mode scores. Agreed initial scope: keep capture as an optional feature, without adding a standalone Kill Confirmed / Dog Tag mode. Capture totals do not change the agreed KOTH, TDM or Patrol winner rules; any integration into mode scoring needs a separate decision.

Freeze captures during pause/countdown and reject them after completion. Starting or restarting a game creates fresh capture totals and player lives while retaining completed results, day assignments and NFC bindings.

Before implementing a standalone scoring mode, define its victory/tie rules and departure policy in its mode plan. The first capture loop only defines one point per valid capture.

## Future rules — outside the first version

- **Tag recovery/denial:** a friendly scan can deny an enemy's capture opportunity.
- **Bounties:** roles can carry different tag values, such as leader = 2 or VIP = 5.
- **Other scoring modes:** configure how confirmed captures contribute to victory.

These belong to game-mode rules and reuse the same player identity and life boundaries. Do not build a generic rules engine before testing the simple gameplay loop in a real game.
