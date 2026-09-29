# HANDOFF — RARA calendar automation

Everything a new agent needs. Read this before touching anything.

---

## 1. Scope

**Automate the `Rara Raditya Moniko Tama` block of a monthly calendar.** That block is
the only thing in scope. Every other TL block is hand-entered by other people — do not
touch it, do not "fix" it, do not reformat it.

The job: two Google Forms collect attendance + brand data. That data is normalized into
one canonical schema, trimmed to a small feed, and the feed fills Rara's block of the
calendar grid.

### Write scope — which files may be edited

| Spreadsheet | ID | Access |
|---|---|---|
| **DAILY SCHEDULE F27** (the real target) | `1OUfxxbL5AYtYi0qsYtc0rLFxKzC36zxv-ntYdtljl6o` | **READ ONLY — NEVER WRITE** |
| **JATIM RARA** (staging) | `1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM` | read + write |
| **Tracking Ice Cube**, tab `RARA` | `1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4` | read + write |

**DAILY SCHEDULE F27 is production.** You read it to learn what the real calendar
contains. You never write to it — not to correct something that looks obviously wrong.
Report it instead.

The browser normally has both the target and JATIM RARA open. **Always pin the page by
ID** before acting (§4) — a bare `pages[0]` lands on the wrong file.

---

## 2. Where things live

```
C:\RARA\                          git repository — ONE project, TWO report outputs
  SPREADSHEET\                    OUT-CALENDAR: formula backups, docs, tools
  ICE-CUBE\                       OUT-PHOTOS: photo pipeline (own tools, docs, session)
    ICE-CUBE-TOOLS\  ICE-CUBE-DOCS\  ICE-CUBE-SEPT\
  BROWSER-AUTOMATION\             the shared automation Chrome profile (sibling, not inside)
```

`ICE-CUBE\` is the photo half of the same reporting job (WhatsApp photos into the
Tracking sheet) with its own tools, docs and session — see `ICE-CUBE-DOCS\README.md`.
This document covers the calendar half. Both halves share the browser profile below.

---

## 3. The pipeline

```
BELLS form ──► Raw_BELL ─┐
                         ├─► SOURCE OF TRUTH ──► CAL_FEED ──► calendar grid
SMV form ────► Raw_SMV ──┘    739 rows x 122      166 x 6
                              (area-scoped)
                                      │
                                      └─► MISMATCH   diagnostic — feed rows with no
                                                     home in the target block

STAGING ──────────────────────────────────────────► independent fallback path (do not touch)
```

Workbook: the spreadsheet titled **"JATIM RARA"**. Its tabs:

```
STAGING · Raw_BELL · Raw_SMV · SOURCE OF TRUTH · CAL_FEED · MISMATCH
2026.09 (SEPT)-importrange · Sheet10
```

- **`2026.09 (SEPT)-importrange`** is **live production data**, imported from
  DAILY SCHEDULE F27. It is the reference for what the real calendar contains.
- Source form URLs are embedded in **cell A1 of `Raw_BELL` and `Raw_SMV`** — read them
  from there, never retype them.

### Live cells — the complete map

| Cell | Holds | Produces |
|---|---|---|
| `Raw_BELL!A1` | 5 IMPORTRANGEs over `A2:AE` `AF2:BE` `BF2:CE` `CF2:DE` `DF2:EA` | 3238 x 122 |
| `Raw_SMV!A1` | 1 IMPORTRANGE over `A2:DQ` | 561 x 122 |
| `SOURCE OF TRUTH!A1` | VSTACK of both raw tabs, **filtered by AREA**, header re-attached | 739 rows (738 data) x 122 |
| `CAL_FEED!A3` | feed, **month 9** | 166 x 6 |
| `CAL_FEED!H3` | feed, **month 10** (self-removing dummy row until real data arrives) | 1 row |
| `CAL_FEED!A1` | parked grid formula for Sept — intentionally `#REF!` | — |
| `CAL_FEED!H1` | parked grid formula for Oct — intentionally `#REF!` | — |
| `MISMATCH!A2` | diagnostic (§6) | 0–N rows |

