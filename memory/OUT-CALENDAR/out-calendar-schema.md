---
name: out-calendar-schema
description: "OUT-CALENDAR: 122-col canonical schema, BELLS/SMV asymmetries, SoT formula, target block"
updated: 2026-09-29
---

# OUT-CALENDAR schema

## Canonical layout — 122 columns, identical in both raw tabs

```
1-22    Timestamp · Email Address · Tanggal Bekerja · Nama BA · Nama Outlet · Area ·
        TL · Category · Seragam · Brand Focus · Nama PIC Outlet · Jumlah Visitor ·
        Jumlah customer approach · Jumlah Pembeli · SKU Sampling ·
        Jumlah Botol Sampling yang di bawa · Serving Sampling · Mixer Sampling ·
        Jumlah Peminum Sampling · Absen Foto · Foto Activity Sampling · Foto Sales
23-120  the 98 SKU columns — same names, same order in both sources
121-122 Issue/Kendala di lapangan · Insight
```
(Live CSV headers 2026-09-29 match this order.)

## Source asymmetries (every bug lives here)

| | |
|---|---|
| `TL` (canonical 7) | BELLS only — blank for SMV rows |
| `Jumlah Botol Sampling yang di bawa` (canonical 16) | SMV only — blank for BELLS rows |
| `Nama BA` / `Nama Outlet` | BELLS repeats them SIX times (source cols 20–31, branches on TL). Each row fills exactly ONE pair (verified 782/782). Collapse by concatenation |
| `Serving` / `Mixer Sampling` | near FRONT in BELLS (Q, R), at very END in SMV (DP, DQ) |
| SKU block | BELLS `AF:DY` · SMV `T:DM` |
| Widths | BELLS 131 cols (`A:EA`) · SMV 121 (`A:DQ`) |

## SOURCE OF TRUTH — area scope

```
=LET(stacked;VSTACK(Raw_BELL!A1:DR;Raw_SMV!A2:DR);
 a;CHOOSECOLS(stacked;6);
 keep;ARRAYFORMULA((LEN(CHOOSECOLS(stacked;4))>0)*
      ((a="Surabaya")+(a="Sidoarjo")+(a="Malang")+(a="Mojokerto")+(a="Kediri"))>0);
 VSTACK(ARRAY_CONSTRAIN(stacked;1;122);FILTER(stacked;keep)))
```
`ARRAY_CONSTRAIN(stacked;1;122)` re-attaches the header — `FILTER` would drop it.

## Target block (F27, via the 2026.09 importrange tab)

Row 2 header: `A=Nama TL · B=NAMA BA · C=CHANNEL · D=AREA · E=STATUS BA ·
F=OUTLET · G=BRAND FOCUS`. Row 1 = day numbers from column J. Rara's block live
rows **297–381** (85 contiguous, verified 2026-09-29; was 296–379 + 452–458 —
the block MOVES, re-check on any short grid).

> **Lookups use whole columns** (`$B:$B` / `$F:$F`). **Grid OUTPUT stays bounded
> to live block rows** (v3) — whole-column grids spill 1000×30 and fit nowhere
> (tried, reverted 2026-09-29).
