# Colour scheme

Status: **Agreed — Ranger green at night, Daylight for bright sun, orange for danger**, 11 October 2026. Replaces the 5 October "Ranger green throughout" decision. Visual reference: the colour row of the [design canvas](design-direction.md).

## Rules

- **Two schemes.** Ranger green (dark) is the default and the night scheme. Daylight (light) is for bright sun. Open: whether it follows the phone's light/dark setting or is a manual switch in settings.
- **Orange means danger only:** I'm hit, bleed-out timers, urgent alerts. It is never a team colour.
- **Team colours are only team colours:** Blue, Red, Yellow, Purple, in that order for 2, 3 and 4 team games. Always show the team name next to its colour.
- **Olive is for actions and selection**, never for team or danger.
- Enemy markers also use a dashed border, so they don't rely on colour alone.
- No glows, pulsing or flashing; a bleed-out timer must stay readable as numbers.
- The map's base style matches the scheme: dark map in Ranger green, light map in Daylight, so the screen is never half bright and half dark.

## Ranger green (night, default)

| Token | Value |
| --- | --- |
| Background | `#0B100C` |
| Panel surface | `#151C16` |
| Main text | `#D7E1D1` |
| Secondary text | `#A2B29F` |
| Border/grid | `#2D3A2D` |
| Olive accent (primary button fill, text `#0B100C`) | `#A8C58E` |
| Soft selection surface | `#182619` |
| Quiet action fill / text | `#28432C` / `#D9E7C9` |
| Map surface | `#0A140C` |
| **Danger** (fill, text `#0B100C`) | `#FF9F45` |
| Blue team | `#8EBBEF` |
| Red team | `#F09E92` |
| Yellow team | `#F2DE6B` |
| Purple team | `#C3A6F5` |

## Daylight (bright sun)

| Token | Value |
| --- | --- |
| Background | `#F3F5EE` |
| Panel surface | `#FFFFFF` |
| Main text | `#111A12` |
| Secondary text | `#4A5947` |
| Border/grid | `#C9D2C2` |
| Olive accent (primary button fill, text `#F3F5EE`) | `#3E6B2E` |
| Soft selection surface | `#E3EDDA` |
| Quiet action fill / text | `#D3E5C4` / `#1E3A18` |
| Map surface | `#E6EADF` |
| **Danger** (fill, text `#FFFFFF`) | `#C25A00` |
| Blue team | `#1F5FAF` |
| Red team | `#B8342A` |
| Yellow team (text; border `#8A6D00`) | `#7A6000` |
| Purple team | `#6B3FC4` |

## Still to test

Sunlight legibility and night glare need checking on real phones at field brightness. Check that Red/Purple and Blue/Purple are easy to tell apart at a glance outdoors; if not, adjust lightness rather than adding more hues.

## Battery considerations

Dark themes can reduce power use depending on the display and help in low light: [Android dark-theme guidance](https://developer.android.com/develop/ui/views/theming/darktheme). Lower brightness and a dark map also help: [Google Maps power guidance](https://developers.google.com/maps/documentation/navigation/android-sdk/optimize-power). Daylight will cost more power on OLED phones; that is the trade for readability in sun. Location updates, networking and screen-on time need their own measured budget.
