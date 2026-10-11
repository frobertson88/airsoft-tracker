# Airsoft app architecture

Status: initial technical boundaries, 5 October 2026. This is a guide for implementation, not a requirement to build every future system now. [App flow](app-flow.md) owns the shared journey and player-facing lifecycle; [game modes](game-modes.md) and the [feature documents](README.md) own gameplay defaults and unresolved rules.

## 1. Ownership and lifetime

Separate the lasting Game Day (event/session) from an individual game round.

| Concept | Owns / represents | Lifetime |
| --- | --- | --- |
| Game Day | Players, teams, sections, field, registered devices and points | Across games |
| Game | Selected teams, mode/config, lifecycle, medic rules, runtime state, results | One round |
| Player membership | Team, section and authorised roles | Game Day; retained by default |
| Player game state | Wounds, participation, active effects | One round |
| Field point | Named location and linked device identifiers | Reusable across games |
| Objective / Mission instance | Steps, ownership, progress, rewards | One round |
| Marker | Audience, creator, position and lifetime | Explicit Game Day or game scope |
| Score entry | Award/reason, team/player, game and unique grant ID | Recorded history |

Starting a new game normally retains teams/sections and resets round state. Clearing teams is an explicit admin action between games. Historical results retain the relevant team identity/name even if the roster changes. Game Day standings derive from recorded results; do not reuse a mutable game-score field for both purposes.

## 2. Small implementation with clear boundaries

Start with one backend application and one shared mobile client codebase if practical. Keep ordinary modules and typed interfaces; no microservices, dynamic plugin loader, general rule language or event-sourcing platform is required.

| Module | Responsibility |
| --- | --- |
| Core | Identity, Game Day membership, permissions, game lifecycle and game clock |
| Tracking | Location observations, freshness/accuracy, area membership |
| Devices | Device registration, NFC/Bluetooth adapters, normalised interactions |
| Medic | Hits, wounds, treatment eligibility and revival |
| Objectives | Mission progress, point ownership and completion |
| Scoring | Idempotent awards and score totals |
| Effects | Scoped, timed modifications to capabilities and rules |
| Map / Notifications | Authorised views and delivery of state changes |
| Game modes | Compose shared modules into KOTH, Deathmatch and Mission behaviour |

Build only modules needed for the current slice. A static mode registry is sufficient. Each mode validates configuration, initialises round state, handles accepted inputs/ticks and evaluates its end conditions. Lifecycle and permission checks remain shared.

## 3. Commands, state and events

Clients request actions; the backend validates and applies them. The backend owns accepted gameplay state, score, random outcomes and time. UI components render state and submit commands; they do not decide winners or grant rewards.

Example: `SubmitScan` identifies the actor, device, game and request ID. The backend checks membership, game state, device mapping, permissions and applicable mission/medic rules. It commits the state change and any reward together, then emits an accepted event such as `MissionStepCompleted`.

- Commands express intent: `ReportHit`, `TreatPlayer`, `SubmitScan`, `StartGame`, `PauseGame`, `PlaceMarker`.
- Events express accepted facts: `PlayerWounded`, `PlayerRevived`, `HillMoved`, `ScoreAwarded`, `GamePaused`.
- Include Game Day/game IDs, actor where applicable, unique command/event IDs and authoritative timestamps. Version evolving payloads.
- Duplicate requests must return the original outcome without repeating transitions/rewards. Reject stale commands for a previous game.
- Use ordered state revisions so reconnecting clients can replace stale state with a current snapshot.
- Keep durable state and a useful audit trail. Persist publication work with the change, or provide equivalent retry/reconciliation, so a missed notification does not lose gameplay state.

Events are a useful contract between modules; an external message broker is unnecessary initially. Explicit orchestration should own each transition, avoiding chains of listeners that can recursively award scores or mutate state unpredictably.

## 4. Shared lifecycle and clock

`SETUP → COUNTDOWN → ACTIVE ↔ PAUSED → FINISHED`.

