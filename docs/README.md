# Documentation

These files record agreed design direction, proposed defaults and open decisions. They do not confirm that features are implemented. Application source: `mobile/` (Expo app) and `supabase/` (database migrations and tests).

| Document | Owns |
| --- | --- |
| [Design direction](design-direction.md) | Agreed 11 October 2026 redesign: screen list, principles, type, and the link to the design canvas. Start here for how the app looks and flows. |
| [Architecture](architecture.md) | Application boundaries, backend authority and shared validation. |
| [App flow and navigation](app-flow.md) | Game Days, assignments, navigation, game lifecycle and shared data boundaries. |
| [Field Library](field-library.md) | Reusable field templates, boundaries, No-go/Danger areas, default icons and choosing a field for a Game Day. |
| [Game modes](game-modes.md) | King of the Hill, Team Deathmatch and Objective / Mission rules, defaults and unresolved decisions. |
| [Planning checklist](planning-checklist.md) | Open decisions, stage dependencies, field setup, battery/performance and readiness for implementation. |
| [Map marker targeting](map-marker-targeting.md) | Affiliation, audiences, sticky placement state and permissions across drawing tools. |
| [Map screen layout](map-screen-layout.md) | Agreed iPhone compact game strip, map shell, menu placement and visual reference. |
| [Map drawing toolbar](map-toolbar.md) | Map control layout, visible state and selection interactions. |
| [NFC interactions](nfc-interactions.md) | Wristband identity resolution and shared scan/action validation. |
| [Location and device operation](location-and-device-operation.md) | iPhone/Android target, Game Day/background tracking, stale positions, battery verification and open privacy rules. |
| [Medic gameplay](medic-gameplay.md) | Hits, wounds, treatment, death and new lives on respawn. |
| [Dog-tag gameplay](dog-tag-gameplay.md) | Capture eligibility, one capture per life, scoring and capture history. |
| [iPhone map layout preview](iphone-map-layout.html) | Interactive illustration of the map shell; placeholder content, not feature rules. |
| [Saved app pages preview](app-pages-preview.html) | Superseded by the [design direction](design-direction.md); kept for history. Saved 36-screen preview in the Ranger green scheme, including generic Scan, medic rulesets and the bleed-out countdown. Illustrative interactions, not an implemented app. |
| [Connected Game Day walkthrough](game-day-walkthrough.html) | Local clickable host/player journeys sharing one simulated day, including lifecycle, helper treatment, failure states and feedback export. |
| [Walkthrough testing guide](walkthrough-testing.md) | How to try the connected prototype, first-pass verification and limits. |
| [Walkthrough feedback review](walkthrough-feedback.md) | Five saved user notes, completed map/medic refinements and remaining requested journeys. |
| [Development setup](development-setup.md) | Supabase setup, running the app on phones and running checks. |
| [Colour scheme](colour-scheme.md) | Ranger green (night) and Daylight palettes, orange for danger, and four team colours. |
| [Colour exploration](colour-preview.html) | Earlier Day/Night/OLED alternatives; reference only, superseded by the [colour scheme](colour-scheme.md). |

Read the design direction for the screens, the app flow for the shared journey, then the relevant feature document. NFC, medic and dog tags form one gameplay loop, with each rule defined in its owning document and linked from the others.

## Document ownership

Define each rule in its owning document and link to it elsewhere. Architecture owns technical boundaries; app flow owns the shared journey and lifecycle; game modes and feature documents own gameplay; map screen layout owns the screen shell, while map toolbar and marker targeting own controls and audience rules. Previews illustrate written specifications and do not override them.

Use **Game Day** for the lasting event/session and **game** for an individual round. The player-facing Ready, Live and Complete labels correspond to the architecture's SETUP, ACTIVE and FINISHED states. A resume countdown remains PAUSED until activation.

An agreed design records direction. A proposed default is a suggested choice to confirm before implementing the affected feature. Future-work sections describe deferred ideas, not current requirements.

## Naming and references

Use lowercase, hyphen-separated filenames for topic documents and previews, such as `game-modes.md`. Keep the conventional names `README.md` and `AGENTS.md`. Use relative Markdown links for document references and update incoming links when renaming a file. Add new topic documents to this index.

## Implementation planning

[The current plan](../plans/current.md) selects Stage 1: sign-in, Game Days and lobby (Expo + Supabase). The completed [walkthrough prototype plan](../plans/walkthrough-prototype-2026-10-06.md) is archived. The [archived design review](../plans/design-review-2026-10-05.md) retains previous decisions and implementation blockers. Production implementation has not begun yet. Follow the [repository instructions](../AGENTS.md) when selecting its first stage.

Use the [planning checklist](planning-checklist.md) to resolve decisions for the selected stage. Record settled rules in their owning documents; the checklist is a backlog, not the active implementation scope.
