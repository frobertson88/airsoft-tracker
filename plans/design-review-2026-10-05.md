# Current plan

Status: design review complete, 5 October 2026. No implementation stage selected.

## Scope

Bring the planning backlog into line with the agreed page previews and Field Library concept. This checkout contains documentation and previews, with no application source or build configuration. Feature behaviour stays in its owning document; [architecture](../docs/architecture.md) remains the technical authority.

The product-choice questionnaire is complete. Resolve smaller implementation details through reasonable documented defaults and validation within the selected stage; device capabilities and battery targets require measurement. No further questionnaire is planned for this review.

## Recorded direction

- [Ranger green](../docs/colour-scheme.md) throughout all pages, day and night.
- [Map layout](../docs/map-screen-layout.md): left-toolbar Scan, no self-medic icon or bottom navigation, top-right menu, bottom Report Hit replaced by a bleed-out timer after acceptance.
- [Medic gameplay](../docs/medic-gameplay.md): assessment hidden until an authorised medic scan; assessment and treatment are separate. Reusable named rulesets are selected for a game and copied into its configuration; the first editor remains simple.
- Follow-up medic choices: duration set per game, expiry outcome set by the ruleset, timers frozen during pause, saved rulesets reusable across the organiser's Game Days, and assessment permitted for another medic/player according to that injury's treatment permissions.
- Medic detail choices: expiry means death or remaining out of play awaiting help; completed treatment clears the timer and the next accepted hit starts fresh. Ignore hits while wounded. Any teammate may reveal dead-player status, without respawn authority. Any day admin may edit saved rulesets available to that day; existing game copies stay unchanged.
- [NFC](../docs/nfc-interactions.md): shared Scan entry point and automatic eligible dog-tag capture after validation, subject to platform reader/unlock requirements.
- NFC setup/offline choices: players register/replace their own wristbands, admins correct bindings and register field tags, and unknown tags open permission-filtered registration. Queue capture/mission scans until round end, reject changed target life/step and send ended-round submissions to admin review before results finalisation. Offline hits show out of play/pending and estimate the next medic step from cached player/game rules; treatment/respawn stays online and estimates are provisional.
- [Field Library](../docs/field-library.md): create/open the Game Day, then select a field before play. Creator-only template editing, independent day snapshots, admin day-layout edits before play or while paused with notifications, and instructional zones without automatic GPS warnings are agreed.
- Field detail choices: whole-field replacement while paused with review/notifications, Danger/No-go exclusions for random hills, team/admin-only start icons, completed valid fields required for saving, and No-go priority where Danger/No-go overlap.
- [Location and device operation](../docs/location-and-device-operation.md): target both iPhone and Android, continue tracking throughout Game Day participation (including pause, background and locked-screen use), and show last-known positions with their age when stale. These requirements still need device verification.
- Tracking/privacy choices: stop on leaving/removal/day closure, let all teammates see current locations, allow joining without location permission, and provide an optional battery-saving mode with less-frequent updates. Record live-round routes only; all day participants can replay all teams after each round. Retain routes for 30 days with automatic expiry and organiser-only early deletion. Exact update intervals and retention mechanics remain open.
- Joining/team choices: immediate valid-code joining, player-chosen teams with self-service changes between rounds, admin admission of late arrivals into the current round, and reconnect restoring authoritative team/injury/life state without admin approval. Mode-specific admission and departure details remain open.
- Admin choices: all day admins have equal rights, including grants/revocations, commander management, removal/readmission and join-code resets; creator identity is provenance, without an owner permission tier. Admins may undo accidental hits with a recorded reason and dependent-action review. Late arrivals can be admitted while live without pause (notify the player). Paused medic changes apply to future hits only; existing injuries/rules/timers stay unchanged. Closed days cannot reopen and at least one admin must remain. Pending-hit versioning and correction/validation mechanics remain open.
- [KOTH](../docs/game-modes.md#king-of-the-hill): random initial placement, fixed or automatic relocation chosen by the organiser, contested hills award no score, and highest score wins at time expiry or early admin End, with ties drawing. Scoring-disabled games finish without an automatic winner.
- [TDM](../docs/game-modes.md#team-deathmatch): automatic ending when one viable team remains, simultaneous elimination draws, most in-play players wins at time expiry (ties draw), no respawn, and explicit departure means withdrawal without erasing life/injury/history. Legal recovery and event-ordering details remain open.
- [Patrol](../docs/game-modes.md#agreed-patrol-rules): team-owned progress, any in-play teammate can scan, reject out-of-order scans, activate the next queued mission automatically and use highest mission score for end results (ties draw). Organisers set points per mission and choose ending by time/admin, first team queue complete or all team queues complete.
- [Dog tags](../docs/dog-tag-gameplay.md): capture on by default with an organiser toggle per game; living in-play enemies capture for one point. Friendly dead-player assessments leave tags available. Keep capture optional without a standalone scoring mode or changes to mode winner rules.
- [Tactical drawings](../docs/map-marker-targeting.md#drawing-lifetime-permissions-and-sighting-age): clear at round end; creator/admin edits, creator/team-commander/admin deletes. Enemy sightings default to adjustable 30-minute expiry and show one quiet age timer beside each marker, without duplicate/details fallback. Field features retain their separate day lifetime.
- Defaults/access: any day admin may assign commanders; organisers may set optional team limits. Start countdown is optional and configurable for preparation (for example five minutes), with validated admin Force Start. Default bleed-out is 10 minutes, adjustable per game.
- Day-management/offline choices: removed players need explicit admin readmission; any admin can reset the join code. Disconnected maps show the cached authorised field/markers, clearly labelled Offline/last known; basemap/cache coverage and revocation details remain to be verified.
- Final recovery/results choices: keep at least one admin, admit new late arrivals in play on life one, reject offline hits arriving after round end, use most in-play players for TDM early-end results (ties draw), and withdraw Patrol leavers while preserving team progress/rewards.

## Before selecting implementation scope

Use the [planning checklist](../docs/planning-checklist.md) to choose one small usable stage and resolve only its blockers. In particular:

- Select the technical setup and minimum supported iPhone/Android devices, then verify required NFC/location behaviour. Define route-retention/deletion mechanics, normal/battery-saving sampling and freshness limits, and measured battery targets. Tracking stop boundaries and replay policy are agreed.
- Define bleed-out duration limits, assessment-specific timer behaviour and authoritative expiry/reconnect handling before implementing medic timer gameplay; the agreed default is 10 minutes and the unchanged preview still shows two minutes. Duration scope, expiry options, treatment clearing and pause freezing are agreed.
- Define field holes/outside-boundary validation, paused-edit/replacement notifications/history and active/queued-game revalidation before implementing Field Library. Whole-field replacement while paused is agreed. Its screens still need a preview.
- Define medic configuration validation, outcome-selection timing, pending-hit rule versioning and duplicate/dependent-correction mechanics before implementing medic play. Paused rule-change transitions are agreed; advanced/random editors remain deferred.
- Define offline replay ordering, lifecycle/binding/permission conflicts, pending-hit/timer reconciliation and ended-round results-review mechanics before implementation. Backend acceptance remains authoritative; no offline queue or local medic prediction is implemented.

Replace this review scope with the selected stage's outcome, dependencies, exclusions and acceptance checks when implementation is requested. Do not begin another feature automatically.

## Review completion checks

- [x] Match the backlog to documented decisions without marking previews as implemented features.
- [x] Keep proposed defaults and unresolved gameplay/device decisions visible.
- [x] Record the dependency between Game Day creation and field selection.
- [x] Check edited document links and formatting. Application build/tests are not applicable to this documentation-only change.
