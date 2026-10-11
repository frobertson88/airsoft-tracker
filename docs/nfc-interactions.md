# Shared NFC interactions

Shared contract for player wristband scans. Feature rules belong in [medic gameplay](medic-gameplay.md) and [dog-tag gameplay](dog-tag-gameplay.md). See [app flow](app-flow.md) for game lifecycle and assignments.

## Identity and state

- An NFC wristband is a player identity token. Its identifier resolves to a registered player in the current game.
- Wounds, life/death status, treatment, roles, team membership and dog-tag captures belong to app/server state. Do not write changing gameplay state onto the wristband.
- The scanning app identifies the acting user separately from the scanned player. Possessing or scanning a wristband is not proof of permission to perform an action.

## Shared flow

Agreed UI direction: use a generic **Scan** action for player wristbands and objective tags. On Map it sits in the left toolbar; other main Game Day screens expose it through bottom navigation. The app resolves the tag and current game context. An eligible enemy dog-tag scan captures automatically after validation, with a compact confirmed result and no extra Capture button. Treatment still requires confirmation that physical treatment is complete; multiple eligible actions require a choice. Objective scans follow the current mission's rules.

Phone scanning UI is platform-dependent. An iPhone reader session uses the system scanning sheet; background tag reading uses a notification handoff and does not promise automatic locked-screen capture. The preview simulates detected tags and does not read NFC hardware.

`Scan wristband → resolve player → load current game state → offer contextual action → validate and apply → show result`

1. Read the identity token and resolve it to a player in the active game. Unknown or unassigned tokens produce a clear error and no gameplay change.
2. Use the selected feature, actor permissions and target player's current state to determine the available action. If more than one is valid, require an explicit choice.
3. Validate permissions and state when committing the action; a previously displayed option may have become stale.
4. Show the confirmed result or reason the action was refused. Repeated scans/retries must not apply the same transition or award twice. Do not show success before confirmation. Agreed: queue gameplay scans without a connection for later validation, showing Pending rather than success. Queue conflict/expiry rules must be settled before implementation; see below.

## Registration and wristband replacement

- Agreed: players may register their own wristband; admins can correct bindings. Players cannot use self-registration to bind another player's identity or overwrite an already-bound tag.
- Agreed: field-point tags are registered by admins only. Opening a registration screen does not grant point-registration authority.
- Agreed: players may replace their own lost wristband. Disable the previous binding and retain the same player identity, current life, injuries, captures and history. Replacement is not respawn or a game-state reset. Server-side uniqueness and permission checks still apply; replacement/registration needs confirmed acceptance.
- Agreed: scanning an unknown tag automatically opens registration for any user, without applying a gameplay action. Offer only registration actions the user is authorised to perform: their own wristband, or field-point registration for admins. An already-bound tag is not an unknown/free tag.

Exact registration timing, unbinding/reassignment, duplicate-tag recovery and treatment of pending scans after replacement remain open. Revoking a lost wristband must not make historical scans/captures lose attribution.

## Pending offline scans

Agreed product direction: queue dog-tag captures and mission scans offline, then submit them for backend validation after reconnect. Treatment and respawn confirmations are not queued; registration/replacement also needs a connection. Offline I'm hit has a separate provisional workflow in [medic gameplay](medic-gameplay.md#offline-hit-and-provisional-medic-step).

Pending scans must not award points, complete mission steps, clear injuries, respawn players or disclose an unconfirmed hidden assessment. Store enough context to distinguish the original game, actor, target and life/mission step, with a stable request identity; retries must not become new captures or actions. Do not reinterpret an old scan as targeting a new life or round.

Agreed reconciliation rules:

- Reject a queued scan if its target life or mission step has changed before validation; do not remap it or bank it against a later step.
- A scan may remain pending until its original round ends; there is no separate five/fifteen-minute timeout in the chosen design.
- If the round ends before reconnection, retain the pending submission for admin review before finalising results, rather than automatically applying it or discarding it. The round is no longer playable; show provisional results while review is outstanding. Review does not bypass the changed-life/step rejection rule or one-capture/reward uniqueness.

This ended-round review applies to queued capture/mission scans only. Pending offline hits arriving after round end are rejected under [medic gameplay](medic-gameplay.md#offline-hit-and-provisional-medic-step).

Before implementation, define paused/countdown submissions, ordered replay, concurrent captures, binding replacement, changed permissions, review deadlines and how the server identifies outstanding disconnected submissions. Show eventual accepted/refused/expired/review-needed results. The backend remains authoritative under the [connection policy](architecture.md#8-connection-loss-and-implementation-guardrails); the preview does not implement a queue or reconciliation.

## Feature reuse

- **Medic:** an authorised helper's scan reveals the pending assessment to the player/helper, then offers permitted treatment or return-to-play actions. Wound assessment uses that injury's treatment permission; any teammate may reveal dead-player status without gaining respawn permission. Revealing the assessment does not itself treat the player. Enforce the authorised second-party rule and the [injury disclosure flow](medic-gameplay.md#reporting-and-revealing-an-injury).
- **[Dog-tags](dog-tag-gameplay.md):** resolve the victim, then attempt capture against their current life. The feature checks that the victim is dead, the actor is an eligible enemy and that life's tag is still available.

Both features reuse identity resolution and action validation. They keep separate gameplay transitions and scoring rules; neither needs a special-purpose wristband or a separate identity scheme.
