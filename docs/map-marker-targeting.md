# Map marker affiliation and targeting

Status: proposed feature behaviour; no implementation is present in this checkout.

## Purpose and ownership

Keep marking fast while always showing what a drawing represents and who can see it. These rules apply to markers, arrows, lines and areas across game modes. The [map toolbar](map-toolbar.md) owns their control layout. [App flow](app-flow.md) owns navigation and Player/Admin switching; [architecture](architecture.md) owns backend authority and information filtering.

Affiliation describes meaning to recipients: **Friendly** or **Enemy**. Target describes the audience: a team, a section within a team, or Admin Only. Enemy / Blue Team means an enemy report for Blue Team; it does not mean publish to the enemy team. The [toolbar specification](map-toolbar.md#colour-and-publishing-section) owns publishing-section colours, affiliation presentation and proposed attribution defaults.

## Shared placement state

- Affiliation and target are global to the map drawing tools, not configured separately per tool.
- Selections remain sticky across placements and tool changes. Each new object snapshots the selections when created; changing selections does not change existing objects.
- Enemy always targets an entire team. Switching from a section to Enemy promotes the target to that section's parent team.
- Remember the previous valid Friendly target and restore it on returning to Friendly.
- Player and Admin modes retain separate placement selections. Returning to a mode restores its state only if still authorised.
- Membership or permission changes invalidate unavailable targets. Clear privileged map data when returning to Player Mode, as required by architecture.

Proposed initial defaults: Friendly / My Section when assigned, otherwise Friendly / My Team. An admin entering Admin Mode for the first time explicitly selects an audience before placing. Sticky state is required within the current map session; persistence across app restarts is outside this initial scope.

## Available audiences

| Permission and view | Friendly audiences | Enemy audiences |
| --- | --- | --- |
| Player | Own section, if assigned; own team | Own team |
| Authorised team commander in Player Mode | Own team; any section within own team | Own team |
| Admin in Player Mode | Same as their authorised player/commander permissions | Own team |
| Admin in Admin Mode | Any authorised team or section; Admin Only | Any authorised team |

Resolve available audiences from permissions and current membership. A chosen day-role label does not grant commander authority. There is no separate Commander Mode. An admin without a playing assignment can use Admin Mode but cannot place Player Mode drawings until assigned a team.

For a normal player, Friendly Target toggles **SEC ↔ TEAM** with one click. If unassigned to a section, show TEAM and make section selection unavailable. Enemy displays TEAM and prevents section selection.

For a commander, Friendly Target opens a single-selection menu containing their team and its sections. Enemy locks to their own team. Sections from another team must not appear as available choices.

## Admin placement

Enter deliberately from the **Host tab** (**Map as host**); return through the Admin Mode indicator's **Back to player view**. Updated 11 October 2026 with the Host tab; see [app flow](app-flow.md#12-admin-and-marker-views). Show a persistent Admin Mode indicator. Switching views preserves player state and never grants permission or changes game lifecycle.

Admin Target opens a single-selection menu grouped by team, with each team's Team entry and sections, followed by Admin Only. Show the selected team and section by name in the toolbar, rather than only SEC. Blue and Red are examples, not hard-coded team identities.

Enemy selections expose team entries only. Admin Only is a Friendly audience in this initial model. If Admin Only is selected and the admin switches to Enemy, require an explicit team choice before placement; there is no parent team to infer. Returning to Friendly can restore Admin Only.

Admin Mode can inspect all markings within the authorised Game Day and place on behalf of the selected audience. Admin-only drawings are visible only to authorised admins in Admin Mode. Editing/removal requires its own permission; visibility alone does not grant it.

## Drawing lifetime, permissions and sighting age

Agreed: tactical player/admin drawings belong to one game round and clear from the operational map when that round ends. Field templates, day field boundaries, No-go/Danger areas and starting-position icons are separate field features and do not clear with tactical drawings. Between-round drawing placement/replay retention remains to be defined; no Game Day lifetime picker is part of the initial drawing scope.

Agreed edit rights: the creator and authorised admins can edit a drawing. Other teammates and commanders do not gain edit rights through visibility or targeting authority. Admin edits use Admin Mode.

Agreed delete rights: the creator, authorised team commander and authorised admins can delete a drawing. Commander deletion is limited to player-created tactical drawings within their own team's authorised audiences; it does not grant access to enemy audiences, Admin Only or field-template/day-field management. Preserve the distinction between edit and delete permissions and revalidate each object in bulk deletion.

Agreed: enemy sighting markers automatically expire after a configurable duration, default **30 minutes**, or at round end if earlier. Exact configuration location, limits, pause/expiry clock and whether editing refreshes expiry remain to be defined. Age means time since the reported sighting, not proof of the enemy's current position; do not reset it merely because the map was reopened.

Latest agreed display: keep one small, quiet age timer beside the sighting marker. Do not repeat it in selected-marker details or use a details fallback in the current scope. Keep formatting compact and review spacing on small screens without adding a second timer display. This replaces the earlier crowded-map selection-details fallback proposal.

## Object data and validation

Conceptually, every drawing stores:

```text
MapObject
    id
    event_id (Game Day identifier)
    game_id (when game-scoped)
    affiliation: friendly | enemy
    target:
        type: section | team | admin
        team_id (for section/team)
        section_id (for section only)
    created_by
    created_at
    publishing_section_id (when section-published; independent of audience)
    kind / marker_type (stable catalogue ID or drawing kind)
    label (optional)
    geometry / marker data
```

Keep lifetime explicit under architecture; initial tactical drawings are game-scoped. Enemy sightings also need reported time and expiry context; their audience does not determine lifetime.

The backend validates the actor's membership, mode-specific permissions, Game Day/game context and audience on every placement:

- Enemy requires a team target; reject section and admin targets.
- Team targets require a valid team ID and no section ID.
- Section targets require a valid team and section belonging to it.
- Admin targets have neither a team nor a section ID and require admin placement permission.
- Player/commander targets remain within their authorised team/sections.
- Preserve the real creator for admin placements; selecting an audience does not impersonate another player.
- Validate publishing-section attribution against the actor's membership or authorised admin placement context; it cannot be a freely forged colour/section ID.

Apply audience filtering on the backend for reads/subscriptions as well as writes. A section drawing is shared with that section; a team drawing with that team. Authorised Admin Mode inspection is the explicit exception. Never send hidden opposing-team or admin-only data to Player Mode and merely hide it in the UI.

## Initial scope and acceptance checks

Include both affiliations, team/section/admin audiences, sticky shared selections, commander permissions and deliberate Admin Mode. Exclude platoons, new game modes and per-tool targeting systems.

Before implementation, define sighting expiry configuration/clock, between-round placement/history, publishing colours and bulk-deletion geometry scope in the [toolbar specification](map-toolbar.md). Lifetime and edit/delete role policy are agreed above. Placement permissions do not automatically confer edit/delete rights.

Verify:

1. Friendly / Section → Enemy / Team → Friendly / previous Section.
2. A player without a section can place to their team without a section picker.
3. A commander can select every authorised own-team section and cannot target another team.
4. Admin Friendly / Red Bravo → Enemy / Red Team; Admin Only → Enemy requires a team choice.
5. Mode switching restores independent valid selections and removes privileged data from Player Mode.
6. Every drawing tool inherits the same placement state, without changing existing drawings.
7. Backend rejection/filtering prevents unauthorised placement and visibility, including forged enemy section/admin targets.
8. Membership/permission changes invalidate stale selections before further placement.
9. Only creators/admins edit; authorised own-team commanders can delete without gaining edit or field-management rights.
10. Round end clears tactical drawings while retaining field features; expired sightings disappear without their age resetting on navigation.
11. A single compact sighting-age timer appears beside the marker, without duplication in selection details.