Backups of every live formula are in `C:\RARA\SPREADSHEET\*.txt`, named
`<TAB>-<CELL>-v<N>.txt`. Each was verified **character-for-character against its cell**.
Run `python tools/pw_audit.py` to re-check them all at once.

Generated sheets (`Raw_BELL`, `Raw_SMV`, `SOURCE OF TRUTH`, `CAL_FEED`, `MISMATCH`) carry
**a header in row 1** and data below.

---

## 4. Browser control

**Use the ICE-CUBE browser. Attach to it. Never create a profile.**

```
chrome.exe --user-data-dir="C:\RARA\BROWSER-AUTOMATION"
           --profile-directory=Default
           --remote-debugging-port=9333
```

It is normally already running — **connect to port 9333, launch nothing.** If it is down,
say so and let the operator start it. Creating a fresh user-data-dir produces an empty,
logged-out profile that *looks* like it works — the scripts here refuse to do that on
purpose.

Why a dedicated profile is required: since Chrome 136, `--remote-debugging-port` is
**ignored when the user-data-dir is the default Chrome path**, even when passed
explicitly. A dedicated directory sidesteps it.

Scripts in `C:\RARA\SPREADSHEET\tools\` — all on port 9333. Seven are pre-pointed at
the JATIM RARA id; `pw_src.py` / `pw_row.py` take the doc id as an argument, and
`pw_icecube.py` probes the Tracking Ice Cube id instead:

| Script | Purpose |
|---|---|
| `pw_open.py` | checks/attaches to 9333; **refuses to create a profile** |
| `pw_put.py` | pastes a formula into a cell, **verifying navigation landed first** |
| `pw_audit.py` | checks every `*.txt` backup against its live cell |
| `pw_read.py` · `pw_src.py` | reads a tab as CSV |
| `pw_row.py` · `pw_check.py` | reads a row / validates |
| `pw_inspect.py` | reads one cell's live formula |
| `pw_fill.py` | fills rows with a colour |
| `pw_icecube.py` | lists which spreadsheets/tabs the browser has open |

**Pin the page by ID before acting:**

```
PAGES = [x for x in b.contexts[0].pages if "spreadsheets/d/" in x.url]
page = next((x for x in PAGES if "1mzT93dHVo1zYGljO42p9vg7kWf6pxqOHi1bR9uA8eRM" in x.url), None)
```

### Reading techniques

- **Any tab as CSV:** `/gviz/tq?tqx=out:csv&sheet=NAME` via an in-page
  `fetch(..., {credentials:'include'})`. Content is trustworthy; **row indices are NOT
  sheet row numbers** — never use them to place formulas.
- **A cell's live formula:** DOM element `#t-formula-bar-input`.
- **Exact range values:** select via the Name Box → `Ctrl+C` → read the Windows clipboard
  (`Get-Clipboard -Raw`) and parse as TSV. **The only trustworthy source of absolute
  positions and values.**
- **A single-cell copy returns the FORMULA, not the value.** Copy a range instead.
- **Navigate** with the Name Box — it accepts cross-sheet refs (`Raw_BELL!A1`).
  Playwright tab *clicking* does not work in Sheets.

**Always verify navigation landed** (read the Name Box back), and **verify a paste by
reading the formula back** — not by checking its length.

### Do not attempt

- Driving the conditional-formatting sidebar — it is a material-design panel and selectors
  land on the comment panel instead.
- Creating or configuring native pivots — drag-and-drop, and Sheets blocks writing over
  pivot output.
- `--remote-debugging-port` on the **default** Chrome user-data-dir — silently ignored.

---

## 5. The data model

### Canonical layout — 122 columns, identical in both raw tabs

```
1-22    Timestamp · Email Address · Tanggal Bekerja · Nama BA · Nama Outlet · Area ·
        TL · Category · Seragam · Brand Focus · Nama PIC Outlet · Jumlah Visitor ·
        Jumlah customer approach · Jumlah Pembeli · SKU Sampling ·
        Jumlah Botol Sampling yang di bawa · Serving Sampling · Mixer Sampling ·
        Jumlah Peminum Sampling · Absen Foto · Foto Activity Sampling · Foto Sales
23-120  the 98 SKU columns — same names, same order in both sources
121-122 Issue/Kendala di lapangan · Insight
```

