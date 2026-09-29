---
name: domain-scope
description: "This repo's ops domain shared by both outputs: areas, roster, date authorities, naming"
updated: 2026-09-29
---

# Domain scope (shared by OUT-CALENDAR and OUT-PHOTOS)

One field operation: BAs sampling and selling across Jatim. Calendar records
WHAT happened (brand focus per BA/outlet/day, from forms); photos record PROOF
(b delivery photo per BA/day, from WhatsApp).

## Areas (5)

**Surabaya · Sidoarjo · Malang · Mojokerto · Kediri.** The calendar feed filters
on exactly these. The photo roster covers the same five (6 SBY + 2 Malang +
1 Mojokerto + 1 Sidoarjo + 1 Kediri = 11 BAs).

## Roster (home: ICE-CUBE-DOCS/REFERENCE.md § The roster)

11 BAs, each confirmed from two independent sources (DM pinned message + `Jatim
tok` member list). Folder pattern: `<CITY> <NAME> <number>`
(e.g. `SBY LAVITA 852-3619-2050`). WA staging uses short labels (`LAVITA`);
mapping lives in `ICE-CUBE-TOOLS/SHARED/wa_common.py` MAP. `config.json`
`columns` keys match uppercase with the trailing number stripped.

Authority rules:
- **The spreadsheet's BA list is the authority** for who is a BA. Not in the
  list → nowhere for a report to go, nothing to fix (`~the hermit` case, settled).
- Adding a BA = add subfolder + `columns` entry. That is all it takes.
- Non-BAs on record: `+62 822-5728-2525`, `Mama Rara 3` (group admin).

## Date authorities (two — same (BA, day) facts, different sources)

- Calendar side: the form's date field. **Both forms use M/D/YYYY — read the
  SECOND field as the day.** Proven: 1,813 values have the second field > 12
  (`7/13/2026`), zero have the first > 12. Reading the first silently halves the
  lookup.
- Photo side: the Timestamp Camera overlay burned into the image. Never
  send-time, never caption.
- **Caption and send-time are never authorities.** One photo captioned "26 sept"
  carried a 25 September overlay. Nominal/outlet live ONLY in captions (not in
  photos) — that split is why captions are read separately and never for
  identity or date.

## Naming

- BA-folder photos: `DD-MM.jpeg`; same date different image: `DD-MM-(1).jpeg`.
  Date-first so folders sort chronologically.
- NOTA copies: `<NAME> DD-MM <number>.jpeg` — name-first, that folder is worked
  by person. `insert.js` accepts the number suffix with/without `+62`, so
  renaming is always safe.

## Floating vs in-cell images

A photo inserted *over cells* leaves the cell empty, so a `<>""` test reads
FALSE though the photo is visible. Found on the photo side, applies to calendar
checks too. Tell the mode from the cell's Formula Bar.
