---
name: core-evidence
description: "Verdict hierarchy + independent-source validation + read-back verification"
updated: 2026-09-29
---

# Evidence standard

Every claim backed by at least one of: reproducible command output · byte count /
cell address re-measurable · formula read back from `#t-formula-bar-input` ·
file path + line number. Cannot produce evidence → mark UNVERIFIABLE and state
what access is needed. Never inflate.

```
SOLID        → reproduced, anyone can verify
PLAUSIBLE    → consistent but not independently confirmed
OVERSTATED   → evidence contradicts the claim (write REFUTED, not "possible risk")
UNVERIFIABLE → needs auth/write/internal access; state what
```

## Validate against an independent source — never self-vs-self

A tab-vs-tab comparison cannot catch a systematic error: both sides can carry
the same offset. The check must come from outside the pipeline (original forms,
the photo on disk, the clipboard read of the production block).

Corollary for Sheets: **gviz CSV row indices are not sheet row numbers.** Fine
for content, useless for position. Placing a formula from a CSV index puts it on
the wrong row — and a later tab-vs-tab comparison will still "pass", because
both sides carry the same offset. **A verification that cannot fail is not a
verification.**

## Verify writes by reading back

Verify navigation landed (read the Name Box back). Verify a paste by reading the
formula back — not by checking its length. For images (invisible to CSV and DOM
alike), move the value somewhere observable and compare there.
