---
name: core-flows
description: "Named efficient flows: audit, write, read, validate, diagnose, rollover, photo batch"
updated: 2026-09-29
---

# Flows (named, in order, with done-criteria)

## F1 — Audit-first (before ANY formula write)
1. `pw_open.py` → browser up, JATIM open. 2. `pw_audit.py` → all 8 pairs MATCH.
**Done:** MATCH across the board. If DIFFERS: read live vs backup, decide which
is truth (usually live wins + backup updated, version bumped), never overwrite
blind.

## F2 — Backup-before-write
1. Read live formula (`pw_inspect.py`). 2. Save to
  `<TAB>-<CELL>-v<N+1>.txt` (next version, don't overwrite history).
3. Point the change at the new file. **Done:** disk holds both old and new.

## F3 — Write
1. `pw_put.py "<Tab>!<Cell>" <file>`. 2. Read formula bar back, compare to file
   content (not length). 3. Re-run `pw_audit.py` for that pair.
**Done:** audit MATCH on the new version. Never: paste without read-back, write
to F27, write to STAGING, write to another TL's block.

## F4 — Read (pick by question type)
- Content of a tab → `pw_read.py` / `pw_src.py` (cheap, no state change).
- One live formula → `pw_inspect.py`. - Absolute positions/values →
  Name Box → Ctrl+C → clipboard TSV (only truth).
- What's open right now → `pw_icecube.py`.

## F5 — Validate (calendar output vs ORIGINAL FORMS)
1. Both forms' `Form Responses 1` via gviz. 2. Build `(BA, Outlet, day)` →
   Brand Focus. 3. Target block via clipboard. 4. Cell-by-cell compare.
Exclude `OFF` hand-markers. Second date field = day. Tab-vs-tab is not
validation (shared offsets pass silently).

## F6 — Diagnose (symptom → probe → pattern)
| Symptom | Probe | Pattern |
|---|---|---|
| Row 1 right, below `#N/A` | which cols? built from `&`/REPT? | array-native (traps §2) |
| `#NAME?` "LET duplicated" | read back: name UPPERCASE? | LET-name collision (traps §1) |
| `#REF!` in feed | parked A1/H1 (intentional) or broken ref? | check backups |
| Right shape, wrong people | hardcoded `$B$321`-style range? recent rename? | ranges don't follow renames (traps §7) |
| December rows from nowhere | open range over blanks? | MONTH(0)=12 (traps §3) |
| Diagnostic `#VALUE!` | zero-match case? | count-before-filter (traps §4) |
| MISMATCH rows appear | `-- none --` (roster) vs name (spelling) vs dup (double submit)? | pipeline §MISMATCH |

## F7 — Calendar month rollover (manual BY DESIGN)
Reconstructed from HANDOFF §9 + grid backups — operator confirms before use:
1. New importrange tab for the month (live F27 data). 2. New feed block =
   copy of H3-formula with month digit edited (`bln=10` → 11). 3. Repoint parked
   grid formula at the new feed range + new block rows (bounded to the verified
   live extent — whole-column grids spill 1000×30 and fit nowhere). 4. `pw_audit.py` + F5
   validation before calling it done.

## F8 — Photo batch (pointer)
`ICE-CUBE-DOCS/README.md`: start bat → `--dry-run` → read plan → live run →
read log. Always dry-run first; `--since` always. Full phase table:
`OUT-PHOTO/out-photo-pipeline.md`.