### Source asymmetries

| | |
|---|---|
| `TL` (canonical 7) | BELLS only — blank for SMV rows |
| `Jumlah Botol Sampling yang di bawa` (canonical 16) | SMV only — blank for BELLS rows |
| `Nama BA` / `Nama Outlet` | BELLS repeats them **six times** (source cols 20–31) because that form branches on TL. Every row fills **exactly one pair** (verified 782/782). They collapse into two canonical columns by concatenation. |
| `Serving` / `Mixer Sampling` | near the FRONT in BELLS (Q, R), at the very END in SMV (DP, DQ) |
| SKU block | BELLS `AF:DY` · SMV `T:DM` |

### SOURCE OF TRUTH — the area scope

```
=LET(stacked;VSTACK(Raw_BELL!A1:DR;Raw_SMV!A2:DR);
 a;CHOOSECOLS(stacked;6);
 keep;ARRAYFORMULA((LEN(CHOOSECOLS(stacked;4))>0)*
      ((a="Surabaya")+(a="Sidoarjo")+(a="Malang")+(a="Mojokerto")+(a="Kediri"))>0);
 VSTACK(ARRAY_CONSTRAIN(stacked;1;122);FILTER(stacked;keep)))
```

Areas: **Surabaya · Sidoarjo · Malang · Mojokerto · Kediri**.

`ARRAY_CONSTRAIN(stacked;1;122)` re-attaches the header row — `FILTER` would otherwise
drop it, because the header matches neither a name nor an area.

### The target block

Row 2 is the header:

```
A=Nama TL · B=NAMA BA · C=CHANNEL · D=AREA · E=STATUS BA · F=OUTLET · G=BRAND FOCUS
```

Row 1 holds day numbers from column J. In the current importrange tab, Rara's block sits
at rows **296–379** plus **452–458** — split, with other teams in between.

> **Never hardcode a row range against it.** Reference `$B:$B` / `$F:$F` and let the
> lookup find the BA wherever it lands.

---

## 6. The MISMATCH tab

Lists feed rows whose `(Nama BA, Outlet)` pair exists nowhere in the target block — i.e.
submissions that have no place to land on the grid.

```
TANGGAL | NAMA BA | AREA | OUTLET FORM SUBMIT | 2026.09 (SEPT)
                                                   ↑ closest block outlet, or "-- none --"
```

Column E matches on **containment** — one name contains the other, case-insensitive.
Deliberately strict: a loose fuzzy match would pair genuinely different shops that share
a district name.

**Reading it:**

| You see | Meaning |
|---|---|
| `-- none --` | the outlet is genuinely absent from the block. A roster question, not a naming one — no formula fixes it |
| a name in column E | probably the same outlet spelled differently — fixable by normalising |
| the same `(BA, outlet)` twice on one date | duplicate form submission; `MATCH` takes the first, so the second is dropped even once the block covers it |

Rows appear and disappear on their own as the block is corrected. Nothing to maintain.

It is **informational**. Do not act on it unless the operator asks.

---

## 7. Rules that will bite you

These are the failure modes this pipeline has actually hit. Each is a rule, not a
suggestion.

**1. A `LET` name must not look like a cell reference.**
Sheets reads `1–3 letters + digits` as an A1 address — `c1` → `C1`, `ch1` → `CH1`
(`CH` is a real column; Sheets goes to `ZZZ`). The resulting `#NAME?` claims *"a LET name
is duplicated"*, which is misleading — nothing is duplicated, the name collided with an
address. **Use 4+ letter names** (`chunk1` is safe). Detect it by reading the formula
back: an invalid name renders UPPERCASE, a valid one keeps your casing.

**2. `&`, `REPT`, `LEFT`, `IF(SEQUENCE(...))` are not array-native.**
`CHOOSECOLS`, `HSTACK`, `VSTACK`, `FILTER` expand across rows by themselves; those four
do not. Without `ARRAYFORMULA` they compute a single scalar and the downstream `HSTACK`
pads every remaining row with `#N/A`. Symptom: row 1 correct, everything below `#N/A`,
only in the columns built from those constructs.

