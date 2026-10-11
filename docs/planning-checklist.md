# Planning checklist

Status: open planning backlog, 5 October 2026. These are decisions to resolve as the app is built in stages, not an instruction to implement every item now. An unchecked item means planning is still needed; it does not mean the feature is missing from an implemented app.

## How to use this list

Choose one usable stage, resolve only its blocking decisions, and write its scope and acceptance checks in [the current plan](../plans/current.md). It currently records the completed connected UX walkthrough stage, awaiting user feedback; no production implementation stage has been selected. Record settled behaviour in the owning feature document, then mark the corresponding planning item complete here. A completed checkbox means the decision is documented, not that implementation is finished.

Use the [documentation index](README.md) to find existing owners. Create a new topic document only when a subject needs its own specification. This checklist references decisions rather than duplicating their final rules.

The product-choice questionnaire is complete. Remaining unchecked details are implementation defaults, validation/design work and device testing; resolve them within the selected slice, documenting reasonable defaults rather than reopening every item as another user questionnaire.

## Decisions recorded from the page previews

- [x] Use [Ranger green throughout](colour-scheme.md), day and night. Device readability and battery measurements remain open.
- [x] Keep bottom navigation on the main Game Day screens except Map. Map uses left-toolbar Scan and a top-right menu, with no self-medic icon; see [map layout](map-screen-layout.md).
- [x] Use [generic Scan](nfc-interactions.md) for wristbands and objective tags. Eligible dog-tag capture completes after validation; physical treatment still needs confirmation. Locked-screen/platform support requires device verification.
- [x] Put I'm hit at the bottom of Map, hide the new assessment until an authorised medic scan, and replace the button with a bleed-out countdown; see [medic gameplay](medic-gameplay.md#reporting-and-revealing-an-injury). The demo's two-minute duration is illustrative.
- [x] Provide named [medic rulesets](medic-gameplay.md#reusable-medic-rulesets), an admin editor and game picker. Copy selected rules into the game; keep the first editor simple and advanced/random rules deferred.
- [x] Record the [Field Library concept](field-library.md): reusable layouts with boundaries, No-go/Danger areas and default icons. Create/open a Game Day before selecting its field; selection is required before play. Its screens are not yet in the saved preview.
- [x] Agree creator-only field template editing, independent day snapshots, admin day-layout edits before play or while paused with player notifications, and instructional zones without automatic GPS-entry warnings.
- [x] Set bleed-out duration per game, expiry outcome per medic ruleset, and freeze timers during pause/resume countdown. Save medic rulesets across the organiser's Game Days. Allow another player to reveal an injury only if permitted to treat that injury; see [medic gameplay](medic-gameplay.md).
- [x] Offer death or remaining out of play at bleed-out expiry. Completed treatment clears the timer, the next accepted hit starts fresh, and hits while wounded are ignored. Any teammate can reveal dead-player status without gaining respawn permission. Any day admin can edit saved medic sets available to that day; existing game copies stay unchanged.
- [x] Target both iPhone and Android. Continue normal tracking throughout the Game Day, including pause, lobby/between games, background and locked-screen use; show stale positions with age. See [location and device operation](location-and-device-operation.md); capabilities still need device testing.
- [x] Stop tracking on leaving/removal/day closure, show current locations to all teammates, store routes for post-game review, require location permission to join (10 October 2026; replaces joining without permission) and offer optional less-frequent battery-saving updates. Exact update intervals remain open.
- [x] Record routes only during live rounds; all day participants can replay all teams after each completed round. Retain routes for 30 days with automatic expiry and organiser-only early deletion.
- [x] Join from a public list of open Game Days with no codes (10 October 2026; replaces code joining). Playing admins switch views with an Admin Mode toggle in More (superseded 11 October 2026: admins use a Host tab; see [design direction](design-direction.md)). Stage 1 stack: Expo (React Native, TypeScript) + Supabase; see [architecture](architecture.md#9-technology-stack).
- [x] Admit joins to the Game Day without approval; players choose teams and may change teams themselves between rounds. Admins can admit late arrivals into the current round. Restore authoritative team/injury/life state after connection loss without admin approval.
- [x] **KOTH:** random initial hill, organiser choice of fixed/automatic relocation, no score while contested, and highest-score winner at time expiry or early admin End (ties draw; no automatic winner without scoring).
- [x] **TDM:** automatically end with one viable team, draw on simultaneous elimination, most in-play players wins at time expiry (ties draw), no respawns, and explicit departures withdraw players from participation/recovery.
- [x] **Patrol:** team progress, any in-play teammate may scan, reject out-of-order scans with the required next point, automatically activate the next queued mission, and highest mission score wins when the round ends (ties draw).
- [x] **Dog tags:** enabled by default with a per-game organiser toggle, captures by living in-play enemies, one point each, friendly assessment leaves the tag available, and no standalone scoring mode initially.
- [x] **NFC setup:** players register/replace their own wristbands, admins correct bindings and register field-point tags, unknown tags open permission-filtered registration, and offline gameplay scans queue as pending for later server validation.
- [x] **Offline:** queue capture/mission scans only, reject changed life/step, keep pending until round end, and route late submissions to admin review before results finalisation. Offline hits immediately show out of play/pending with a provisional medic-step estimate from cached player/game rules; no offline treatment/respawn confirmation.
- [x] **Admin controls:** all day admins have equal management rights, replacing creator-only admin grants/revocations. Keep audited accidental-hit undo, notified late admission while live without pause, notified paused medic-rule changes and no reopening closed Game Days.
- [x] Paused medic changes apply to future hits only; existing injuries/rules and timers stay unchanged. Hit undo after treatment/capture requires review of affected actions/scores. Patrol ending is a game option (time/admin, first queue complete or all queues complete), with organiser-set points per mission.
- [x] Permit whole-field replacement while paused with affected-game review and notification. Exclude all Danger/No-go areas from random hills; team start icons are team/admin-only. Save only completed valid fields; allow No-go/Danger overlap with No-go priority.
- [x] Tactical drawings clear at round end; creator/admin edits and creator/team-commander/admin deletes. Enemy sightings default to 30-minute expiry, adjustable, with one small age timer beside each marker and no duplicate/details fallback.
- [x] Any day admin may assign commanders; organisers can set optional team limits. Start countdown is optional with configurable preparation time (including several minutes) and validated admin Force Start. Default bleed-out is 10 minutes, adjustable per game.
- [x] Any day admin can remove/readmit players (join codes dropped 10 October 2026); removed players require admin readmission. Show the cached authorised field/markers offline with clear last-known labelling.
- [x] Keep at least one day admin; new late admissions start in play on life one. Reject offline hits arriving after round end. TDM early admin End uses most in-play players (ties draw). Patrol departures withdraw the player while retaining team progress/rewards.

## 1. Build stages and technical setup

- [ ] Agree the first usable release and a sequence of small, playable stages; distinguish essentials from later features.
- [ ] Select minimum supported devices/OS versions, client framework, backend, database and map provider within the [architecture](architecture.md). Both iPhone and Android are agreed targets.
- [ ] Check location, background operation and NFC capabilities on the actual target devices before committing to those workflows.
- [ ] Define development setup, test accounts/devices, configuration, deployment and how organisers receive test builds.
- [ ] Give each stage an outcome, dependencies, exclusions and acceptance checks. Keep only the active implementation stage in `plans/current.md`.

## 2. Reusable fields and setup

Owner: [Field Library](field-library.md). The concept covers reusable templates and Game Day selection; its proposed defaults still need confirmation for the selected implementation slice. Reusable points and device bindings follow [architecture](architecture.md#1-ownership-and-lifetime).

- [ ] Complete create/edit/duplicate/archive details and how another host obtains a reusable field copy; creator-only template and admin day-copy editing are agreed.
- [ ] Define drawing the playable boundary and any excluded areas on a map, including validation and editing gestures.
- [ ] Define holes and areas outside the boundary; complete geometry validation and staging/respawn/objective behaviour. No-go/Danger overlap with No-go priority, shared safety visibility and team/admin-only start icons are agreed.
- [x] Keep initial zones as boundaries/instructions only; automatic GPS warnings and gameplay effects are outside initial scope.
- [ ] Define named points, coordinates, point types and optional NFC bindings; separate reusable points from a game's objectives.
- [ ] Define paused-edit/replacement notification delivery, field history and active/queued-game revalidation. Whole-field replacement while paused, snapshots and selection-before-play are agreed.
- [ ] Define setup review: boundary, zones, points, team starting areas and required configuration before starting a game.
- [ ] Separate the first manual setup workflow from later imports, shared field libraries and downloadable field packages.

## 3. Battery life and device performance

Owner: [location and device operation](location-and-device-operation.md). Technical authority remains in [architecture](architecture.md#5-devices-and-location-are-evidence).

- [ ] Set measurable battery/runtime targets for a typical Game Day, with representative devices, duration, weather/use conditions and screen-on time.
- [x] Define tracking lifetime: throughout day participation, including pause/background/locked-screen use; stop on leaving/removal or day closure.
- [ ] Define location sampling and upload policies, including any adaptive behaviour, and measure the trade-off between battery, freshness and game accuracy.
- [ ] Define/test normal and optional battery-saving update intervals, mode indication and objective eligibility under reduced freshness. Less-frequent battery-saving updates are agreed.
- [ ] Define behaviour when the OS restricts background work, the app is terminated, location updates stop or the battery becomes low. Do not treat missing updates as death or elimination.
- [ ] Decide screen-awake behaviour and control map redraws, animations, network retries and subscriptions when they are unnecessary.
- [ ] Set data-use, map-loading, response-time and player-count targets. Plan tests with several phones under realistic coverage and GPS conditions.
- [ ] Include a battery/performance field-test checklist before release; choose thresholds after measurement rather than inventing guarantees.

## 4. Location, permissions and connection loss

- [ ] Define location-permission onboarding and screens for denied, approximate, disabled or revoked location access. Permission is required to join; revocation afterwards shows tracking unavailable, with valid GPS required for location objectives.
- [ ] Resolve freshness, accuracy and boundary tolerance before KOTH; record its occupancy rules in [game modes](game-modes.md#king-of-the-hill).
- [ ] Define freshness thresholds, accuracy indicators, stale appearance and long-outage expiry. Keeping the last-known marker with its age is agreed.
- [ ] Define pending, accepted, refused and failed action UI under the [connection policy](architecture.md#8-connection-loss-and-implementation-guardrails).
- [ ] Decide backend-outage/restart clock policy, reconnect recovery and what the organiser sees when players lose coverage.
- [ ] Define offline basemap/storage coverage, cache expiry/revocation and cached game/player state. Cached field/markers with last-known labelling, capture/mission queues and provisional offline hits are agreed; treatment/respawn stays online. Define hit conflicts/timestamps, timer reconciliation and ended-round hit handling.
- [ ] Define route-retention start timestamp, backups/caches, replay access after leaving/removal, deletion auditing and tracking explanations. Live-only recording, all-team replay after each round, 30-day retention and organiser-only early deletion are agreed.

## 5. Game Day and organiser workflows

Owner: [app flow](app-flow.md).

- [ ] Define optional team-limit validation/overrides and any explicit assignment restrictions. Public-list joining without codes, player-chosen teams and optional capacity limits are agreed.
- [ ] Define atomic last-admin validation, revocation timing and removal/readmission consequences for current gameplay. At least one admin must remain; all admins have equal rights with no owner transfer.
- [ ] Define safe entry and readmission after departure/removal without life reset. New late admissions start in play on life one; TDM/Patrol departures preserve history/team progress, and reconnect restores existing state.
- [ ] Define configuration validation, start review, live corrections and player feedback when a change is rejected.
- [ ] Complete historical roster/configuration/result views and outstanding offline review after closure. Closed days cannot reopen.

## 6. Gameplay decisions

- [ ] **KOTH:** define scoring-rate defaults/limits, hill-radius/relocation validation and location eligibility in [game modes](game-modes.md#king-of-the-hill). Placement, relocation choice, contested scoring, ties and admin-ended outcomes are agreed.
- [ ] **Medic:** settle hit reporting/correction, permitted helpers, physical treatment, wound instructions and respawn conditions in [medic gameplay](medic-gameplay.md).
- [ ] **Bleed-out:** define duration limits/validation, assessment-specific changes and respawn clearing. Define authoritative expiry, concurrent treatment/expiry resolution and reconnect handling before implementation; default 10 minutes, duration scope, expiry options, treatment clearing and pause policy are agreed.
- [ ] **Medic rulesets:** define configuration validation, outcome-selection timing, rule versions for pending offline hits and duplicate/dependent-correction mechanics before implementing simple medic play. Future-hit-only paused changes, unchanged existing injuries/timers and review of dependent undo effects are agreed.
- [ ] **TDM:** define legal recovery/team viability, concurrent-event ordering and re-entry rules in [game modes](game-modes.md#team-deathmatch). Automatic ending, time-expiry/early-end counts, no respawn, late first-life admission and withdrawal consequences are agreed.
- [ ] **Patrol:** define reward defaults/limits, queue validation, simultaneous completion/end ordering and pending-scan/readmission checks in [game modes](game-modes.md#objective--mission-mode). Per-mission points, configurable endings, late admission and withdrawal preserving progress are agreed.
- [ ] **Dog tags:** define departure/removal handling, concurrent capture/life-transition ordering and any future live toggle changes in [dog-tag gameplay](dog-tag-gameplay.md). Default enablement, eligibility and one-point value are agreed; a dedicated scoring mode is deferred.
- [ ] Keep advanced wounds, Defend/Capture/Deliver, perks and other extensions deferred until their stage is selected.

## 7. NFC registration and recovery

Owner: [NFC interactions](nfc-interactions.md), with feature permissions in their respective gameplay documents.

- [ ] Define registration timing, unbinding/reassignment and binding validation. Player self-registration/replacement and admin-only field-point registration are agreed.
- [ ] Define errors for unknown, duplicate, already-bound and unreadable tags.
- [ ] Define pending-scan handling after wristband replacement and duplicate/reassignment recovery; self-replacement preserves identity/life/history and disables the previous binding.
- [ ] Define offline scan replay ordering, pause/countdown handling, binding/permission conflicts, review deadlines and detecting outstanding disconnected submissions. Queue action scope, changed-life/step rejection, round-length pending window and ended-round admin review are agreed.
- [ ] Complete cancellation, retry, ambiguous-action and error UI around the agreed generic Scan flow. Verify foreground/background NFC, notification taps and unlock requirements on target phones; do not promise automatic locked-screen capture.

## 8. UI decisions and map annotations

- [ ] Define empty, loading, error and disconnected states for the key screens in [app flow](app-flow.md).
- [ ] Define tapping players, points, zones and drawings: details shown, permitted actions and dismissal behaviour.
- [ ] Complete pending/refused/failed hit, assessment, treatment and configuration states around the agreed preview. Add Field Library/editor/picker screens to a later preview before their implementation stage.
- [ ] Set colour meanings for teams, sections, affiliation and warnings, with labels/shapes that preserve meaning without colour. Confirm publishing-colour defaults in [map toolbar](map-toolbar.md#colour-and-publishing-section).
- [ ] Select one icon style and consistent names. Placeholder icons are sufficient until final artwork is needed.
- [ ] Set outdoor readability, text scaling and touch-target expectations; resolve small-screen/landscape behaviour in [map screen layout](map-screen-layout.md).
- [ ] Define sighting expiry limits/clock, between-round drawing placement/history and bulk-delete geometry scope in [map marker targeting](map-marker-targeting.md) and [map toolbar](map-toolbar.md). Default 30-minute expiry, marker-only age timer, round lifetime and edit/delete roles are agreed; phase point placement before multi-point drawings and bulk deletion.
- [ ] Define essential alerts and behaviour when sound, vibration or notifications are unavailable.

## Suggested stage order — to confirm

1. Technical setup, sign-in and Game Day/team lobby. Day creation can precede field selection; starting play depends on stage 2's field selection/review.
2. Reusable Field Library, Game Day field selection/copy and authorised map display.
3. Game lifecycle, tracking, reconnect behaviour and initial battery measurements.
4. Playable KOTH with its location and result rules resolved.
5. Wristband registration/shared scans, then simple medic and TDM with legal recovery defined.
6. Field-point registration and planned ordered Patrol.
7. Dog-tag captures and richer annotation tools when selected.

Basic map controls can accompany stage 2; later drawing tools need not block a playable game. Each stage includes relevant UI states, permission checks and validation. Battery, connectivity and usability testing continue as features are added.
