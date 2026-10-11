# Test the connected Game Day walkthrough

Status: first pass complete, 6 October 2026. User feedback is next; production implementation has not begun.

Open [the walkthrough](game-day-walkthrough.html) in a browser. It works directly from this folder with its neighbouring CSS/JavaScript files; no install is required. While the local preview server is running, use http://127.0.0.1:4173/game-day-walkthrough.html. The existing 36-screen preview remains unchanged.

## Start here

1. Start from scratch as **Host · Ranger**. Create a Game Day, choose/review Pine Ridge and save the example KOTH configuration.
2. Switch to **Player · Ghost** outside the phone. Join with **PINE24**, choose a role/team and optionally a section. Choose location access and simulate linking a wristband.
3. Switch to Ranger. Review and start; advance the clock if you do not want to wait for the countdown.
4. As Ghost, open Map and report a hit. Scan opens a separate **helper demonstration**, where Patch scans Ghost. Try self-scan refusal, then medic assessment. Assessment and physical-treatment confirmation are separate.
5. Pause as Ranger; advance time and verify the bleed-out stays frozen. Resume with its countdown, then complete treatment as Patch.
6. Turn off **Ghost connected** in the test panel and scan Viper's dog tag while Ghost is in play. It stays pending with no point awarded. Ranger remains connected and may end the round.
7. Reconnect Ghost, review the pending capture as Ranger, then prepare the next round. Check that assignment and field persist while round injury state resets.

The clock can be stopped in the testing panel. Loading a scenario resets the simulated day, not saved feedback. Refreshing the page also resets day progress. The example roster includes four configured teammates; it does not represent four real connected devices.

## Other checks

- Load **Late arrival**: Ghost sees staging; Ranger can admit the configured player without pausing.
- Try a wrong code or set Blue at capacity before choosing a team. Check the remedy is understandable.
- Deny location: joining still works; location-based objectives remain unavailable.
- Use Scan to try unreadable, unknown and already-bound tags. Registration/replacement is simulated.
- Report a hit offline and reconnect during the round, then repeat with the round ended. Ended-round hits are refused rather than entering results review.
- Queue a capture and change the enemy life. Approval must fail; refusal clears the results-review blocker.
- While paused, review an accidental-hit correction. A recorded reason is required; dependent-treatment correction is explained but not executed.
- Remove Ghost, then readmit them. Preserve injuries/life and require separate round admission. Try removing Ranger: last-admin protection blocks it.
- Create a field by naming it and tapping at least three non-crossing boundary corners. Save/review it before selecting. Cancel/invalid saving must preserve the existing field.

## Give feedback

Use **Leave feedback** beside the phone. Save a note at the point where something feels unclear or takes too many taps; each note records the screen, viewpoint, stage and connection state. Export the notes before closing. They stay local and are not sent automatically. Browser storage is best-effort, and notes from direct-file and localhost origins are separate.

Useful feedback: “I expected this button to…”, “I couldn't tell whether I was in play”, “This confirmation is too much”, or “I need the field instructions here.” You can also give feedback directly in chat.

## First-pass evidence

- 24 simulation tests pass, covering lifecycle, optional sections, capacity, polygon validation, field snapshots, hidden assessments/helper permissions, pause/treatment, expiry, admission, reconnect, duplicate capture, changed life, provisional review, corrections, removal, history, saved-rules copy isolation and configurable medic helpers.
- JavaScript syntax checks pass. No application lint/build configuration exists in this documentation checkout.
- Browser walkthrough completed create → select field → configure → join → assign → decline location/link band → countdown → hit → refused self-scan → permitted assessment → paused treatment refusal/frozen timer → resume/treat → offline capture → end → review → next round.
- Browser field editor rejected incomplete saving and saved a completed four-corner boundary into its review screen.
- Phone-width check (390 px viewport) showed no horizontal overflow; desktop review checked the main phone/control layout.

## Practical limits and open decisions

This is a single-browser simulation of separate example people, not an authenticated app. Host actions are deliberately independent of Ghost's connection. No actual notifications, NFC, GPS, device permissions, background tracking, map service, multiplayer clock or score accrual are implemented. KOTH scores/locations are illustrative; dog-tag points are kept separate from KOTH winner scores.

Only the field boundary editor is interactive. Pine Ridge illustrates safety zones; full zone/icon/point editing, template duplication/archive and paused field replacement are excluded. The medic library now has a simple named three-hit ruleset editor: use **Host lobby → Medic rulesets**, or **Configure game → Edit selected ruleset**. A saved game takes its own copy. Advanced/random rules and applying rule changes to a running game remain excluded. No production configuration limits are established by the mock's positive-number validation.

Feedback revision checks: browser-created a custom medic-only ruleset, selected/saved it into the game and verified its name in start review. The map has zero duplicate lifecycle/success banners above it; pause/offline still appear in the map strip. Read all five exported user notes; see [feedback review](walkthrough-feedback.md) for completed changes and remaining requests.

Page clarity pass: repeated explanations/cards and routine selection confirmations were removed. Secondary navigation is lighter; privacy, setup, rule explanations, uncommon corrections and reader test cases use expandable sections. Open **Reader test cases** on Scan to test unreadable/unknown/already-bound tags. The helper demonstration is now **Helper scans Ghost** and retains separate scan and physical-treatment confirmation. Prototype explanations stay outside the phone. Browser checks covered the host/config/editor, player setup/lobby/live, helper/error, offline map, end/results/next and field safety pages; no browser errors or phone-width horizontal overflow were found. All 24 simulation tests still pass.

Offline replay timing, expired-hit conflicts, original participant eligibility, binding/permission changes, review discovery/deadlines and dependent-action corrections still need authoritative backend design. The walkthrough demonstrates proposed presentation, not proof those mechanics are complete. NFC/background operation, outdoor readability, text scaling and battery need real-device verification.

Next action: collect user feedback and revise this walkthrough before selecting the first production slice.
