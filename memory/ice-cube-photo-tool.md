---
name: ice-cube-photo-tool
description: "ICE CUBE WhatsApp-to-Google-Sheets pipeline at C:\\RARA\\ICE-CUBE (moved from Downloads 2026-09-29); reused monthly, docs in ICE-CUBE-DOCS"
metadata:
  node_type: memory
  type: project
  originSessionId: 017b041c-78d9-4174-be4d-6e44f1db515e
---

End-to-end pipeline that takes delivery photos BAs send on WhatsApp into the
"Tracking Ice Cube" Google Sheet (`1mrju1CMNo_AM82PeBrk2myVWTNOrH_VWkDJHzFT4hR4`,
tab `RARA`), keeping the folder tree and the sheet in sync.

**Structure** (reorganised 2026-09-27 — code and docs are now separate folders):

```
C:\RARA\
  BROWSER-AUTOMATION\   automation Chrome profile - BESIDE the workspace, not inside
  ICE-CUBE\
    ICE-CUBE-SEPT\       the month: photos + NOTA + .ledger.json + state
    ICE-CUBE-DOCS\       README.md, REFERENCE.md, NEW-MONTH.md
    WA-DOWNLOAD\         temp staging
    ICE-CUBE-TOOLS\
      SHARED\              config.json, paths.js, cdp_browser.js, wa_common.py, wa_apply.py
      SCANNER-DOWNLOADER\  wa_fetch_all.js, wa_fetch.js, scan-state.js
      VERIFIER\            wa_plan.py, detect_report.py, ocr_*, captions.js
      INPUTTER\            run-all.js, insert.js, verify_cells.js, apply_captions.js
      run-pipeline.js, start-automation-chrome.bat, stop-automation-chrome.bat/.ps1
```

**Stopping the automation browser needs its own script.** Closing the window is
not enough — Chrome keeps the profile's processes alive (12 of them) and they
hold the debug port. `stop-automation-chrome.bat` closes them with
`CloseMainWindow()` and polls to zero; it never force-kills, and it says so and
stops if they will not close. It matches on the automation profile path only, so
the user's normal Chrome is untouched.

**Workspace moved 2026-09-29** from `Downloads\ICE-CUBE` to `C:\RARA\ICE-CUBE`,
and **restructured the same day into stage folders** — the operator navigates by
folder and filename, not by reading code, so the folder a file is in has to say
what it is for. `SHARED\` exists because paths/config/CDP/wa_common are used by
more than one stage.

Nothing needed editing for either change because every path is derived from the
code's own location — including the automation profile, which `cdp_browser.js`
used to HARDCODE until the move exposed it. Note `paths.js` and `wa_common.py`
now live one level down, so they climb **one extra level** to find
`ICE-CUBE-TOOLS`; that is the trap when moving these files again.

**The profile is a SIBLING of the workspace** (`C:\RARA\BROWSER-AUTOMATION`), so
a 600 MB Chrome profile never travels with the project. **Its sign-in is NOT
path-bound** - copied, moved and renamed, and the sheet kept opening with no
login prompt each time.

**Read `ICE-CUBE-DOCS\README.md` first** — it documents only what has been run
end to end. `REFERENCE.md` has the roster, naming rules and troubleshooting.
`NEW-MONTH.md` is the monthly checklist.

**Why:** operator runs this every 1–2 days through the month and does not want
to eyeball every DM and group for new images. Operator navigates by folder
structure, not code.

**How to apply — one command:**
```
cd ICE-CUBE-TOOLS
node run-pipeline.js --dry-run      # plan only
node run-pipeline.js                # full run
```
Seven phases: preflight → fetch → plan → review → apply → insert → verify. Logs
to `ICE-CUBE-SEPT\logs\pipeline-*.log`. Exit codes: 0 done, 1 aborted or a
verification mismatch, 2 needs a human, 130 Ctrl+C.

**Phase 7 reads the sheet back**, and it is the only stage that does. The
ledger's `verified` field is about the picker *dialog*, not the cell. An in-cell
image cannot be read by any normal route — Sheets renders to a canvas, and the
`gviz` CSV endpoint omits images — so `verify_cells.js` **copies the cell,
pastes it into the merged preview block `AM3:AM30`, screenshots that, and has
the agent compare it with the photo on disk.** Results in `_verified.json`,
screenshots in `verify-shots\`.

> **The merged cell must be SELECTED before pasting.** Pasting into an
> unselected cell does nothing and the block keeps showing the PREVIOUS image —
> so the check passes while verifying the wrong photo. The operator taught this
> twice; it is the whole reason the method works.

**Phase 4 is the important one:** when OCR cannot read a date, the pipeline
calls `claude -p` to look at the image, records the answer in
`_manual-dates.json`, re-plans, and continues — no human step. If the agent
cannot read it either, it stops rather than guessing. Each phase still runs
standalone if needed.

All paths derive from `monthFolder` in `ICE-CUBE-TOOLS\config.json` — that is
the only thing to change for a new month.

**Non-obvious rules that cost real time to establish:**

> **BANNED — ways that were replaced. Do not fall back to these after a
> compact, and do not re-propose them.** Each one was tried, was wrong, and is
> recorded here so it is not re-invented:
>
> 1. **Reading the visible chat and calling it a scan.** WhatsApp unmounts what
>    is scrolled away. The scan must WALK the history back to the window start.
> 2. **Using the caption for identity.** Captions are typed by hand. Identity
>    comes from the DM folder, or from the sender number WhatsApp records.
> 3. **Scrolling `#main`.** It does not scroll. Use
>    `[data-testid="conversation-panel-messages"]`.
> 4. **Advancing the scan marker after a partial walk.** A partial scan is not
>    a scan; the marker stays put.
> 5. **Treating "no timestamp overlay" as "unreadable date".** They are
>    opposite: the first is not a report, the second needs a human.
> 6. **Filing a photo whose date is outside the current month.** The cell comes
>    from the day alone, so it lands in the wrong row, silently.
> 7. **Relying on the caller to set `PYTHONIOENCODING`.** The scripts force
>    UTF-8 on their own streams.
> 8. **Deleting `_manual-dates.json` / `_not-reports.json` to "clean up".**
>    They are readings already paid for; deleting them re-buys the same agent
>    calls. `_not-reports.json` is what stops ordinary chat photos from being
>    re-examined every run.

