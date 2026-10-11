# Map drawing toolbar

Status: proposed UI behaviour. This document owns the map drawing controls; it is not a generic toolbar framework.

## Layout

The agreed full iPhone screen uses the **Compact game strip** layout: game/score/timer at top left, main menu at top right, and the map extending behind small floating controls. See [map screen layout](map-screen-layout.md) and its [interactive preview](iphone-map-layout.html) for the application shell. This toolbar document owns the actual controls and action behaviour; generic preview tools are placeholders.

Phone-first layout: maximise usable map space. Use a narrow icon-only rail on the left, with shared controls above drawing tools. The labels below describe controls; they are not full-size text buttons:

```text
[ADMIN indicator when in Admin Mode]
[Cursor / Map — return to normal map interaction]
[Scan — shared wristband/objective reader]
[F / E — Affiliation]
[SEC / TEAM or named audience — Target]
[Icons — opens marker catalogue]
[Draw — Label, Waypoints, Arrow, Line, Area, Defence line, Attack line]
[Delete — starts boundary drawing directly; no submenu]
```

Icons and Draw open compact icon-only palettes beside the rail. Show only one palette at a time and close it after a choice, leaving the selected tool active for placement. Do not use a large menu panel or persistent menu headings/descriptions over the map. Keep touch targets around 44 px even when the visible icon is smaller. Give every icon an accessible name and a discoverable label; hover must not be the only way to identify it.

Scan is a direct gameplay action rather than a drawing tool. There is no self-medic toolbar icon. A separate label shows the player's known/pending state, hiding new injury details and progression until a medic scan. I'm hit is a direct button at the bottom of the map, replaced by a bleed-out countdown after an accepted hit. Opening Scan dismisses any drawing palette; it does not change sticky affiliation/audience selections. Map navigation remains in the top-right menu, with no permanent bottom navigation bar. Tool information and open panels sit above I'm hit or its countdown.

Use a compact bottom strip for the selected tool name, affiliation, audience and a short action hint. Keep text small but readable (approximately 12 px, respecting text scaling). Tool-specific options and Finish/Cancel or deletion confirmation appear here only when relevant, in compact rows; avoid a tall persistent bottom sheet. Expand only as required for readable content and accessible touch targets.

Always show affiliation and audience while drawing, using compact rail indicators and the bottom strip. Use colour plus F/E or an equivalent icon and accessible labels/tooltips; do not depend on colour alone. Named commander/admin section targets must identify the section, and admin targets must identify the team as well. Admin Only must be explicit.

## Interaction

- Cursor / Map is the first toolbar button and the default active state. It closes tool menus, exits placement/deletion, clears tool selection and discards any uncommitted drawing or deletion-boundary draft. Committed objects and sticky affiliation/audience selections remain unchanged.
- Affiliation is a one-click Friendly/Enemy toggle with no submenu.
- Normal-player Friendly Target toggles SEC/TEAM. Commander/admin Target opens a menu when multiple authorised choices exist.
- Enemy displays the team audience, prevents section/admin selection, and allows authorised admins to choose another team.
- Show when a required audience has not been selected and prevent placement until valid.
- Tool changes and repeated placements retain shared selections.
- Delete enters boundary drawing immediately, closes any palette and exposes boundary actions in the bottom strip; it has no tool-selection submenu.
- Drawing tools consume shared affiliation/target state; they do not define their own audience rules.

The [targeting feature](map-marker-targeting.md) owns permissions, defaults, target promotion, restoration and validation. Keep those rules there rather than duplicating them in toolbar components.

