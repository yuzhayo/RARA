---
name: out-photo-pipeline
description: "OUT-PHOTOS: 7-phase pipeline, commands, state files, month rollover"
updated: 2026-09-29
---

# OUT-PHOTOS pipeline

WhatsApp delivery photos → month folder → Tracking Ice Cube tab RARA, folder
tree and sheet in sync. Operator runs it every 1–2 days. Full docs:
`ICE-CUBE-DOCS/README.md` (run), `REFERENCE.md` (roster, files, agent,
troubleshooting), `NEW-MONTH.md` (rollover). Verified against code 2026-09-29
(tree, config, invocations, exit codes all match docs).

```
C:\RARA\ICE-CUBE\
  ICE-CUBE-SEPT\       month WORK (git-ignored): photos + NOTA + state
  ICE-CUBE-DOCS\       README.md · REFERENCE.md · NEW-MONTH.md
  WA-DOWNLOAD\         temp staging (git-ignored, safe to delete)
  ICE-CUBE-TOOLS\
    SHARED\              config.json, paths.js, cdp_browser.js, wa_common.py, wa_apply.py
    SCANNER-DOWNLOADER\  wa_fetch_all.js, wa_fetch.js, scan-state.js
    VERIFIER\            wa_plan.py, detect_report.py, ocr_*, captions.js
    INPUTTER\            run-all.js, insert.js, verify_cells.js, apply_captions.js
    run-pipeline.js, start/stop-automation-chrome.bat(.ps1)
```
Live 2026-09-29: 11 BA folders + NOTA + logs + verify-shots + 6 state JSONs all
present; WA staging has 11 short-label dirs + `GROUP Jatim tok` + `_plan.json` +
`_applied.json`.

## Run — one command (`ICE-CUBE-TOOLS/`)

```
node run-pipeline.js --dry-run      # plan only, touches nothing
node run-pipeline.js                # full run (logs: ICE-CUBE-SEPT\logs\pipeline-<ts>.log)
```
Flags: `--dry-run` · `--skip-fetch` (reuse WA-DOWNLOAD) · `--since YYYY-MM-DD`
(without it `run-all.js` scans EVERY photo incl. hand-entered ones — always pass
it; `--dry-run` output first). Exit codes: `0` done · `1` aborted OR verify
mismatch · `2` a date needs a human · `130` Ctrl+C.

| # | Phase | Invocation (run-pipeline.js) | Note |
|---|---|---|---|
| 1 | PREFLIGHT | poll 9333 + `Get-Process *WhatsApp*` | DRY skips launch |
| 2 | FETCH | `node SCANNER-DOWNLOADER/wa_fetch_all.js` (90 min, retries 1) | `--skip-fetch` skips |
| 3 | PLAN | `python VERIFIER/wa_plan.py --out WA-DOWNLOAD/_plan.json` (15 min) | actions below |
| 4 | REVIEW | `claude -p --model <agentModel>`, 4 min/image, then re-plan | GATE: unreadable → exit 2, never guess |
| 5 | APPLY | `python SHARED/wa_apply.py --plan` (5 min) | fatal — aborts before sheet writes |
| 6 | INSERT | `run-all.js --since <date> --dry-run` then live (5 + 45 min) | sheet last: folders right first |
| 7 | VERIFY | `node INPUTTER/verify_cells.js` (60 min) | NOT fatal — sets flag → exit 1 |
| — | captions | `VERIFIER/captions.js` + `INPUTTER/apply_captions.js` (30+20 min) | triggered, never fails run |

Plan actions: `ADD` → `DD-MM.jpeg` · `SKIP` hash-duplicate · `SUFFIX` same date
different image → `DD-MM-(1).jpeg` · `REJECT` not-a-report · `UNCLEAR` look
yourself · `NEEDS-READ` report, date unreadable · `UNATTRIBUTED` no sender —
listed, NOT filed, does NOT gate · `OUT-OF-MONTH` wrong month — reported, NOT
filed, does NOT gate (cell comes from DAY alone).

## State files (per-month, in month folder unless noted)

| File | Meaning | Delete for new month? |
|---|---|---|
| `.ledger.json` | which cells inserted (delete a row to redo one) | YES |
| `_manual-dates.json` | eye/agent readings (records WHAT WAS SEEN) | YES — but never mid-month: paid readings, re-buys agent calls |
| `_not-reports.json` | settled not-a-report (stops re-examination) | YES (same warning) |
| `_verified.json` | what each cell was SEEN to contain (delete → re-verify all) | YES |
| `captions.json` | nominal/outlet per BA+date (delete → rebuild) | YES |
| `_scan-state.json` | per-chat check markers (delete → full first check) | YES |
| `verify-shots\` | screenshots behind verdicts | YES (or keep) |
| `logs\` | pipeline + scan-history logs | keep as history |
| WA-DOWNLOAD `_plan.json` / `_applied.json` | staging plan + applied record | rebuilt every fetch |

Keyed-by table (why fresh copies collide month-to-month): see NEW-MONTH.md §1.

## Month rollover (NEW-MONTH.md — 4 steps)

1. Copy month folder → empty photos/NOTA, delete state per table above. Keep BA
   subfolder names (carry the WA number `config.json` matches on).
2. One-line edit: `"monthFolder": "ICE-CUBE-OCT"` in `SHARED/config.json`.
   **Leave `agentModel` (`deepseek-v4-flash`) alone.**
3. New tab: read day-1 cell's Name Box → `firstRow`; header → `columns`
   (`SBY LAVITA 852-3619-2050` matches key `SBY LAVITA`: uppercase, number
   stripped). `row = day - firstDay + firstRow`.
4. `--dry-run`, read the plan, fix config, repeat before going live.

`config.json` live 2026-09-29: `monthFolder ICE-CUBE-SEPT`, sheet `1mrju…`, tab
`RARA`, `chromePort 9333`, `agentModel deepseek-v4-flash`, `dateRow {3,1}`,
11 `columns` B–L, `ignoreFolders [ICE-CUBE-NOTA, __pycache__]`.

Every path derives from code location + `monthFolder` (`paths.js`,
`wa_common.py` climb one level to `ICE-CUBE-TOOLS`). Whole `C:\RARA\` movable,
no editing. `WA-DOWNLOAD\` safe to delete between runs.