> 9. **Trusting `MainWindowHandle -ne 0` as proof the window works.** It is true
>    for a MINIMISED window, and a minimised WebView2 stops rendering while its
>    debug port keeps answering — `header=""`, empty chat rows, every open
>    failing. `IsIconic` is the check; `ShowWindow(SW_RESTORE)` is the cure
>    (`AppActivate` is not enough). Restore before EVERY chat, not once at the
>    start: on 2026-09-28 the group opened and all eleven DMs then failed.
> 10. **Deriving a list from the plan only before the agent runs.** Phase 4
>    REPLACES the plan once dates are read. `todo` was built once, from the old
>    plan, so a run reported `add: 3` and then filed none of them and still
>    finished DONE. Every derived list is now rebuilt after each re-plan.
> 11. **Filtering a child process's output down to what looks tidy.** The
>    per-attempt diagnostic that names WHICH row was clicked was dropped by a
>    narrow regex, so every open-failure in the log arrived with no explanation
>    and had to be guessed at. On failure, print everything the child said.
> 12. **Calling the agent without pinning the model.** Phases 4 and 7 read
>    IMAGES. A model that cannot see one does NOT error — it answers anyway, so
>    every "reading" becomes a plausible guess that looks exactly like a real
>    one. The call is `claude -p --model <agentModel>`, and `agentModel` in
>    config.json is pinned to **`deepseek-v4-flash`** because it is the only
>    model that works here: this machine's CLI points at a gateway that remaps
>    the haiku/sonnet/opus aliases to other models, and image reading does not
>    work through them. Never leave it to the ambient default — that default
>    lives in `~/.claude/settings.json` and has been changed before.

- The report filter is **visual** (how white the lower-left corner is), NOT OCR.
  OCR read only 24 of 36 known-real photos.
- Comparison is by **DCT perceptual hash**, not date. Matches scored 0,
  different images scored 24–30.
- **Never trust captions.** One captioned "26 sept" carried a 25 September
  overlay.
- An unreadable date is **never guessed** — it is escalated and read by eye.
- The WhatsApp **window must be open**, not just the background task, or the
  DOM is stale and every chat open fails.
- **A scan must scroll; reading the screen is not a scan.** WhatsApp unmounts
  what is scrolled away — the group's loaded view was 13 bubbles covering five
  minutes, so a day's photos were not in the DOM at all. `wa_fetch.js` walks
  back to the window start. The message list is
  `[data-testid="conversation-panel-messages"]`; **`#main` does not scroll**
  (its `scrollTop` stays 0), so scrolling `#main` silently moves nothing.
- **Group identity comes from WhatsApp's sender number**, read from the
  `data-pre-plain-text` attribute (~19 DOM levels above a group image, shallower
  in a DM — a fixed 8-level climb missed every group message). Matched against
  the roster folders. Caption is never used for identity.
- A group image with no recorded sender is `UNATTRIBUTED`: listed, not filed,
  and deliberately **not** a gate — stopping would block every other photo
  behind one leftover nothing can resolve.
- If the walk hits its round cap the scan marker is **not** advanced, so the
  next run re-covers that chat. A partial scan is not a scan.
- **The visual filter cannot tell a report photo from an ordinary one.** A
  holiday snap has as little white in its lower-left as a report does, so the
  filter only rules out screenshots. A scan that reaches further back meets
  plenty of chat photos — on the 2026-09-27 re-scan, 8 of them came back as
  "unreadable dates" and stopped the run. The agent now answers **three ways**
  (a date / `UNREADABLE` / `NO-OVERLAY`); `NO-OVERLAY` reclassifies the image as
  not-a-report instead of gating. `UNREADABLE` still stops the run.
- **An image dated outside the current month is never filed.** The filename is
  only `DD-MM` and the cell comes from the DAY alone, so a photo dated 13 August
  would be filed as `13-08.jpeg` and land in the row for 13 **September** —
  silently wrong. Action `OUT-OF-MONTH`: reported, not filed, does not gate.
  Found on the re-scan: `LAVITA/11_image_11.jpg` really is 2026-08-13 (verified
  against the overlay itself, which reads `08/13/2026 Thurs`).
- `_manual-dates.json` must record **what was seen**, not a claim — the agent is
  asked to repeat the overlay text so the reading can be checked later.
- Python stdout is cp1252 on Windows and dies on emoji filenames; the scripts
  now force UTF-8 themselves rather than relying on `PYTHONIOENCODING`.

**Hard constraints:**
- See [[never-touch-chrome-profile-auth]] — never relocate a signed-in Chrome
  profile, never force-kill Chrome.
- `C:\RARA\BROWSER-AUTOMATION` (beside the workspace) is disposable in the sense that
  losing its sign-in costs one sign-in, not data — **but the safe failure and the
  dangerous one are different things.** Moving or copying it loses the sign-in
  (safe-ish, recoverable). Running a *signed-in real* profile through a junction
  destroyed cookies and account identity on profiles the user needed for work.

Related: [[warungmeng-project]]
