# Location and device operation

Status: agreed product direction, 5 October 2026; device capability and battery performance are not yet verified. [Architecture](architecture.md#5-devices-and-location-are-evidence) owns observation validation and backend authority.

## Platforms and tracking

Target both iPhone and Android for the first version. Minimum OS/device support, client framework and platform-specific implementation remain to be selected.

Agreed tracking policy:

- Continue location tracking during live play, including when the app is in the background or the screen is locked, subject to granted permissions and device/OS capability.
- Continue normal tracking during pause. This does not advance gameplay, scores or the active game clock.
- Continue tracking while the player is in the Game Day, including the lobby and between games, rather than limiting it to a live round.
- Display a permitted player's last known position with its age when fresh updates stop. Do not label it as a current position or use stale observations as proof of eligible objective occupancy.

Tracking eligibility is based on Game Day participation, not merely which page is open. Background location requirements do not imply background/locked-screen NFC support; [NFC interactions](nfc-interactions.md) owns that separate workflow.

No sampling/upload interval has been agreed. Continuing normally during pause means using the normal tracking policy, not a promise of an exact interval or uninterrupted delivery. Permissions, OS restrictions, connection loss and app termination must be surfaced as tracking uncertainty. Missing observations do not cause death or elimination.

Agreed stopping boundary: stop collecting/uploading location after leaving or being removed from the day, and when the day closes. Merely viewing historical results must not restart tracking. Retention of previously recorded positions is a separate decision.

Offer an optional battery-saving mode with less frequent location updates. Exact sampling/upload intervals and measured savings remain to be defined through testing. Show the selected tracking mode and keep normal freshness/accuracy validation: battery-saving mode must not make stale observations count as current. It continues to follow the same Game Day tracking and stopping boundaries.

## Map and privacy

Agreed current-location visibility: every player can see their own team's locations, not only their section's. This does not broaden tactical drawing audiences or reveal opposing locations. Authorised admin views remain separate. Last-known markers follow the same backend audience filters. Use an age label and distinct stale appearance; exact stale thresholds, long-outage expiry and accuracy indicators remain open.

Agreed history policy:

- Record routes during live rounds only. Tracking still continues during pauses, lobby and breaks for current/last-known position display, but those observations do not enter replay routes. Paused gaps must not be presented as recorded travel.
- After each round finishes, all Game Day participants can review all teams' routes for that completed round. This is a participant replay view, not public access or permission to see opposing positions during live play.
- Keep routes for 30 days, then delete them automatically. Only organisers may delete stored routes earlier; players do not have a self-service route-delete action in the agreed product design.
- Preserve round identity and historical team assignments in replay. Replay access does not broaden current map visibility or disclose routes from an unfinished round.

Route recording and replay are product scope, not implemented features. The exact retention start timestamp, treatment of backups/caches, access after leaving/removal and deletion audit details remain to be defined before implementation. Route deletion does not imply deletion of unrelated scores/results.

Agreed (10 October 2026): location permission is required to join a Game Day. Explain why before the system prompt; if denied, block joining with an Allow location / Open settings action. If permission is revoked after joining, show **Tracking unavailable** with a re-enable action and require valid GPS evidence for location-based objectives. Revocation must not imply removal, death or elimination. Proposed default: foreground (while-using) permission is enough to join; background/always permission is requested separately with its own explanation and does not block joining. Approximate-location handling remains open.

Explain tracking during lobby/breaks, background and locked-screen use before permission requests. Also explain that live-round routes become visible to all day participants after each round and are retained for 30 days, with organiser-controlled early deletion.

## Offline map

Agreed: show the last authorised cached field layout and markers while disconnected, rather than replacing the whole map with a connection-unavailable screen. Use a persistent **Offline — last known** indication and retain location/sighting age labels. If data was never cached, show what is unavailable rather than an invented field or position.

Cache only information the user was authorised to receive. Clear privileged data on known role/membership changes, never infer opposing live locations from replay, and refresh authorised state on reconnect. Cached data is a view, not evidence of fresh presence or accepted scan/hit/treatment outcomes.

Offline basemap coverage, preloading/storage limits, cache expiry and revocation while disconnected must be specified and verified with the selected map provider. The current preview does not implement offline caching.

## Verification before release

- Test representative iPhones and Android phones in foreground, background and screen-locked states, across a full Game Day.
- Test denied/revoked permissions, restricted background operation, app termination and reconnection; expose stale state rather than implying guaranteed tracking.
- Verify pause/countdown observations do not advance gameplay and stale data does not count towards location-based objectives.
- Measure normal and battery-saving sampling/uploads, screen-on time, map rendering and battery consumption before setting intervals or runtime claims.
- Verify stop-on-leave/removal/closure, teammate-only player views, join blocked without location permission and route-history access controls.
- Verify no replay route is recorded during pause/breaks, opposing routes remain hidden before round completion, and retention/early deletion remove routes without changing scores/results.
- Verify cached-map offline labelling, missing-cache handling and permission-filtered refresh/clearing on reconnect.

These are implementation acceptance checks, not completed tests. Technical setup, supported devices, sampling/freshness/accuracy limits, battery targets and route-history retention/deletion mechanics remain in the [planning backlog](planning-checklist.md).
