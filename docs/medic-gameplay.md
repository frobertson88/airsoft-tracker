# Medic gameplay

Planning specification for medic gameplay. The first version uses simple mode; advanced/custom modes below are future work. Shared scanning behaviour is defined in [NFC interactions](nfc-interactions.md), capture/scoring in [dog-tag gameplay](dog-tag-gameplay.md), and game lifecycle in [app flow](app-flow.md).

## Common rules

- Track wounds and hit progression per player, per game life.
- A wounded player must complete the required treatment before returning to play. A dead player must use the configured respawn/return process.
- Returning to play requires an authorised second party to scan the player's NFC wristband and complete the allowed action. Players cannot treat/reset themselves through the app.
- Treatment permission and permission to return a dead player are separate game settings. A medic, team member, marshal or respawn controller may act only where the rules allow it.
- Treating a wound preserves the current life and hit progression. Returning from death starts a new life and clears wounds and progression.
- A scan identifies the player; it does not by itself grant treatment or respawn permission.
- Mode restrictions also apply: [TDM](game-modes.md#team-deathmatch) forbids respawn for the round regardless of a saved ruleset's return permissions. A death expiry outcome in TDM does not enable respawn.

## Reporting and revealing an injury

Agreed player-facing flow: **I'm hit → Awaiting medic scan → authorised medic scan reveals the assessment → permitted treatment/return action**.

On Map, I'm hit is a direct button at the bottom, separate from navigation. There is no self-medic icon on the left toolbar; a separate status label shows the player's known/pending condition. After an accepted report, show **Awaiting medic scan** and an out-of-play instruction. Do not reveal the new wound, death assessment, treatment instructions or new progression count to the player until a medic scans their wristband.

An assessment scan and treatment are separate actions: revealing the assessment does not return the player to play. Treatment still needs physical completion and authorised confirmation. Self-scanning must not reveal or clear an injury. On the next accepted hit, hide the new assessment again until the next medic scan.

After an accepted hit report, open a full-screen **Hit** view (agreed 11 October 2026, see [design direction](design-direction.md)): **Hit · awaiting medic**, a large **Bleed out** countdown, a reminder that the injury is revealed when a medic scans the wristband, the nearest permitted helper with distance, direction and **Ping**, and **View map**. On Map, the I'm hit button shows the same **Bleed out · MM:SS** countdown in its place. It is a timer, not a repeat-hit or self-treatment action. Navigating away and returning must not restart it. An assessment scan alone does not clear it; the preview clears it after confirmed treatment and restores I'm hit.

Agreed timer settings: the organiser sets the bleed-out duration separately for each game; each selected medic ruleset chooses either **death with configured respawn rules** or **remain out of play awaiting help** at zero. Reaching zero must not itself disclose a hidden assessment. Freeze bleed-out timers while the game is paused and continue from the remaining time when live play resumes, including keeping them frozen during a resume countdown. Completed authorised treatment clears the timer; the next accepted hit starts a fresh timer using the game's configured duration without resetting life progression. Assessment-specific timer changes, respawn clearing and reconnect handling still require definition.

Agreed default bleed-out duration: **10 minutes**, adjustable per game. Allowed minimum/maximum and input validation remain to be defined. The saved preview's two-minute example is superseded as a default but has not been changed in this documentation-only review.

The mockup uses an illustrative two-minute timer and clamps at 00:00 without inventing an automatic death or revealing a hidden assessment. It has not been updated to implement these configurable gameplay rules. Authoritative timer/expiry gameplay is not implemented by this visual preview.

Pending assessment is a player-facing disclosure state, separate from authoritative participation/injury state; it does not count the player as active. Retain accepted history and any selected random outcome rather than rerolling on subsequent scans.

Agreed assessment permission: another person may reveal the injury if the ruleset permits them to treat that specific injury. This may be a medic or another player, depending on the wound's helper settings; there is no blanket medic-only restriction. Resolve eligibility against the hidden authoritative injury before disclosing it. A refused scan must not expose the assessment. Any teammate may scan a dead player to reveal their status, but this does not grant respawn permission. Self-scanning remains prohibited. Outcome-selection timing still requires agreement before gameplay implementation. The preview illustrates a medic/helper scan, not actual NFC or permission validation.

## Simple mode

See the separate offline workflow below: an estimated next step is provisional and does not replace accepted injury state.

Use a fixed three-hit sequence within each life:

| Hit | Result | Return to play |
| --- | --- | --- |
| First | Leg wound; bandage required | Authorised second party confirms bandage/treatment through a wristband scan. |
| Second | Arm/hand wound | Authorised second party confirms the required treatment through a wristband scan. |
| Third | Dead | Authorised second party completes the configured respawn/return action through a wristband scan. |

Treatment after the first or second hit does **not** restart the sequence. For example: leg wound → treated → arm/hand wound → treated → dead → respawn → new life.

Before the game, specify who can treat each wound and the physical treatment required for an arm/hand wound. Movement/weapon restrictions are field rules; the app should display the configured instructions.

Agreed initial rule: ignore further hit reports while the player is wounded, including while their wound assessment is still hidden. Do not advance progression, add another wound or restart the timer. After authorised treatment returns the player to play, the next accepted hit advances the sequence. An admin may undo an accidental accepted hit with a recorded reason. If treatment, subsequent hits or tag capture have followed, require explicit review of affected actions and scores rather than forbidding undo or silently reversing them. Preserve the original audit trail; exact dependent-state correction mechanics still need definition. This replaces the earlier proposal to advance on a hit while awaiting treatment.

## Offline hit and provisional medic step

Agreed: I'm hit without a connection is stored as pending and immediately shows **Out of play — hit pending**. Do not show submission failure as if no hit occurred. Preserve the original game/life, last confirmed state and request identity for later validation.

Use the player's last confirmed progression and the selected game's copied medic rules to make a local best estimate of the next step. For simple mode, estimate leg → arm/hand → dead from that progression. Keep it provisional and keep the new assessment hidden until an authorised scan, as in the normal disclosure flow. If state/rules are missing or ambiguous, show assessment pending instead of inventing an outcome. Do not generate or reroll a random wound locally.

One unresolved hit is enough to hold the player out of play; repeated taps must not advance estimated progression or restart a timer. A provisional countdown may use the cached game duration and last known lifecycle, visibly marked pending. It cannot authoritatively apply death, change scores or return the player to play. Timer reconciliation when pause information was unavailable remains to be defined.

On reconnect, submit the original hit and reconcile the estimate against authoritative state, without applying it twice or resetting the life. Display the accepted state or a clear correction/refusal. Agreed: reject a pending offline hit that arrives after its original round ends; unlike queued capture/mission scans, it does not enter ended-round admin review. Do not apply its provisional state to a later round. Offline treatment/respawn confirmations remain unavailable under the chosen scan policy; the estimate keeps the player's pending medic workflow available, not a confirmed recovery path. Submission timing and stale-state conflict handling still need implementation detail.

## Reusable medic rulesets

Agreed UI direction: organisers create named rulesets reusable across all Game Days they organise, and admins select one independently of game type. The saved ruleset library is reachable from **Home → Your kit → Medic rules** and from the Host tab, with a ruleset picker in game configuration.

Agreed screens (11 October 2026, see [design direction](design-direction.md)): the library lists each set with a hit-by-hit summary (for example Leg · Arm · Dead), its expiry outcome and helpers, and marks the default. The editor shows the hits as tabs; each hit has the instruction shown to the player and chips for who can treat it (or, for death, who can bring them back), plus one choice for what happens when bleed-out reaches zero. The bleed-out length stays a per-game setting. The medic's scan screen names the player, then reveals the wound, hit number, remaining bleed-out time and treatment, with one **treatment done** confirmation that returns the player to play.

The first editor retains the simple leg → arm/hand → dead sequence. Configure the name, physical treatment and permitted helpers for each wound, field instructions, and separate respawn permissions/instructions. No self-treatment or self-respawn; treatment retains hit progression and respawn starts a new life.

When saving a Ready game's configuration, copy the selected rules into the game. Show that copy in start review and player Rules. Later edits to the saved ruleset do not silently change an existing game. Agreed: admins may explicitly change the game's copied medic rules while paused, with player notification and retained rule revisions. Do not edit during live play or countdown.

Agreed transition: apply changed medic rules to future hits only. Existing injuries retain the rules under which they were assigned, including their treatment/helper requirements. Existing bleed-out timers stay unchanged if duration changes; new accepted hits use the new game duration. Keep enough rule-version context for current injuries and historical actions, without resetting life progression or bypassing TDM restrictions. The version used for pending offline hits still needs definition.

Agreed storage scope: an organiser's saved rulesets persist across their Game Days. Any admin of a Game Day may edit saved medic rulesets available to that day and select/configure a game's copy; these rights do not grant access to unrelated organisers' libraries. Saved-set edits affect future selections, without changing existing game copies. Cross-organiser sharing and advanced sequence/random editors remain future work. Reusable simple sets do not replace mode-specific recovery/viability decisions.

## Random wounds (built 24 October 2026)

A medic ruleset picks **Wounds: In order** (the simple sequence) or **Random**. A random set keeps the Dead hit and adds a list of 1–12 wounds, each with a name, instruction, who can treat it, a **chance** (1–100, weighed against the others and shown as a percentage) and a **fatal** switch. On each accepted hit before the set's **dead on** hit (2nd–5th, default 3rd), the server picks one wound by chance and stores it on the life; scans never re-roll it, and it stays hidden until an authorised scan as above. A fatal wound (for example a head shot) is dead at once, and bringing the player back follows the Dead hit's helpers. Bleed-out expiry to death also follows the Dead hit. Built-in **Random wounds**: leg 40% (teammate or medic), arm 30% (medic), chest 20% (medic), head shot 10% (fatal). Schema: `supabase/migrations/0011_random_wounds.sql`.

## Advanced/custom mode — future work

Replace the fixed sequence with configured wound rules. Each wound needs only:

| Setting | Purpose |
| --- | --- |
| Name and instructions | What happened and what the player must do. |
| Treatment and permitted helpers | Required treatment and who may complete it, such as a medic or another team member. |
| Further-hit rule | Whether another hit is allowed in this state; if accepted, whether it replaces/adds a wound, advances the sequence or causes death. |
| Treatment result | The state after treatment and whether the player may return to play. |

Support these selection options:

- **Random:** choose from the configured eligible wound pool when a rule calls for a wound. Store the selected result; scanning or reopening the screen must not reroll it.
- **Planned/custom sequence:** follow an ordered list of wound steps with explicit treatment and next-hit outcomes. Define the final step's outcome, such as death; do not silently wrap to the start.
- A sequence step may choose a random wound from a specified pool if the organiser enables that option.

If another hit is not allowed in a state, do not advance progression; show the configured instruction. This is a game-state rule, not permission to shoot a player who is out of play.

Example custom sequence: leg wound (team member may bandage) → arm wound (medic only) → dead. A different configuration may make a further accepted hit while wounded immediately fatal.

## Implementation notes

Keep the current life identifier, status (`IN_PLAY`, `WOUNDED`, `DEAD`), progression position and active wound(s), plus the action history described below. These are suggested implementation names, not an existing schema.

On treatment/return, validate the actor is another person, their role/team permissions, the current player state and the selected game rules before applying the transition. Reject repeated or stale actions without advancing progression twice.

When dog-tag capture is enabled, [dog-tag gameplay](dog-tag-gameplay.md#life-and-respawn) owns tag availability, capture and score rules. Medic owns wound/death/return transitions; respawn does not require a capture first.

Give each life a stable identifier and a life number within the game. Start a new life on respawn, retaining the previous life's history. Record `PLAYER_HIT`, `WOUND_ASSIGNED`, `PLAYER_TREATED`, `PLAYER_DIED` and `PLAYER_RESPAWNED` with game, life, player, actor where applicable and time. Treatment also records the wound and treatment performed. Reject hits/treatment for dead players; only the authorised respawn action starts a new life.

The app flow freezes gameplay actions during pause/countdown and ends them on completion. Apply those lifecycle checks when committing medic actions. A new game starts fresh player lives and progression while retaining prior results.
