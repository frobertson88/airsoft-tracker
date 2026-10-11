# Current plan

Status: walkthrough page clarity pass complete and eight saved feedback notes consolidated, 6 October 2026; ready to return to documentation and select the next stage.

## Outcome

Create a local, clickable Game Day prototype for user feedback. Review host and player journeys using the existing Ranger green palette and agreed navigation. One simulated day connects setup, round lifecycle, player status and recovery. Prior decisions remain in [the archived review](design-review-2026-10-05.md) and their owning documents.

## Affected areas and steps

1. Add a standalone walkthrough beside the existing previews, separating simulation logic and UI.
2. Connect host creation, field creation/review/selection, configuration and start readiness to player joining, assignment, permissions and wristband setup.
3. Connect countdown/live/pause/resume, hit/assessment/treatment, late admission, connection loss, round end/review/results and next-round assignment persistence.
4. Add separate scenario controls, local feedback export and a short testing guide.
5. Check meaningful transitions and run the browser walkthrough before handover.

## Dependencies and defaults

Follow app-flow.md, architecture.md, field-library.md, medic-gameplay.md and nfc-interactions.md. Start with one KOTH example, an illustrated map and a sample ready field. Default bleed-out is ten minutes; timers use simulated active time and freeze during pause/resume countdown. Scenario controls may explicitly accelerate time. Host Ranger, player Ghost and helper Patch are distinct example people. View switching is a testing control, not an admin grant. Unresolved recovery/review presentation is proposed prototype behaviour, not settled backend mechanics.

## Exclusions

No production framework/backend selection, authentication, multi-device synchronisation, genuine map/NFC/GPS, deployment, background tracking, battery claims, full game-mode engine, full field-library management, advanced rules editor or authoritative offline-conflict implementation. Preserve the existing 36-screen preview.

## Acceptance checks

- [x] Walk host and player from Home through a completed round without a screen-picker shortcut.
- [x] Block start without a reviewed field, saved valid configuration and eligible players; optional sections do not block participation.
- [x] Keep assignment between rounds and host/player identities distinct.
- [x] Show countdown/live/pause/resume/complete consistently on Game, Map and Scan.
- [x] Hide injuries until permitted second-party assessment; confirm physical treatment; freeze and clear bleed-out correctly.
- [x] Explain invalid code/full team, location denial, late waiting, scan errors and pending/refused actions with a next step.
- [x] Reconnect without life reset; reject ended-round pending hits; illustrate separate late scan review before final results.
- [x] Review end/removal/corrections; restrict live corrections and protect the last admin.
- [x] Provide resettable scenarios and local feedback export without real-device claims.
- [x] Run simulation/browser/small-screen checks and record limitations in the guide.

Do not begin the production build or next feature automatically.

## Feedback revision

Remove the duplicated round banner and lingering wristband confirmation above Map. Keep round state in the map strip, retaining important offline/pause/pending/error feedback. Clear old success messages when navigating. Bring the existing simple named medic ruleset library/editor into the connected host flow: save/reuse sets, choose one when configuring the Ready game, and copy its treatment/helper/instruction/expiry values into that game. Editing the saved set must not change an existing game copy. Keep advanced/random rules and live ruleset replacement excluded. Verify copy isolation and configurable helper permissions, then check the browser paths.

Verification: 24 simulation tests and syntax checks pass; full browser flow and field creation checked, with no horizontal overflow at phone width. Custom ruleset creation/selection/start review and removal of duplicate Map banners checked in the browser. See [testing guide](../docs/walkthrough-testing.md) for evidence and limitations, and [feedback review](../docs/walkthrough-feedback.md) for all eight saved notes and remaining requests. Production implementation remains unselected.

Additional feedback recorded only: offer Play again / Choose a new game mode after a round, and configurable participating-team count during game setup. The user explicitly requested adding these to existing feedback; no prototype implementation is selected for them yet.

## Page clarity pass

Review all connected walkthrough pages. Remove repeated headings/statuses, routine success messages and implementation/demo explanations inside the phone. Use existing disclosure patterns for secondary rules, privacy explanations, editor limits and uncommon admin operations. Keep objectives, safety, hidden assessments, offline/pending/refused status and meaningful consequences visible when needed. Keep the external prototype warning/testing controls. This is a content/layout pass, not implementation of the remaining feedback features. Check representative host/player/setup/scan/editor/recovery pages in the browser and run existing checks.

Completed: trimmed repeated cards/headings, quieted routine selection confirmations, shortened copy throughout, made secondary navigation lighter, reduced library map thumbnails, and added disclosures for setup/privacy/rules/corrections/reader test cases. Safety, refusal/pending states and end/removal/review effects remain visible. Existing 24 simulation tests and JavaScript syntax checks pass. Browser-checked host/config/editor, player lobby/devices/live, helper refusal/assessment/treatment, reader error, offline map, end/result/next and field safety; no browser errors and no horizontal overflow at phone width. Remaining feedback features are still recorded only.

## Review handoff

All eight saved browser notes are recorded in the feedback review, including the latest requests for mode selection, Home access to medic rules, and game edits during play such as moving the hill. An unsaved location-permission draft is recorded separately as an open question. This handoff changes documentation only. Return to the relevant flow/gameplay docs to reconcile requests and choose a small next stage; do not continue polishing the prototype or begin production implementation automatically.
