---
name: index
description: "RARA is ONE project (Jatim field-ops reporting) with TWO outputs. Map of all canon files."
updated: 2026-09-29
---

# Memory — C:\RARA

**One project, two outputs.** Both halves report the same field operation — BAs
sampling and selling in Jatim — from two independent sources:

```
RARA — Jatim BA field-ops reporting automation
  ├─ OUT-CALENDAR : WHAT happened — brand focus per (BA, outlet, day) from forms
  │                 BELLS + SMV forms → JATIM RARA staging → calendar grid (ref: F27)
  │                 canon: SPREADSHEET/HANDOFF.md + memory/OUT-CALENDAR/
  └─ OUT-PHOTOS   : PROOF it happened — delivery photos per (BA, day) from WhatsApp
                    WA chats → month folder → Tracking Ice Cube tab RARA
                    canon: ICE-CUBE-DOCS/ (README, REFERENCE, NEW-MONTH) + memory/OUT-PHOTO/
  Shared domain   : roster, 5 areas, date authorities, 1 browser, 1 evidence standard
                    canon: memory/DOMAIN/
  Portable method : browser control, formula traps, evidence, communication, analysis flow
                    canon: memory/CORE/
```

## File map

| File | Holds |
|---|---|
| `CORE/core-chrome-auth.md` | HARD RULE: never relocate a live profile, never force-kill Chrome |
| `CORE/core-browser.md` | Automation-browser pattern: attach, pin-by-ID, verify, reading techniques |
| `CORE/core-formula-traps.md` | Sheets semantics that break big formulas (LET names, array-native, …) |
| `CORE/core-evidence.md` | Verdict hierarchy + independent-source validation |
| `CORE/core-communication.md` | Operator conventions: folder-first, teaching, no drive-by fixes |
| `CORE/core-methodology.md` | Analyst flow + formula library (seed) + when to leave Sheets |
| `CORE/core-formula-library.md` | 12 proven patterns from the 8 live backups (P1–P12) |
| `CORE/core-toolbox.md` | The 10 pw_* scripts: syntax, IDs, gotchas |
| `CORE/core-flows.md` | Named flows: audit, write, read, validate, diagnose, rollover |
| `DOMAIN/domain-scope.md` | Areas, roster pointer, date authorities, naming |
| `DOMAIN/domain-boundaries.md` | Write scope (3 IDs), profile, ports, pin-by-ID snippet |
| `OUT-CALENDAR/out-calendar-pipeline.md` | Forms → feed → grid, live cells, MISMATCH, validation, open items |
| `OUT-CALENDAR/out-calendar-schema.md` | 122-col schema, asymmetries, SoT formula, target block |
| `OUT-PHOTO/out-photo-pipeline.md` | 7 phases, commands, state files, month rollover |
| `OUT-PHOTO/out-photo-reading.md` | Date reading, verify-back, identity, filter, hash, scan mechanics |
| `OUT-PHOTO/out-photo-banned.md` | 12 replaced approaches — do not re-propose |

## Source-wins rule (anti-stale)

Canon lives in the files above plus `SPREADSHEET/HANDOFF.md` and `ICE-CUBE-DOCS/`.
The agent persona (`.opencode/agent/RARA.md`) carries **copies** of critical values
so it survives compaction. **If a copy and a canon file disagree, the file wins.**
A summary is lossy; the files are not.

## Maintenance protocol (canon self-healing)

1. Any session that learns a new trap, pays for a new reading, or finds a stale
   line **proposes the memory update in its report** (file + exact lines).
2. Operator approves → file updated with new `updated:` date. No silent edits.
3. A new output (OUT-*) = new folder + one SECTION block in the persona.
   CORE is never opened for content updates.
4. Verified live 2026-09-29: browser up on 9333 + 9223; all 8 JATIM tabs serve
   CSV with live data; MISMATCH empty (0 rows); pw_audit TEST pair removed
   (backup file never existed on disk).
