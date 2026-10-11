# iPhone map screen layout

Agreed design: **Compact game strip with left-rail Scan, status label and bottom I'm hit**, 5 October 2026, refreshed 11 October 2026 in the [design direction](design-direction.md). Map has no bottom navigation or self-medic toolbar icon.

Refresh (11 October 2026): the bottom button reads **I'm hit** in the danger orange and opens the full-screen Hit view; a compact tool strip (tool · affiliation · audience, hint, Done) sits just above it while a tool is active; marker codes are short labels until icon art exists, with enemy markers dashed.

## Purpose

Use the [colour scheme](colour-scheme.md) on Map and its controls: a dark map in Ranger green, a light map in Daylight.

Maximise usable map space on an iPhone. The map fills the screen behind small floating controls. This document records the agreed layout and interaction direction for implementation.

## Main layout

- Top left: a compact, single-line game strip showing game, score and timer. Keep it below the iPhone safe area.
- Top right: a small main-menu icon, separate from the game strip.
- Left edge: small tool icons in a compact vertical toolbar, including generic Scan. Do not show a self-medic icon. A separate status label shows In Play, Awaiting Medic Scan or the last revealed assessment using text as well as colour. New injury details and progression stay hidden until a medic scan.
- Beside the active tool: a horizontal, icon-only submenu opening to the right, aligned with that tool.
- Bottom: a direct **I'm hit** button which becomes a **Bleed out · MM:SS** countdown after an accepted hit. There is no permanent navigation menu. Compact selected-tool information/options appear above it only when needed, respecting the home-indicator safe area.
- Keep the centre and right of the map clear. Respect the home-indicator safe area at the bottom.

## Interaction flow

1. Tap Icons or Draw. Highlight the tool and show its submenu beside it. Direct actions follow the [toolbar specification](map-toolbar.md#interaction).
2. Tap a submenu icon. Close the palette, keep the selected action active and show its name, guidance and available options at the bottom.
3. Open additional options from the bottom area when needed. Closing those options returns to the compact information strip.
4. Selecting another tool replaces the submenu and clears information for the previous action.
5. Keep only one tool submenu visible at a time.
6. Scan opens the shared NFC reader flow for wristbands or objective tags.
7. I'm hit directly submits a hit during eligible live play and shows Awaiting Medic Scan after acceptance. The status label does not reveal new injury details before a medic scans. There is no self-medic toolbar button. See [medic gameplay](medic-gameplay.md#reporting-and-revealing-an-injury). Treatment and respawn still require an authorised second party. The mockup illustrates local state changes only.

## Icons and touch

Use small, consistent icons, approximately 16 points visually, inside generous touch targets of at least 44 by 44 points. Both the main toolbar and its submenus are icon-only. Provide accessible action names; identification must work on touch without relying on hover. Show the selected action's name in the bottom area.

## Relationship to existing map controls

The [map toolbar specification](map-toolbar.md) owns the actual rail controls, marker catalogue, drawing tools and palette interactions. [Map marker targeting](map-marker-targeting.md) owns affiliation/audience state and permissions. The preview uses generic tools to demonstrate positions and interaction only; implement the real catalogue and controls from those documents.

Enemy sighting ages use one small, quiet timer beside each marker, without repeating the timer in selected-marker details. Review compact spacing on phones; see [sighting rules](map-marker-targeting.md#drawing-lifetime-permissions-and-sighting-age).

## Main menu

The top-right button opens a dismissible bottom sheet with Game (round and mode), Squad (assignment), Medic rules (the game's copy) and, for admins, Host. Generic Scan is directly available on the left toolbar. There is no permanently visible bottom navigation bar on Map. Other main screens retain their bottom navigation.

## Build reference

See [interactive layout preview](iphone-map-layout.html) and the [map toolbar specification](map-toolbar.md).

The preview is a rough interaction guide, not a finished app. Its map grid, tool choices, menu entries, score of 120 and timer of 04:32 are illustrative placeholders. Implement the agreed positions and interaction hierarchy using the actual game's tools, data and visual style.

## Still to define

- Final icon artwork; actual controls, submenu actions and their order are specified in [map toolbar](map-toolbar.md).
- Meaning of the game label, score and timer.
- Final presentation of action-specific information and bottom options; required behaviour is specified in [map toolbar](map-toolbar.md).
- Final main menu presentation.
- Whether a map tap dismisses an open palette before an action is selected. After selection, dismiss the palette as specified in the toolbar document.
- Landscape behaviour and small-screen adaptations.

## Acceptance guide

- Map extends behind floating controls with no permanent full-width header or bottom navigation bar.
- Compact game strip is at the top left and main menu at the top right.
- Tool icons sit on the left and open icon-only submenus beside themselves.
- Bottom information reflects the selected submenu action, rather than just the parent tool.
- Scan is available in the left toolbar, with no self-medic icon. After an accepted hit, the separate status label shows Awaiting Medic Scan without the new injury or progression count.
- I'm hit is directly available at the bottom and is replaced by the bleed-out countdown after a hit; tool information and open panels do not cover either state.
- Game, Squad, Medic rules and (for admins) Host are reachable through the top-right menu on Map.
- Controls fit iPhone safe areas and remain easy to tap.