These technical states correspond to Ready, Countdown, Live, Paused and Complete in [app flow](app-flow.md#13-state-and-data-boundaries). Countdown cancellation, resume defaults and player alerts are defined in [start, pause and resume](app-flow.md#8-start-pause-and-resume).

Resume countdown remains paused until activation. Admin can cancel a countdown to its preceding state or end any unfinished game. Make transitions explicit and reject gameplay commands unless the game is active. Device/location observations may still arrive while paused without advancing gameplay.

- Duration is either a positive finite value or unlimited; avoid magic large numbers.
- Track elapsed active game time on the backend. Freeze it during pause and resume countdown.
- Hill relocation, score accrual, defend progress, wounds and gameplay effects use that clock. Identity/authentication expiry and observation freshness use real time.
- Evaluate timers from elapsed time, not from counting client ticks. Persist clock state so a backend restart can recover it.
- Lifecycle state is always visible. Alerts are additional delivery, not the source of truth; notification failures cannot change game state.

## 5. Devices and location are evidence

A registered device has an ID, transport/type, capabilities and a binding to a player, point or prop. NFC cards contain an opaque identifier; trusted game meaning comes from the backend binding and current game. Do not store mutable mission rules or scores on cards.

Adapters normalise scans, observations and proximity reports. NFC scanning must work for multiple purposes without knowing medic/scoring logic. Keep actor and scanned target separate: revival requires an authorised second party distinct from the wounded player.

Bluetooth proximity does not inherently provide GPS coordinates. A beacon may only expose identity/proximity; a phone can attach its own observed location with source, accuracy and timestamp. Never describe that as the item's verified position.

For KOTH, compute eligible presence from current observations and an explicit freshness/accuracy/boundary policy. Use the full circle when validating random hill placement. Generate randomness on the backend and record chosen outcomes. Missing GPS/network data is uncertainty, not death or elimination.

NFC identifiers and phone GPS are not strong proof against cheating. Reserve a validation policy and admin override with an audit reason; stronger proximity/identity checks can be added if needed.

## 6. Effects and medic rules

Represent an effect with ID, known type, source, game, target scope, active-game start/expiry and validated type-specific parameters. Targets can be player, section or team. Begin with fixed supported types and explicit handlers, rather than arbitrary scripted effects.

Define stacking, replacement and expiry for each implemented effect. Game boundaries clear game-scoped effects. Compose effective capabilities from base roles, medic restrictions and active effects.

Medic owns wound progression and legal treatment. A wound may impose effects, but store its progression once rather than duplicating competing wound flags. Deathmatch asks medic whether a team has a legal continuation/recovery path. It must not infer elimination from `alive == 0` or all players being injured.

GPS blackout modifies the recipient's map view while server-side tracking/control continues. Specify which information it suppresses and how it interacts with objective/hill visibility when that perk is scoped. UV remains a reserved idea until its gameplay meaning is known.

## 7. Permissions and information visibility

Roles grant capabilities; Player/Admin UI mode selects the view. An admin who plays uses normal player gameplay actions tied to their own membership. Admin operations require explicit authorised commands, targets and audit entries.

- Player markers target their own team or section. Enemy is a sighting classification, not an enemy-team audience.
- Admin marker targets can include authorised teams/sections across the Game Day. Commander targets are restricted to their authority.
- Filter map state, locations, objectives and notifications on the backend. Hidden opposing locations or GPS-blackout data must not be sent and merely concealed in the UI.
- Re-evaluate subscriptions and clear cached privileged data on role/mode/effect changes. Keep recipient-specific views separate from authoritative game state.

## 8. Connection loss and implementation guardrails

Show connection quality, stale locations and pending actions. Initial default: gameplay-changing actions require backend acceptance; offline scans/hits are not silently treated as successful. Add delayed submissions only with explicit conflict rules. Disconnection is never automatic player death.

Agreed offline scope is recorded in [NFC interactions](nfc-interactions.md#pending-offline-scans) and [medic gameplay](medic-gameplay.md#offline-hit-and-provisional-medic-step): queue captures/mission scans, hold offline hits with a provisional local medic estimate, and keep treatment/respawn online. Estimates are not authoritative transitions. Ended-round pending scans require an explicit admin results-review path, distinct from ordinary gameplay commands; its conflict/review mechanics must be defined before implementation.

On reconnect, obtain current authorised state, lifecycle, time and revisions. Repeated taps and retries cannot double-award. Decide and communicate backend-outage/restart clock policy before field testing; do not assume all players receive immediate alerts.

Rules for Codex/Claude implementation:

1. Follow existing feature scopes; label new gameplay defaults rather than inventing them silently.
2. Keep rules out of screens, transport adapters and map widgets.
3. Keep mode-specific rules in modes; shared lifecycle, score, permissions and device handling stay reusable.
4. Keep persistent Game Day membership separate from round state.
5. Use one authoritative clock, accepted state and permission policy.
6. Make commands/rewards idempotent and state changes atomic.
7. Build fixed modules first; add abstractions only when actual features need them.
8. Verify meaningful boundaries: pause/resume, duplicate scans, stale locations, visibility restrictions, medic viability and retaining teams between games.

Suggested first slices: Game Day/teams + lifecycle + authorised map; KOTH with optional scoring; fixed medic + Deathmatch; ordered NFC Patrol. Then richer missions, random templates, perks and Bluetooth props. These are sequencing suggestions, not a current implementation plan. Resolve the relevant [game-mode](game-modes.md) and [feature](README.md) open rules before implementing each affected slice.

## 9. Technology stack

Agreed 10 October 2026 for the first build stage; revisit only if a later stage proves it unsuitable.

| Part | Choice | Why |
| --- | --- | --- |
| Mobile app | Expo (React Native) with TypeScript | One codebase for iPhone and Android; test on phones without app-store builds. |
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions | One hosted backend; database rules enforce permissions; Realtime pushes state changes. |
| Game commands | Postgres functions (RPC) or Edge Functions | Keeps validation and state changes on the backend, per section 3. |
| Maps | Built-in maps via `react-native-maps` (Apple Maps on iPhone, Google Maps on Android), chosen 11 October 2026 | Works in Expo Go with satellite view and no account for testing; Android release builds need a free Google Maps key. Revisit MapLibre/Mapbox if offline maps become essential. |

Clients read through Row Level Security and change gameplay state only through backend functions, never by writing tables directly.
