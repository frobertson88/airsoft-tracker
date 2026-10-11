# Field Library

Status: concept specification with agreed ownership, selection and edit policy, 5 October 2026. Create/open the Game Day first, then select its field before play. Remaining proposed defaults and open decisions are identified below; no production Field Library UI or storage is implemented. The [connected walkthrough](game-day-walkthrough.html) added on 6 October illustrates boundary creation, review and day selection with local simulated data; see its [limits](walkthrough-testing.md#practical-limits-and-open-decisions).

## Purpose

Set up a field once and reuse it as the starting map for multiple Game Days. Use the same familiar pattern as medic rulesets: **library → create/edit template → review → select for use**.

The field supplies the physical layout and default map features. Each game still selects its mode, medic rules, objectives, scoring and timer separately.

Example: save **Pine Ridge** with its playable boundary, a closed quarry marked No-go, a slippery slope marked Danger, staging/respawn locations and named points. When hosting Sunday Skirmish, select Pine Ridge rather than drawing the field again.

## Template contents

| Item | What is saved |
| --- | --- |
| Field identity | Name, optional location/address and short organiser notes |
| Map starting view | Centre and zoom for opening/reviewing the field; not a player's location |
| Playable boundary | A closed polygon marking the field's playable extent |
| No-go areas | Closed polygons, names and explicit no-entry instructions |
| Danger areas | Closed polygons, names and the relevant hazard/instruction |
| Default icons and labels | Named positions such as staging, entrances, marshal point, buildings, bases or rally points |
| Named field points | Reusable point names and coordinates that games can reference |

No-go and Danger have different meanings. **No-go** prohibits entry; **Danger** describes a hazard and its instructions. If a hazard also prohibits entry, label it explicitly as No-go rather than relying on colour or the word Danger alone.

Agreed: No-go and Danger polygons may overlap. In an overlap, No-go takes priority for entry instructions; retain the hazard information too. This priority does not introduce automatic GPS enforcement.

Starting/respawn locations are physical annotations until the selected game assigns them a role. An icon must not automatically spawn players, complete a mission, grant treatment or award score.

The template does not contain player rosters, current team/section identifiers, live player locations, sightings, scores, wounds, captures or completed mission state.

## Library and editor screens

Expose **Field Library** from Home as an organiser action alongside Join/Create Game Day. Provide **Choose Field → Field Library** in the selected Game Day's admin lobby. Players joining an existing day use the host's selected field; they do not choose another one.

The library lists saved field names and locations, with a small preview if practical. Its main actions are **Create Field**, **Open/Edit**, **Duplicate** and **Archive**. Keep imports, public sharing and downloadable field packs for later.

Suggested creation flow:

1. Enter the field name and optional location/notes.
2. Find the field on the map and set its starting view.
3. Draw the playable boundary.
4. Add No-go and Danger areas, with names/instructions.
5. Place default icons, labels and named points.
6. Review the layout, then **Save Field**.

Reuse the existing [map drawing gestures](map-toolbar.md#drawing-tools): tap polygon corners, preview, **Finish** or **Cancel**; select authorised objects to adjust them. The field editor exposes field-specific actions—Boundary, No-go, Danger, Icons and Points—rather than asking the organiser to impersonate a player's team drawing.

Use the agreed [Ranger green scheme](colour-scheme.md), with explicit area names, distinct styles/icons and readable instructions. Safety meaning must not depend on colour alone or conflict with team colours.

Agreed saving policy: save only completed, valid fields; no unfinished saved Draft workflow in the initial version. Require a name, valid playable boundary and valid geometry/instructions for any added zones before Save Field. Polygons must be closed, non-self-intersecting and have usable area. No-go/Danger overlap is allowed with No-go priority; holes and partially-outside-boundary policies remain open. Cancelling an invalid edit must leave the last valid saved version intact.

## Selecting a field for a Game Day

**Create or open Game Day → admin lobby → Choose Field → review field → confirm day field**.

Choose an existing ready field or create one from this flow. Show the field name, location, boundary, No-go/Danger areas and default icons before confirming. Field selection is an organiser step; joining players retain the existing role → team → optional section setup.

Agreed flow: a Game Day can be created without a field, then its admin selects one while the day is in setup. Show **Field not selected** and require selection/review before the first game countdown. A new or unfamiliar location can use Create Field; do not silently reuse the last field without showing the selection.

After selection, show the chosen field in the admin lobby and make **Review Field** available. Each queued game starts from that Game Day's field layout, with game-specific zones/objectives layered on top. Do not re-import the template or remove day-level annotations when starting the next round.

## Templates and Game Day copies

Agreed: use a snapshot pattern, similar to the [medic ruleset selection](medic-gameplay.md#reusable-medic-rulesets):

| Layer | Lifetime and changes |
| --- | --- |
| Saved field template | Reused across Game Days; organiser edits prepare future use |
| Game Day field copy | Created when the field is selected; keeps the chosen geometry/features and template identity/revision |
| Game overlay | Hill, selected mission points, progress and other game-specific features belong to that game |

Editing a saved template does not silently change an open or closed Game Day. Duplicating a template creates another reusable layout; archiving removes it from future selection without erasing existing days or results.

Agreed: an authorised day admin may edit the day field layout before play, or while the game is paused after play starts. Notify affected players when changes are applied. Make **Edit This Day's Field** distinct from **Edit Saved Template**. A change to the day copy does not automatically overwrite the saved template. Edits are unavailable during live play or countdown.

If replacement would invalidate queued hill areas, mission point references or team-start mappings, show what needs reconfiguration and block starting those games until corrected. Never silently remap an objective to a different point.

Agreed: an admin may replace the entire selected field while paused after play starts, reviewing affected games/configuration and notifying players. Preserve historical field/configuration versions. Before implementation, define notification delivery, active-game revalidation and how changed areas/points affect existing objectives and progress; block resume while required configuration is invalid. Replacement is unavailable during live play or countdown and must not silently reset scores/progress or remap points.

## Visibility and permissions

Agreed ownership: only a saved field's creator can edit its template. Game Day admins can edit that day's field copy, without gaining edit rights to the original template. Shared ownership and public libraries are later work; how another host obtains a reusable copy remains to be defined.

Treat the playable boundary and common No-go/Danger areas as shared field information visible to all day participants. These are field features, separate from tactical player drawings; they do not add an unrestricted audience to the [marker targeting rules](map-marker-targeting.md).

Common static icons can be visible to everyone. Agreed: team starting-position icons are visible only to that team and authorised admins in Admin Mode. Require explicit assignment to the current day's teams and backend-filtered visibility. Never store a previous day's team/section IDs or opposing player locations in a reusable template. Unresolved team-specific icons should remain unpublished until mapped and reviewed.

Reuse the existing icon catalogue where its meaning fits. Field safety/point symbols should have clear names and follow the established icon style. Friendly/Enemy sightings and player-created tactical drawings continue to follow their existing affiliation, targeting and editing rules.

## Points, NFC and game behaviour

Named points describe reusable physical locations. A game chooses which points participate and what a scan means, following [game modes](game-modes.md#objective--mission-mode) and [NFC interactions](nfc-interactions.md).

The first library editor can save points without NFC registration. If point/device bindings are added later, keep physical point/device identity separate from copied map annotations. Selecting or duplicating a field must not duplicate a wristband identity or silently bind one tag to multiple points. Registration and binding validation follow the existing [architecture](architecture.md#5-devices-and-location-are-evidence).

Agreed initial behaviour: Boundary, No-go and Danger overlays show boundaries and instructions only, without automatic GPS-entry warnings, elimination or scoring. Any later automatic warnings/actions need separately agreed accuracy, freshness and gameplay rules.

KOTH still requires its own allowed hill-placement area and full-circle validation. Field boundaries/exclusions are setup inputs; they do not replace [KOTH configuration](game-modes.md#king-of-the-hill). Agreed: always exclude both No-go and Danger areas from random hill placement. The full hill circle must avoid those areas; this is setup validation, not automated detection of player entry.

## First useful scope and checks

Keep the first slice to organiser-owned templates, manual map setup, boundary/No-go/Danger polygons, default point icons/labels, named points, field review and Game Day selection/copying. No collaborative editor, general layer engine, imports, automated enforcement or public marketplace is needed.

Acceptance checks for a later implementation:

- Create, save, reopen, edit, duplicate and archive a field without losing its geometry or labels.
- Reject saving unfinished/invalid fields; preserve the last valid saved version when an edit is cancelled.
- Create/open a Game Day before selecting its field; show Field not selected until chosen and prevent the first countdown without a reviewed field.
- Keep the selected day field across rounds unless an admin explicitly changes/replaces it under the permitted lifecycle rules; reset game-specific state for each new round.
- Edit a saved template without changing existing days or historical results.
- Separate day-copy editing from template editing and reject unauthorised changes.
- Permit day-layout edits before play or during pause, notify affected players, retain history and revalidate affected game configuration before resume.
- Permit whole-field replacement during pause only after reviewing affected games; do not silently reset progress or remap points.
- Keep shared safety information visible while filtering team-specific icons and tactical drawings.
- Detect broken queued-game references after a pre-start field replacement.
- Do not grant gameplay effects or duplicate NFC bindings through field copying.

## Decisions before implementation

- Define how another host obtains a usable copy of a field while retaining creator-only template editing.
- Define holes and areas outside the boundary. No-go/Danger overlap and its priority are agreed; saving requires a completed valid field.
- Define which default icons are common versus team-specific, and team-start mapping/review.
- Define paused-edit/replacement notifications, historical versions and active/queued-game revalidation. Whole-field replacement while paused is agreed.
- Define point identity and later NFC registration/duplication behaviour.
- Keep automated boundary warnings outside the initial scope; keep uncertain GPS visible as uncertainty.

This concept does not replace `plans/current.md`. Select an implementation slice and resolve its blocking decisions before building the feature.
