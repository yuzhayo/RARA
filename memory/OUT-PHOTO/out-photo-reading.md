---
name: out-photo-reading
description: "OUT-PHOTOS: date reading, verify-back, identity, filter, hash, scan mechanics, captions"
updated: 2026-09-29
---

# OUT-PHOTOS reading rules

## Phase 4 — date reading (why the pipeline is worth having)

OCR first (`ocr_photo.py` + ps1 helpers); on failure the agent looks:
`claude -p --model <agentModel>`. THREE answers: a date (legible → recorded,
re-plan, carry on) / `UNREADABLE` (overlay there but won't come out → run STOPS,
nothing guessed) / `NO-OVERLAY` (no timestamp at all → NOT a report, REJECT,
carry on). Third answer matters: far-back scans meet chat photos the visual
filter can't exclude; without it they'd pile up as fake blockers.

- **Model pin:** `agentModel = deepseek-v4-flash`, the ONLY model here that reads
  images (gateway remaps haiku/sonnet/opus aliases; a blind model doesn't error,
  it guesses plausibly). Never ambient default (`~/.claude/settings.json`
  changes). Change via `config.json` only — both call sites read it.
- **Outage ≠ unreadable:** `claude -p` exits 0 even when the API call fails;
  detected by error text, reported as outage, run stops, human reads.
- Unusable answers reported verbatim with what was actually said.

## Phase 7 — verify-back (the ONLY stage that reads the sheet)

The ledger's `verified` is about the picker DIALOG, not the cell. In-cell images
are unreadable normally (Sheets renders canvas — no cell DOM; gviz CSV omits
images; formula bar empty on selection). So: copy cell → paste into merged
preview **`AM3:AM30`** → screenshot → agent compares vs photo on disk
(`_verified.json`, `verify-shots\`). Visual comparison — no hash spans
photo-vs-canvas.

> **Preview MUST be SELECTED before pasting.** Unselected paste goes nowhere;
> block keeps the PREVIOUS image; check passes on the wrong photo (taught twice).
> If `could not select AM3`: preview moved/unmerged → update `PREVIEW` in
> `verify_cells.js`. Phase 7 deliberately NOT fatal (insert already happened).

`verify_cells.js` flags: `--cells C27,B28` · `--limit N` · `--all`.

## Identity (DM folder vs sender number — never caption)

- DM: the DM folder IS the answer. Group (`Jatim tok` = one unstructured pile):
  sender NUMBER from WhatsApp's `data-pre-plain-text` (~19 DOM levels above a
  group image, shallower in DM — a fixed 8-climb missed every group message),
  matched vs roster folders. Caption/burned-in name/nickname NEVER.
- Group image outcomes: roster BA → planned like DM · nobody + hash filed →
  `SKIP` (stale leftover) · nobody + not report → `REJECT` · nobody + unmatched
  → `UNATTRIBUTED` (listed with recorded sender, NOT filed, does NOT gate —
  stopping would block everything behind an unresolvable leftover). DM+group
  double-post hashes equal → second copy `SKIP`.

## Filter (visual) + hash (DCT) — and their limits

- Report filter = whiteness of lower-left corner (Timestamp template block),
  NOT OCR (OCR caught 24/36 known-real). Scores: sheet screenshot 0.98, real
  photos 0.003–0.19. Rules out screenshots ONLY — holiday snaps pass it too.
- Comparison = DCT perceptual hash (WA re-compresses; plain hash won't match).
  Measured: matches 0, different 24–30. `HASH_MATCH_MAX = 12` = midpoint…
  **but inherited, not calibrated**: same photo via group-vs-DM measured 8 bits
  apart — 12 clears it with 4 bits spare vs floor 22. Works so far; never
  re-derived. Calibration debt, recorded.
- One connection per batch (picker iframe dismisses on CDP drop; picker needs
  frame-context eval; Upload needs REAL `Input.dispatchMouseEvent`; menu matched
  ID+EN: `Gambar/Sisipkan gambar dalam sel`).

## Scan mechanics (a scan must SCROLL)

- Window overlap: next scan starts AT the last covered day, not after (late
  reports for the 25th arrive after the 25th's check). Repeats cost nothing
  (filed → `SKIP`). **The date compared is SEND date** (what's unlooked-at);
  overlay date only names the file.
- Walk backwards to a message older than window start = proof of full coverage
  (group view measured: 13 bubbles / 3999px / five minutes — a day's photos not
  in DOM). Download on sight (virtualised list: found-now-fetched-later may be
  gone). Container = `[data-testid="conversation-panel-messages"]` — **`#main`
  never scrolls** (`scrollTop` stuck at 0).
- Round cap hit → marker NOT advanced (partial scan ≠ scan; next run re-covers).
  Markers per-chat (`_scan-state.json`: `checkedThrough/previous/lastRunAt`;
  global marker would drag all chats on one failure), written only on success.
  Readable mirror: `logs\scan-history.log`.
- WA window must be OPEN, not minimised: minimised WebView2 stops rendering
  while debug port answers (`header=""`, frozen DOM). `MainWindowHandle ≠ 0` is
  TRUE when minimised — check `IsIconic`, cure `ShowWindow(SW_RESTORE)`
  (`AppActivate` insufficient); restore before EVERY chat (2026-09-28: group
  opened, all 11 DMs failed). `wa_fetch.js` refuses scan if <5 named rows.
- Every derived list rebuilt after each re-plan (stale `todo` once reported
  `add: 3`, filed none, finished DONE). Child-process failure → print EVERYTHING
  the child said (a tidy regex once ate the WHICH-row diagnostic). Python forces
  UTF-8 itself (Windows stdout cp1252 dies on emoji filenames; never rely on
  `PYTHONIOENCODING`). Scan+download are ONE process with a header guard (split
  processes once crossed two BAs' photos).

## Captions sub-pipeline (triggered, NOT in chain)

Nominal (handwritten on receipt) + outlet (not on photo at all) exist ONLY in
captions → `captions.js` reads them → `apply_captions.js` writes matrices
`N3:X32` / `Z3:AJ32` (reads each cell before+after: re-runnable, no ledger).
Never waits for / blocks the main run; never touches photo matrix (B–L).
