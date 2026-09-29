---
name: core-formula-library
description: "Proven formula patterns extracted from the 8 live backups. Copy the shape, change the values."
updated: 2026-09-29
---

# Formula library (all patterns live in production — see SPREADSHEET/*.txt)

Locale: argument separator `;` (Indonesian Sheets). LET names ≥4 letters, every
`&`/`REPT` inside `ARRAYFORMULA` (see `core-formula-traps.md`).

## P1 — Chunked IMPORTRANGE (Raw_BELL-A1-v6)
One wide call fails (~334k+ cells). Split into ≤~100k-cell calls, one LET name
per chunk (`chunk1…chunk5` — 4+ letters, not `c1`):
```
=LET(chunk1;IMPORTRANGE("<form-url>";"'Form Responses 1'!A2:AE");
     chunk2;IMPORTRANGE("<form-url>";"'Form Responses 1'!AF2:BE"); … )
```
Source URLs live in the tab's own A1 — read from there, never retype.

## P2 — Branch-collapse concat (Raw_BELL nma/otl)
Form repeats a field N times (branches on TL), exactly one filled per row.
Collapse with `&` under one ARRAYFORMULA:
```
nma;ARRAYFORMULA(CHOOSECOLS(chunk1;20)&CHOOSECOLS(chunk1;22)&…&CHOOSECOLS(chunk1;30))
```

## P3 — Self-describing tab (Raw_BELL / Raw_SMV tail)
Header as HSTACK literals, data below via VSTACK — tab carries its own schema,
byte-identical across sources:
```
VSTACK(HSTACK("Timestamp";"Email Address";…); <data-rows>)
```

## P4 — Stack + scope filter + header re-attach (SOURCE-OF-TRUTH-A1-v3)
FILTER drops the header (it matches neither name nor scope) — re-attach it:
```
=LET(stacked;VSTACK(Raw_BELL!A1:DR;Raw_SMV!A2:DR);
 keep;ARRAYFORMULA((LEN(namecol)>0)*(scope-matches)>0);
 VSTACK(ARRAY_CONSTRAIN(stacked;1;122);FILTER(stacked;keep)))
```

## P5 — Month feed with blank-guard + header fallback (CAL_FEED-A3-v2)
MONTH(empty)=12, so guard reality first; FILTER-no-match errors, so fall back to
a bare header (keeps downstream shape):
```
bln;ARRAYFORMULA(IFERROR(MONTH(t);0));
real;ARRAYFORMULA(LEN(namecol)>0);
hit;ARRAYFORMULA((bln=9)*real*(areas)>0);
f;IFERROR(FILTER(src;hit);ARRAY_CONSTRAIN(src;1;10))
```

## P6 — Normalise-then-emit (CAL_FEED columns)
Form text is messy — UPPER+TRIM at emit time, DAY/MONTH zero-guarded:
```
HSTACK(ARRAYFORMULA(IFERROR(DAY(datecol);0));
       ARRAYFORMULA(IFERROR(MONTH(datecol);0));
       ARRAYFORMULA(UPPER(TRIM(areacol))); … ; valuecol)
```

## P7 — Self-removing dummy row (CAL_FEED-H3-v2)
Count before choosing: empty month shows one dummy row (keeps ranges alive),
real data replaces it — no manual cleanup, no stray rows:
```
dummy;HSTACK(1;10;"SURABAYA";"DUMMY BA";"DUMMY OUTLET";"DUMMY BRAND");
IF(SUM(hit*1)=0;dummy;out)
```

## P8 — Composite-key join, no row positions (MISMATCH-A2-v4)
Match feed vs block on `(BA, outlet)` as delimited keys — immune to row moves:
```
tkey;ARRAYFORMULA(blk&"|"&bo);
fkey;ARRAYFORMULA(feedBA&"|"&feedOutlet);
hit;ARRAYFORMULA(COUNTIF(tkey;fkey));
ok;ARRAYFORMULA((LEN(feedBA)>0)*(hit=0))
```

## P9 — Closest-match per row (MISMATCH col E)
Containment both directions (strict — no fuzzy), first match or `"-- none --"`:
```
best;MAP(SEQUENCE(ROWS(bad));LAMBDA(i;LET(
  n;INDEX(badBA;i);s;INDEX(badOutlet;i);
  c;FILTER(bo;blk=n);
  m;FILTER(c;ARRAYFORMULA((ISNUMBER(SEARCH(c;s))+ISNUMBER(SEARCH(s;c)))>0));
  IFERROR(INDEX(m;1);"-- none --"))))
```

## P10 — Empty-safe diagnostic output (MISMATCH tail)
Zero matches → one blank 1×5 (MAKEARRAY), not an error, not a stray row:
```
IF(cnt=0;MAKEARRAY(1;5;LAMBDA(x;y;""));HSTACK(DATE(2026;m;d);…;best))
```

## P11 — Grid fill, triple-condition MATCH (CAL_FEED-A1/H1-grid, PARKED)
Cell = value where (BA ∧ outlet ∧ day) all agree, normalised both sides.
Bounded to the CURRENT live block (v3 = `$B$297:$B$381`, verified live
2026-09-29: 85 contiguous Rara rows; previous v1 `321:396` silently dropped 24
rows after the block moved):
```
MAKEARRAY(ROWS($B$297:$B$381);COLUMNS($J$1:$AM$1);LAMBDA(r;c;
  IFERROR(INDEX(brd;MATCH(1;INDEX(
    (nma=UPPER(TRIM(INDEX($B$297:$B$381;r))))*
    (otl=UPPER(TRIM(INDEX($F$297:$F$381;r))))*
    (tgl=INDEX($J$1:$AM$1;1;c));0);0));"")))
```
⚠️ REVERSAL LESSON (2026-09-29): v2 tried whole-column `$B:$B` per traps §7 —
correct in theory, UNUSABLE in practice (1000×30 spill fits nowhere: not the
hand-edited F27, not a test tab without 1000 clear rows). Reverted to bounded +
update-rows. Rule refined: whole-column for LOOKUPS (MISMATCH P8, cal feed);
bounded + re-verified rows for GRID OUTPUT placed mid-sheet. A grid formula's
rows are a maintenance item, not a one-time fix — re-check the block extent
whenever the grid looks short.
Day header `$J$1:$AM$1` kept bounded (row 1 structural; whole-row = ~1000 cols).
H1 (Oct) keeps Sept's day range until the October grid block exists (HANDOFF §9).

## P12 — DATE reconstruction (MISMATCH col A)
```
ARRAYFORMULA(DATE(2026;monthcol;daycol))
```
