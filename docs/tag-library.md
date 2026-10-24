# Tag library

Status: phase 1 built 24 October 2026 (migration 0012). Agreed with Fraser the same day as part of the Patrol game and tag library plan.

## What a tag is

A tag is a short code such as `AT-7F2K`, printed as a QR code now and written as the same text onto NFC tags later, so a QR code and an NFC tag for the same thing behave the same. The code is random (`AT-` plus five Crockford base-32 characters, no I, L, O or U), so a printed sheet means nothing to someone who finds it.

A tag stands for one thing. Phase 1 binds tags to **field points**. Later phases add props and ability cards (saved in Your kit, usable at any field) and player wristbands (replacing the medic QR).

## Field points

- Every field point has a permanent id and a short number ("Point 3"), stamped by the server when the field is saved. Numbers stay unique in the field; a new point takes the lowest free number. A point sent back without its id on the same spot keeps its old id and number.
- Fields saved before 0012 get their ids the first time the owner opens the field's QR codes, and so do that field's Game Day copies, so the copies' points carry the same ids.
- The number shows in the field editor's list and on the map label.
- Duplicating a field copies its points but not its tags.

## QR codes screen

Fields → a field → QR codes (or QR codes for points in the field editor). Only the field's owner can open it.

- One row per point in the list-row style: label, kind and code on the left, the number large on the right. Opening a row shows the QR code.
- Every point gets a code automatically. A code works in every game at that field.
- **Print sheet**: a grid of labels (number, name, QR, code). On the web version it prints; on a phone take a screenshot.
- **Test scan** (phone): walk the field and scan each code. Rows you've checked turn green and say Checked.
- **Use another tag for this point** (phone): scan an existing code of yours to move it onto this point, e.g. after a point was deleted and re-added. A code belonging to someone else's field is refused.

## Scanning

The Scan tab reads both player codes and point codes. A point code works at any time (no game needed) and shows "Point 3", its label and the field. Day members see the point from the day's copy of the field; the owner can always see their own codes. Anyone else is told the code isn't a point on this day's field. Player codes still need a live game with medic rules.

Scanning a point does nothing else in phase 1. Patrol missions (phase 2) give scans their meaning.