**3. `MONTH(empty)` returns 12.**
A blank cell is date serial `0` = 30 Dec 1899. An open-ended range drags in hundreds of
blank rows, all registering as **December**. Harmless for Sep/Oct, fatal if you ever
filter month 12. Guard with `ARRAYFORMULA(LEN(CHOOSECOLS(src;4))>0)`.

**4. `FILTER` with no matches returns an ERROR, not an empty array.**
A diagnostic that finds nothing shows `#VALUE!` instead of a clean empty list.
`IFERROR` alone is not enough — it leaves a stray blank row. **Count before filtering:**
`cnt; SUM(ok*1)` then `IF(cnt=0; blank; …)`.

**5. `IMPORTRANGE` is size-limited per call.**
~103k cells works; ~334k and ~437k fail. `Raw_BELL` is 131 columns x 3,237 rows and needs
**5 chunked calls** — one wide call fails.

**6. An open range is a promise to do maximum work forever.**
It returns the sheet's grid height (often 1,000 rows) when only part holds data, and that
oversized array feeds every `MATCH`. **Filter to non-blank rows before any per-row work.**
Capping rows instead buys speed with silent data loss — filter, don't cap.

**7. Renaming a tab rewrites the sheet NAME in formulas — never the RANGE.**
`'X'!$B$321:$B$396` becomes `'X-renamed'!$B$321:$B$396`: same rows, which may now hold
completely different data. The formula looks healthy and matches the wrong people. This
is why §5 forbids hardcoded row ranges.

**8. Verify a paste by reading it back, not by length.**
A length check passes on a formula that never landed. Read the formula bar and confirm
the actual content.

**9. gviz CSV row indices are not sheet row numbers.**
Fine for content, useless for position. Placing a formula from a CSV index puts it on the
wrong row — and a later tab-vs-tab comparison will still "pass", because both sides carry
the same offset. **A verification that cannot fail is not a verification.**

---

## 8. Validating

**Compare against the ORIGINAL FORMS.** Tab-vs-tab comparisons cannot catch a systematic
error — both sides can carry the same offset.

1. Pull both forms' `Form Responses 1` via gviz.
2. Build `(Nama BA, Nama Outlet, day)` → Brand Focus for the month.
3. Read the target block by **clipboard**, not gviz.
4. Compare cell by cell.

**Both forms use M/D/YYYY.** Proven: 1,813 values have the second field > 12
(`7/13/2026`), zero have the first > 12. Read the **second** field as the day — reading
the first silently halves the lookup.

`OFF` cells are hand-typed markers, not sourced from the forms. Exclude them.

---

## 9. Open items

- **`CAL_FEED!H1`** (parked October grid formula) still references the September row
  range — repoint it when the October grid block exists.
- **Month rollover is manual.** Adding a month means a new block plus a formula whose
  month number is edited by hand. A month-selector cell would reduce it to one digit, but
  locked months were the operator's preference.
- **The area key is one row imprecise.** `Sudarsih` (another TL's BA) sits inside the five
  areas and therefore inside the 738. She cannot produce a wrong grid cell — her name
  never matches a block row — but she is there. A TL key would be exact for the BELLS
  side; the SMV form has no TL column, so it would need a name roster.
- **Floating vs in-cell images.** In the ICE-CUBE tracking grid, a photo inserted as
  *over cells* leaves the cell empty, so a `<>""` test on it reads FALSE even though the
  photo is visible. Check the Formula Bar of the cell to tell which mode was used.

---

## 10. Do not touch

| | Why |
|---|---|
| **DAILY SCHEDULE F27** | Production. Read-only, always. |
| `STAGING` tab | Deliberate fallback — it pulls from the forms by its own independent path. If `SOURCE OF TRUTH` ever breaks, the calendar still runs off this. Two independent paths is the point. |
| Other TL blocks | Out of scope; hand-entered by others. |
| The two source Forms | Live production data. |
| `ICE-CUBE\` | The photo half of the same job — covered by `ICE-CUBE-DOCS\README.md`, not here. Coordinate via the shared browser, don't edit its code from calendar work. |

**Do not make changes that were not asked for.** Several rounds have been wasted offering
fixes nobody requested. When the operator asks a question, answer it — a diagnosis is
often the whole deliverable.