Admins enter the admin map view from the **Host tab**, as defined by [app flow](app-flow.md#12-admin-and-marker-views). Keep the Admin indicator visible without adding an Admin switch to the drawing toolbar.

## Cheap text mockup

Labels below stand in for icons; the rail and palettes render icons rather than these full text labels. This is a partial interaction sketch, not a full phone screen or final artwork.

```text
LEFT TOOLBAR         ICONS MENU — FRIENDLY
┌─────────────┐      ┌───────────────────────────────┐
│ Cursor / Map│      │ Pick a symbol below:          │
│ F Friendly  │      │ Infantry  Recon     MG Gunner │
│ SEC Alpha   │      │ Sniper    Leader    2IC       │
│ Icons ▸     │      │ FOB       Rally               │
│ Draw ▸      │      └───────────────────────────────┘
│ Delete      │      Pick one, then tap map to place.
└─────────────┘
                     Repeated taps place the same type.

ICONS MENU — ENEMY       DRAW MENU
Infantry  FOB    Rally   Label          Waypoints
Sniper    MG    Drone   Arrow          Line
Vehicle   Package       Area           Defence line
                        Attack line

WAYPOINTS               DELETE WITHIN BOUNDARY
Link points: [Off/On]   Tap boundary corners → Close boundary
Tap map: 1 → 2 → 3      Preview: 4 removable markers
[Finish] [Cancel]       [Delete 4] [Cancel]

COMPACT BOTTOM STRIP
Infantry · Friendly · SEC Alpha
Tap map to place
Relevant options/actions only; small readable text.

CURSOR / MAP ACTIVE
Drag empty map to pan; select/drag an authorised object to move it.
No separate Edit mode or Done button.
```

## Marker catalogue

| Affiliation | Initial marker types |
| --- | --- |
| Friendly | Infantry, Recon, MG Gunner, Sniper, Section Leader, 2IC, FOB, Rally |
| Enemy | Infantry, FOB, Rally, Sniper, MG, Drone, Vehicle, Package |

Use a small static catalogue with stable type IDs, display names, icon asset references and allowed affiliations. Share an icon asset where the symbol means the same thing. The menu filters that catalogue by affiliation; one marker renderer and placement path handle all entries. Adding a type should normally require only a catalogue entry and an asset, not another component or backend handler. No plugin system or icon generator is needed.

Use simple vector icons from one established set where practical. Palettes use icons with accessible/discoverable names; show the selected type's text name in the compact bottom strip. Final artwork is a later implementation choice. Friendly/Enemy must remain recognisable from an F/E badge or distinct frame as well as toolbar colour. If a selected type is unavailable after an affiliation change, fall back to Infantry and visibly update the selection.

Friendly placement can indicate a suggested destination or position, such as “MG Gunner here” or “Rally here”. These are annotations, not automatic orders, assignments, spawning locations or game objectives. Optional short label text can clarify intent. A symbol does not add gameplay behaviour by itself.

## Colour and publishing section

When a section publishes a drawing, use that section's colour for the icon frame and drawing stroke, even when the audience is Team or the affiliation is Enemy. Use F/E badges or frame shapes to preserve affiliation independently; do not recolour every enemy drawing red. Menu affiliation controls can retain their Friendly/Enemy colour cues.

Publishing section and recipient section are separate. Proposed default: Player Mode uses the creator's section; Admin Mode targeting a section uses that selected section's colour, while team/admin targets use their team/neutral colour. An unassigned player uses their team colour. Show section identity in object details so colour is not the only identifier. Confirm these admin/unassigned defaults before implementation.

## Drawing tools

- **Label:** tap a position, enter short text and place a standalone annotation.
- **Waypoints:** tap an ordered sequence; number points in order. An optional Link points toggle connects consecutive points with straight segments. Finish commits the sequence; Cancel discards the draft. This does not calculate routes or navigate around obstacles.
- **Arrow / Line:** tap start/end; show a preview before finishing.
- **Area:** tap boundary points and explicitly finish a closed shape.
- **Defence line / Attack line:** use the shared line tool with distinct named styles, rather than separate geometry implementations. These express tactical intent without enforcing gameplay effects.

Only one placement/delete tool is active at a time; Cursor / Map exits either. Shared affiliation, audience and publishing section are captured when a draft starts; later changes apply to the next drawing. Finish and Cancel must be explicit for multi-point drafts.

## Move and delete

Objects are movable without entering an Edit mode. In normal Cursor / Map interaction, select/drag an authorised icon or label to move it; selecting a line, area or waypoint sequence reveals its shared geometry handles. Dragging empty map pans it. Placement and deletion tools reserve map gestures for their current action; Cursor / Map returns immediately to normal object movement and map navigation. Cursor state does not grant movement permissions.

The toolbar has one Delete action: deletion within a boundary, with no Single Delete submenu. Drop at least three boundary points, close the polygon, highlight eligible markers inside it, then explicitly apply the shown count or cancel using compact bottom actions. Drawing the boundary never deletes immediately. Proposed first scope: point markers whose anchors lie inside/on the boundary; labels, waypoint sequences, lines and areas are excluded until their inclusion rules are agreed. Any future individual-object deletion belongs in a separately agreed object-details flow.

Deletion and movement always require backend authorisation for each object; showing it on the map is insufficient. Agreed: creators and authorised admins can edit; creators, authorised own-team commanders and admins can delete. Commanders do not gain others' edit rights merely through targeting permission, and cannot delete hidden/Admin Only or field features through tactical drawing controls. Admin edits/deletes use Admin Mode. Permission changes or already-deleted objects must be reported without pretending the whole operation succeeded. [Marker targeting](map-marker-targeting.md#drawing-lifetime-permissions-and-sighting-age) owns round lifetime, sighting expiry and the single quiet age timer beside each marker.

## Review and implementation boundaries

This is a design proposal, not a current implementation plan. First settle colour attribution and deletion scope, then implement catalogue/point placement before multi-point drawing and bulk deletion. Add a broader shared-toolbar document only when another toolbar has demonstrated shared behaviour.

The reviewed phone mockup illustrates only the toolbar, compact palettes and bottom information/actions. Keep written behaviour as the specification; do not embed the mockup as a complete screen design. It does not settle final icon artwork, the full app shell or outstanding permission/colour policies.

Acceptance checks should cover compact phone layout and readable bottom text/options, accessible icon names and touch targets, palette dismissal after selection, catalogue filtering, section colours at team scope, friendly destination annotations, authorised movement without Edit mode, empty-map panning, Cursor exiting tools/discarding drafts without changing committed objects, Delete entering boundary drawing without a submenu, authorised boundary preview/confirmation/cancel, linked/unlinked waypoints and preservation of targeting across tools.
