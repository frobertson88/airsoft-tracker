# Map tools plan

Status: built 12 October 2026 (migration 0008 applied); waiting on phone testing. Fraser agreed the defaults below. Built from docs/map-toolbar.md and docs/map-marker-targeting.md. Where those docs left a question open, the default I picked is marked **Default**.

## What players get

A slim icon rail on the left of the Map:

1. **Map** (cursor): normal panning, and drag your own markers to move them. Tapping it cancels any tool.
2. **F / E**: Friendly or Enemy, one tap to switch.
3. **SEC / TEAM**: who sees it. One tap toggles your section or your whole team. Enemy is always the whole team.
4. **Icons**: a small palette of markers. Pick one, then tap the map to drop it (repeat taps drop more).
   - Friendly: Infantry, Recon, MG, Sniper, Leader, 2IC, FOB, Rally.
   - Enemy: Infantry, FOB, Rally, Sniper, MG, Drone, Vehicle, Package.
5. **Draw**: Label, Waypoints (numbered, optional joining lines), Arrow, Line, Area, Defence line, Attack line.
6. **Delete**: tap corners around markers, see "Delete 4", confirm or cancel.

A thin strip above the bottom shows the tool, F/E, audience and a hint, plus Finish/Cancel for multi-point drawings.

- Enemy markers have a dashed frame and an E badge, and a small quiet age timer ("12m"). They disappear after 30 minutes.
- All drawings belong to a game and clear when it ends. Field boundaries and No-go/Danger areas are never touched.

## Who sees and changes what

- The server only ever sends you drawings meant for you (your section, your team, or admin-only for admins). Nothing hidden is sent and then hidden on the phone.
- You can move and delete your own drawings. Admins can move and delete anyone's.

## Defaults for the open questions

- **Default, colour:** drawings use the creator's team colour (there are no section colours yet). The section name shows when you tap a drawing.
- **Default, deleting lines and areas:** the corner-boundary Delete removes markers only, as the doc proposes. Tapping any drawing you're allowed to change shows a small card with Delete, so lines and areas can still be removed.
- **Default, sighting expiry:** fixed at 30 minutes of real time (it keeps counting while paused). Moving a sighting doesn't reset its age. A setting can come later.
- **Default, between games:** drawings made between games (briefing) carry into the next game and clear when it ends.
- **Default, commanders:** there is no commander role yet, so only creators and admins can change things. Section leads get nothing extra for now.
- **Default, admin view:** admins get a "Host view" switch in the Map. Off, they see what their team sees. On, they see every team's drawings and can target any team, section or Admin only. A banner shows while it's on.
- **Default, icons:** simple icons from the icon set already in the app (Material Community Icons). Final artwork later.

## Out of scope

Scan/NFC, I'm hit and medic status, and the top-left game strip / top-right menu redesign of the Map screen. Those come with the medic stage.

## Build order

1. Database: a `map_objects` table read through an audience-filtered view or policy; RPCs to place, move and delete (single and by boundary); clearing at game end; sighting expiry. Tests in PGlite.
2. App: rail, F/E and audience state, Icons palette and placement, drag to move, boundary delete, Host view.
3. App: Draw tools (Label, Waypoints, Arrow, Line, Area, Defence/Attack line).
4. Type check, lint, web and Android exports, commit, test steps.
