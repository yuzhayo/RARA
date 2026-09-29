---
name: google-sheets-formula-traps
description: "Two Google Sheets gotchas that silently break big LET/array formulas — LET names that look like cell refs, and non-array-native operators"
metadata: 
  node_type: memory
  type: reference
  originSessionId: b6d5264f-8b35-4fb3-a989-ef16bc66fe45
---

Two failures that produce misleading errors and cost days on the [[spreadsheet-canonical-schema]] work:

**1. `LET` names must not look like cell references.**
Sheets treats any name of **1–3 letters followed by digits** as an A1 address. `c1` → `C1`. `ch1` → `CH1` (`CH` is a real column label — Sheets has columns up to `ZZZ`). The formula then throws **`#NAME?`** with the message *"one or more names specified in the LET function are duplicated"* — even though nothing is duplicated and the real cause is the address collision.

**Fix:** use names of **4+ letters**. `chunk1` is safe because no column label is longer than three letters. Visually confirmed: when the name is invalid, Sheets renders it uppercase (`C1`); when valid, it keeps your casing (`chunk1`).

**2. `&` and `REPT` are not array-native.**
`CHOOSECOLS`, `HSTACK`, `VSTACK`, `FILTER` expand across rows on their own. The `&` operator and text functions like `REPT`/`LEFT` do **not** — without `ARRAYFORMULA` they compute a single scalar, and a downstream `HSTACK`/`VSTACK` pads every remaining row with **`#N/A`**.

**Tell-tale symptom:** row 1 correct, every row below `#N/A`, in exactly the columns built from those constructs.

**Fix:** wrap them — `ARRAYFORMULA(colA & colB)` , `ARRAYFORMULA(REPT(col;0))`.

Related: `IMPORTRANGE` is size-limited per call — the same columns split across several calls import fine where one wide call fails. Splitting into ≤~100k cells per call worked for a 131-column × 3,237-row source.
