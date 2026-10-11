# Current plan

Status: Stage 2 planned, 11 October 2026; not started. Stage 1 is archived in [stage1-2026-10-11.md](stage1-2026-10-11.md).

## Stage 2 — Field Library and map

### Outcome

An organiser saves a field once (boundary, No-go and Danger areas, labelled points) and picks it when hosting a Game Day. Everyone in the day sees that field on the Map tab with their own position. No games are played yet.

### Map choice

Built-in maps through `react-native-maps` (Apple Maps on iPhone, Google Maps on Android), chosen 11 October 2026. Works in Expo Go, has satellite view, needs no account for testing. A free Google Maps key is needed for Android release builds. Revisit MapLibre/Mapbox only if offline maps become essential. The web version shows a simple placeholder instead of a map.

### Scope

Follows the first useful slice in [Field Library](../docs/field-library.md#first-useful-scope-and-checks).

1. **Field Library** (Home → Fields): list my saved fields; Create, Open/Edit, Duplicate, Archive. Only the creator edits a saved field.
2. **Field editor:** name, optional location and notes; find the field on a satellite map and set the starting view; draw the playable boundary by tapping corners (Finish/Cancel/Undo); add No-go and Danger areas with a name and instruction; place labelled points (staging, respawn, base, marshal point, other). Review, then Save Field.
3. **Validation before Save:** name, a closed boundary of at least 3 corners that doesn't cross itself, and valid areas/points. Only valid fields are saved; cancelling keeps the last saved version.
4. **Pick a field for the day:** Host tab shows **Field not selected** → Choose field → review → confirm. Confirming copies the field into the day (a snapshot); later template edits don't change the day.
5. **Map tab:** satellite map of the day's field with boundary, No-go (labelled, hatched), Danger (labelled) and points; your own position as the usual blue dot; Recentre and Fit field buttons. Before a field is picked it says so.
6. **Database:** fields and field revisions owned by their creator; a day field copy; all changes through backend functions; tests for ownership, validation and snapshot copying.

### Defaults chosen for this stage

- Areas may extend past the boundary; holes inside areas are not supported yet.
- All points are visible to everyone in the day. Team-only start points wait until team mapping is designed.
- Your own position is shown on your phone only; sharing positions with your team is Stage 3 (tracking).
- Editing the day's copy of a field is allowed while the day is in setup; pause/live rules come with games in Stage 3.
- No automatic boundary warnings, NFC binding, imports or sharing fields with other hosts.

### Exclusions

Games and lifecycle, sharing positions, team-only icons, tactical drawings and markers, NFC point registration, offline maps, the Daylight scheme.

### Acceptance checks

- [ ] Create, save, reopen, edit, duplicate and archive a field without losing its shapes or labels.
- [ ] Saving is refused for an unfinished or self-crossing boundary; cancelling an edit keeps the last saved version.
- [ ] A new day shows Field not selected; an admin picks and confirms a field; players see it on the Map tab within a few seconds.
- [ ] Editing the saved field afterwards doesn't change the day's copy.
- [ ] Non-creators can't edit a saved field, and non-admins can't change the day's field, even by calling the backend directly.
- [ ] The Map tab shows your own position and works on iPhone and Android in Expo Go.
