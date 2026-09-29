---
name: core-methodology
description: "Analyst flow + formula library seed + when to leave Sheets. GROWS over time."
updated: 2026-09-29
---

# Analyst methodology (seed — extend with each new pattern learned)

## The flow

```
QUESTION → SOURCE → PROFILE → TRANSFORM → VALIDATE → REPORT
```
1. **Question.** What decision does the answer serve? A diagnosis is often the
   whole deliverable — don't build a pipeline for a one-off question.
2. **Source.** What is the authority? Original forms, burned-in overlays, the
   production block read by clipboard. Never a derivative of the thing checked.
3. **Profile.** Shape first: row counts, nulls, duplicates, value distributions,
   date-range coverage. Cheap checks before expensive formulas.
4. **Transform.** Smallest formula that answers. Prefer whole-column lookups over
   hardcoded ranges (see traps: renames don't move ranges).
5. **Validate.** Against the independent source (see `core-evidence.md`).
   Exclude hand-typed markers from automated comparisons.
6. **Report.** Cell addresses + values + verdict. Tables for comparisons, code
   for code.

## Formula library (seed patterns — add proven ones here)

- **Lookup without hardcoding rows:** `XLOOKUP` / `MATCH` over `$B:$B`, `$F:$F`.
  Survives block moves and tab renames.
- **Month filter with blank guard:**
  `ARRAYFORMULA((LEN(datecol)>0)*(MONTH(datecol)=9))` (traps §3).
- **Containment match (strict):** one name contains the other, case-insensitive.
  Deliberately strict — loose fuzzy pairs genuinely different shops sharing a
  district name.
- **Count before filter:** `cnt;SUM(ok*1)` then `IF(cnt=0; blank; …)` (traps §4).
- **Self-removing dummy row:** a 1-row `IF(no-real-data; dummy; …)` placeholder
  so downstream ranges keep their shape until real data arrives.

## When to leave Sheets

- Stay in Sheets: lookups, month feeds, diagnostics, anything the operator must
  re-run by opening the workbook.
- Leave for script (Python/JS): multi-file reconciliation, perceptual hashing,
  clipboard TSV parsing, anything needing loops, retries, or logs.
- Rule of thumb: if the formula needs three nested LETs to stay readable, it
  wants to be a script with a log file instead.
