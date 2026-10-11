# Walkthrough feedback review

Reviewed 6 October 2026. All eight locally saved user notes have been consolidated here, alongside chat feedback and the browser annotation about map banners. Saving a note keeps it in the browser; it does not automatically update project docs or send it to chat. Saved notes are also visible under **Saved feedback** in the testing panel.

| Feedback | Current response |
| --- | --- |
| A playing admin needs access to player navigation and an in-app mode switch. | Decided 10 October 2026: Admin Mode toggle in More; in Stage 1 scope. The current test still uses separate Ranger/Ghost identities; the external viewpoint switch does not demonstrate one person playing and administering. |
| Join from a list of available games rather than entering a code. | Decided 10 October 2026: public list of open Game Days, no codes; in Stage 1 scope. Use Game Days in the list, with the current/next round shown inside each day. Day discoverability/access needs explicit implementation design; do not silently make all private days public. |
| Allow section changes within the same team. | Recorded for the next iteration. Current live assignment locking includes sections; this requested revision must distinguish section changes from team/role changes and retain historical assignment snapshots. |
| Remove the round/status rows taking space above Map. | Completed. Map keeps lifecycle in its own strip; stale success confirmations are cleared on navigation and suppressed above Map. Errors remain actionable and offline/pause state remains visible in the strip. |
| Edit existing field templates, expose boundary/Danger/No-go/icon tools, and edit the local Game Day field copy. | Recorded for the next iteration. The current prototype only creates boundaries and selects day copies; it does not yet demonstrate template editing or the full day-copy editor. Keep saved-template and day-copy actions distinct. |
| “don't see a selection of difefernt game modes” — host / game. | Recorded, not implemented. Add explicit mode selection to game setup and connect it to the requested post-round choice below. The walkthrough currently demonstrates KOTH only. |
| “manage medic rule set from home screen like fields?” — host / rulesets. | Recorded, not implemented. Provide a reusable medic rules library entry from Home, alongside Fields; retain the ruleset selector in game setup and preserve each game's copied rules. |
| “Lost game options to edit during game, eg move hill” — host / game. | Recorded, not implemented. Restore a discoverable host path to permitted game edits, including hill relocation. Document which edits require a pause, how players see changes, and how scoring/history are preserved before implementing. |

Additional chat feedback: make the experience sleeker and expose the medic rules editor. The simple named ruleset library/editor and game selector are now connected to the host lobby. Treatment/helper/instruction/expiry settings copy into the saved game; later library edits leave that game unchanged. Advanced/random rules remain deferred.

Page clarity follow-up completed: removed repeated explanations and routine selection confirmations throughout the connected preview. Setup/privacy/rule detail and reader test cases now expand on demand; secondary navigation and field thumbnails are lighter. Objectives, safety instructions, offline/pending/refused states and consequential-action reviews remain available where needed. This does not implement the remaining functional requests below.

## Additional feedback — recorded, not implemented

- **After a round:** replace the generic next-round action with **Play again** or **Choose a new game mode**. Play again creates a fresh round with the same mode/configuration; choosing a new mode opens mode selection and setup. Keep the Game Day's teams, sections and field, and retain the completed round's results. Resolve pending results review before proceeding. Cancelling the choice must not create an extra round.
- **Game setup:** allow the host to define the **number of participating teams** for that game, rather than assuming two teams for every mode. This is team count, separate from a team's player capacity. Show which teams will participate and validate any mode-specific team-count requirements. Reuse the Game Day's team/membership structure; details of adding/selecting teams belong in the selected implementation stage.

The user requested these as additions to existing feedback only. Do not implement them or expand the active prototype scope automatically.

Recommended next UX priority: one-person player/admin switching, day-list joining and in-team section changes; then the complete field editor. Reduce repeated cards/explanations and expose detail when needed, retaining clear pending/refused/paused status.

## Review handoff

The prototype review can end here. Next, reconcile the recorded requests with their owning flow/gameplay documents, resolve behaviour questions, and select one small implementation stage. The recorded requests are not yet implemented or final gameplay decisions.

An unsaved draft was visible in the feedback box: “must allow location”. Preserve this as an open question: does it mean location is mandatory to participate, or that the permission flow needs a clearer Allow location action? Settled 10 October 2026: location permission is required to join; see [app flow](app-flow.md#3-joining-and-day-setup).
