# Hits and medic rules plan

Status: built 12 October 2026 with QR codes for scanning (Fraser: "build but we will switch later" to NFC). Built from docs/medic-gameplay.md (Simple mode and Reusable medic rulesets). Where the doc left a question open, the default I picked is marked **Default**.

## 1. Medic rules library (like Fields)

- **Home → Your kit → Medic rules**, and also under **Hosting**.
- The list shows each set with a hit summary ("Leg · Arm · Dead"), what happens at bleed-out and who can help. Your default set is marked.
- Every set can be **duplicated**, **renamed**, **edited**, **deleted** and **made default**.
- **Editor:** one tab per hit (1st, 2nd, 3rd = dead).
  - Each tab has a wound name, the instruction shown to the player (for example "Bandage the leg, walk only"), and chips for who can treat it (or, for death, who can bring them back).
  - One choice for bleed-out at zero: **Dead** (needs bringing back) or **Wait for help** (stays out of play).
- **Helper chips:** Medic (players whose role today is Medic), Any teammate, Section lead, Admin.
- **Built-in starter sets** can be duplicated but not changed:
  - **Standard:** Leg (teammate or medic) · Arm (medic) · Dead (admin brings back) · Dead at zero.
  - **Medic only:** every wound needs a medic · Dead (admin) · Dead at zero.
  - **Buddy aid:** any teammate treats everything and brings back · Wait for help at zero.
- **Default, who can edit:** you edit your own sets. Sharing sets with other admins comes later.

## 2. Game setup

- A **Medic rules** picker in game setup (any mode), with **Off** as an option. **Default:** your default set.
- **Bleed-out** time per game, 10 minutes by default (1–30).
- Saving the game copies the rules into it, so editing the saved set later never changes a game that's already set up. Players see the game's rules from the Game tab.

## 3. During play

1. **I'm hit:** an orange button at the bottom of the Map while the game is live. Tapping it (with a confirm) opens the full-screen **Hit** view:
   - "Hit · awaiting medic" and a big **Bleed out** countdown
   - your scan code for the medic
   - **View map**
   The wound stays hidden until someone scans you. The countdown freezes while the game is paused.
2. **Scan:** the Scan tab opens the camera (it already had a placeholder, so it's used instead of a map rail button). Scanning a hit player's code shows their name and hit number. If you're allowed to treat them, it also shows the wound, the time left and the treatment, with one **Treatment done** button that puts them back in play. If you're not allowed, it says who can, without revealing the wound.
3. **The sequence:**
   - Leg, then arm, then dead within one life. Treatment keeps your progress.
   - Bringing a dead player back starts a new life.
   - Hits are ignored while you're already wounded.
   - At bleed-out zero, the set decides: Dead, or Wait for help.
4. **Status label** on the Map: In play, Awaiting medic, or the last revealed wound.
5. **Admins** can undo an accidental hit from the player's card, with a reason. It's kept in the history.
6. Every hit, treatment, death and return is recorded per game, ready for results and Team Deathmatch.

## Defaults for the open questions

- **Default, scanning:** the doc wants an NFC wristband scan. NFC doesn't work in Expo Go, so for now the hit player's screen shows a **QR code** that the helper scans with their camera. It still needs the two of you together. Wristbands can replace it later with the same rules.
- **Default, offline:** I'm hit needs a connection in this stage. The offline "hit pending" flow comes later.
- **Later:** nearest helper with distance and Ping; editing a game's medic rules while paused; dog tags.

## Build order

1. Database:
   - medic rule sets with built-in starters and an owner-only library
   - game copy and bleed-out setting
   - lives, wounds and an event history
   - hit, treat, bring back, undo and bleed-out on the server clock, freezing while paused
   - PGlite tests
2. App: Medic rules library and editor (Home kit and Hosting) plus the game setup picker.
3. App: I'm hit, the Hit view and countdown, Scan with the camera, the status label and admin undo.
4. Type check, lint, web and Android exports, commit, test steps.
