# ICE CUBE — how to run it

Takes delivery photos that BAs send on WhatsApp into the "Tracking Ice Cube"
Google Sheet, with the folder tree and the sheet staying in sync.

Everything here has been run end to end. Nothing speculative.

---

## The structure

```
C:\RARA\
  BROWSER-AUTOMATION\   the automation Chrome profile  (beside, not inside)
  ICE-CUBE\
    ICE-CUBE-SEPT\       the month folder: photos + nota + state
    ICE-CUBE-DOCS\       this documentation
    ICE-CUBE-TOOLS\      the code, grouped by stage
      SHARED\            config, paths, cdp transport
      SCANNER-DOWNLOADER\  find what to look at, bring it down
      VERIFIER\          what each image is; asks the agent
      INPUTTER\          write to the sheet, read it back
      run-pipeline.js    runs the stages in order
    WA-DOWNLOAD\         temp staging for fetched images
  SPREADSHEET\           (not part of this pipeline)
```

**The browser profile sits beside the workspace on purpose.** It is the
browser's data, not the project's — a 600 MB Chrome profile should not travel
with the code.

Nothing here is a fixed path: every one is derived from where the code sits, so
moving `C:\RARA\` anywhere needs no editing, including the browser profile.

**Do not confuse the two Chrome dangers.** This profile has been copied, moved
and renamed, and its sign-in survived all three — measured. The dangerous one is
different: running a **signed-in real** profile through a junction destroyed
cookies and account identity on accounts the user needed for work.

The only thing that changes each month is `monthFolder` in
`ICE-CUBE-TOOLS\SHARED\config.json`.

---

## The flow

```
WhatsApp (11 DMs + group "Jatim tok")
   │
   ├─ 1. SCAN       scroll back to the start of the check window   wa_fetch.js
   │                and download every image found. The screen is not
   │                the conversation — WhatsApp unmounts what is
   │                scrolled away, so reading it is not a scan.
   │
   ├─ 2. IDENTITY   who sent it. A DM folder is the answer for a DM;
   │                a group post is matched by the sender NUMBER
   │                WhatsApp records on the message. Never the caption.
   │
   ├─ 3. FILTER     drop anything that isn't a report     detect_report.py
   │                (visual test, not OCR)
   │
   ├─ 4. DATE       read the date burned into the image   wa_plan.py
   │                OCR first; if it fails, read by eye
   │
   ├─ 5. COMPARE    hash: already there -> skip
   │                date: already used  -> suffix -(1)
   │
   ├─ 6. FILE       into the BA folder as DD-MM.jpeg      wa_apply.py
   ├─ 7. NOTA       copy into ICE-CUBE-NOTA
   │
   ├─ 8. INSERT     into the spreadsheet                  run-all.js
   │
   └─ 9. VERIFY     copy the cell into the merged preview verify_cells.js
                    block AM3:AM30, screenshot it, and have the
                    agent compare it with the photo on disk

   THEN, TRIGGERED BUT NOT IN THE CHAIN:

   ├─ NOMINAL   read from the caption, written to N3:X32   captions.js
   └─ OUTLET    read from the caption, written to Z3:AJ32  apply_captions.js
```

**Nominal and outlet are not in the photo.** Nominal is handwritten on the
receipt; outlet is not written on it at all. The only place either exists is
the caption the BA types — so those two come from the caption, while the date
still comes from the burned-in overlay. That split is the whole reason this
runs separately.

It is **triggered by the pipeline and never waits for it**: if a caption cannot
be parsed, the photos have already been filed and verified, and nothing above is
affected. It also never touches the photo matrix (B–L).

Steps 6–7 happen together in `wa_apply.py`. Step 8 is always last of the
writing: the sheet must reflect the folders, so the folders have to be right
first. Step 9 is the only stage that reads back what was written.

---

## Running it

### Once per session

Double-click **`ICE-CUBE-TOOLS\start-automation-chrome.bat`**.
It opens the automation Chrome and tells you when the debug port is live.

To stop it again, double-click **`stop-automation-chrome.bat`**. Closing the
window is not enough — Chrome leaves the profile's processes running, and they
hold the debug port. The stop script closes them the safe way (`CloseMainWindow`,
then waits); it never force-kills.

The WhatsApp window must be **open and not minimised** — `wa_fetch_all.js`
restores and foregrounds it before every chat. A *minimised* window is the trap:
its debug port keeps answering while the renderer stops, so the DOM freezes,
`header=""`, and every DM fails to open. `MainWindowHandle` is non-zero for a
minimised window, which is why the check uses `IsIconic` instead.

### Every batch

**One command does everything:**

```powershell
cd C:\RARA\ICE-CUBE\ICE-CUBE-TOOLS

node run-pipeline.js --dry-run     # show the plan; no folder or cell is touched
node run-pipeline.js               # do it, then read the sheet back to confirm
```

It runs seven phases and stops if anything is wrong:

```
1  PREFLIGHT   WhatsApp window open? automation Chrome up?
2  FETCH       wa_fetch_all.js
3  PLAN        wa_plan.py
4  REVIEW      unreadable dates -> the agent reads them, then re-plans
5  APPLY       wa_apply.py -- file into BA folders + copy to NOTA
6  INSERT      run-all.js -- the spreadsheet
7  VERIFY      verify_cells.js -- read the sheet back, cell by cell
```

**Phase 7 is what makes the rest trustworthy.** The ledger records
`verified: "picker closed, no error toast"` — that is a statement about the
*dialog*, not about the cell. It says the picker dismissed without an error.
Nothing had ever looked at a cell.

An in-cell image cannot be read by any normal route: Sheets renders to a
**canvas** (no cell elements in the DOM), and the `gviz` CSV endpoint returns
text but **omits images** — the exact thing that needs checking. Selecting such
a cell leaves the formula bar empty.

So the image is moved somewhere it can be seen: **copy the cell, paste it into
the merged preview block `AM3:AM30`, screenshot that, and compare the result
against the photo on disk.** The merged cell must be *selected* first — pasting
into a cell that is not selected goes nowhere and the preview keeps showing the
previous image, which is how a check can pass while verifying the wrong photo.

The comparison is visual, so the agent makes it, not a hash: the two things
being compared are a photo file and a screenshot of a canvas, and no hash spans
that. The agent is the same pinned vision model phase 4 uses — see **The agent**
in `REFERENCE.md`. Results land in `_verified.json`; `verify-shots\` keeps the
screenshots.

Phase 7 is deliberately **not** fatal. The insert has already happened, and a
mismatch is something to read and look at, not to undo automatically.

**Phase 4 is why this is worth having.** When OCR cannot read a date, the
pipeline calls a **vision model** to look at the image — `claude -p --model
<agentModel>`; the exact command, the model, and why it is pinned are in
**The agent** in `REFERENCE.md`. It replies with one of **three** things, and the
difference matters:

| The agent says | Meaning | What happens |
|---|---|---|
| a date | the overlay was legible | recorded in `_manual-dates.json`, the plan is re-run, the run carries on |
| `UNREADABLE` | an overlay is there but the date will not come out | the run stops and tells you — **nothing is guessed** |
| `NO-OVERLAY` | there is no timestamp on this image at all | it is not a report — reclassified as `REJECT`, the run carries on |

That third answer is not a nicety. A holiday snap has just as little white in
its lower-left corner as a report does, so the visual filter cannot rule it
out — and a scan that reaches further back meets plenty of them. Without it
they pile up as "unreadable dates" and hold the run shut for nothing. The agent
also repeats the overlay text it read, so `_manual-dates.json` records *what was
seen* and the reading can be checked later, exactly as the hand-read entries do.

If the agent cannot be reached at all (no budget, no network) the run stops
safely and asks you to read the image. An outage is never mistaken for an
unreadable image.

**Every run writes a log** to `ICE-CUBE-SEPT\logs\pipeline-<timestamp>.log`:
each phase, its duration, its output, and any error. When something looks
wrong, read the log first.

Exit codes: `0` finished · `1` aborted, **or the sheet did not read back clean** ·
`2` stopped because a date needs a human · `130` interrupted with Ctrl+C.

Useful flags:

| Flag | Effect |
|---|---|
| `--dry-run` | stop after the plan; no folder is written and the sheet is not touched |
| `--skip-fetch` | reuse images already in `WA-DOWNLOAD` |
| `--since YYYY-MM-DD` | override the date passed to the sheet insert |

`--dry-run` still **records what the agent read** into `_manual-dates.json` and
`_not-reports.json`. Those are readings, not results — the same as a person
opening the image and writing the date down — and throwing them away would mean
paying for the same agent calls twice.

### Running the phases by hand

Each phase still works on its own if you want to inspect or re-run one. Run them
from `ICE-CUBE-TOOLS\`, and name the stage folder:

```powershell
node SCANNER-DOWNLOADER\wa_fetch_all.js
python VERIFIER\wa_plan.py --out ..\WA-DOWNLOAD\_plan.json
python SHARED\wa_apply.py --dry-run
python SHARED\wa_apply.py
node INPUTTER\run-all.js --since 2026-09-27 --dry-run
node INPUTTER\run-all.js --since 2026-09-27
node INPUTTER\verify_cells.js
node VERIFIER\captions.js
node INPUTTER\apply_captions.js
```

`verify_cells.js` also takes `--cells C27,B28` to check particular cells,
`--limit N` to stop after a few, and `--all` to look at everything in the ledger
again — not just what has not been checked yet.

Always `--dry-run` first. It prints the plan and changes nothing.

`--since` matters: without it `run-all.js` scans **every** photo in the month
folder, including rows that were filled in by hand. The ledger skips what it
knows about, but the older hand-entered photos are not in it.

---

## What the plan output means

| Action | Meaning |
|---|---|
| `ADD` | new report — will be filed as `DD-MM.jpeg` |
| `SKIP` | hash matches a file already in that BA's folder — a duplicate send |
| `SUFFIX` | that date already has a photo but this is a different image — filed as `DD-MM-(1).jpeg` |
| `REJECT` | not a report photo (screenshot, etc.) — dropped |
| `UNCLEAR` | the visual test was inconclusive — look at it yourself |
| `NEEDS-READ` | it is a report, but the date could not be read — **read it yourself** |
| `UNATTRIBUTED` | a group image with no sender on record — listed and left alone, **not** filed, and it does not stop the rest of the run |
| `OUT-OF-MONTH` | the image carries a date from another month — **not** filed, and it does not stop the rest of the run. The cell is worked out from the DAY alone, so a 13 August photo would land in the row for 13 September |

---

## Rules that are not obvious

**The date comes from the image**, not from when it was sent and not from the
caption. The overlay burned in by the Timestamp Camera app is authoritative.

**Captions lie.** One photo captioned "26 sept" carried an overlay reading
25 September. Never file by caption.

**Identity comes from the DM pinned message**, never from the burned-in name or
the group nickname. Formats differ per BA. For a **group** post, identity comes
from the sender number WhatsApp records on the message — the caption is never
read for who sent it.

**A BA may send several reports in one day** — each carries a *different* date
(they are catching up). An identical image means they sent it twice: skip.

**An unreadable date is never guessed.** It goes to `NEEDS-READ` and a human
reads the image. OCR is a convenience, not the authority.

---

## One-time setup (already done)

- Automation Chrome profile at `BROWSER-AUTOMATION`, signed in once.
  Any signed-in Google account works — the sheet is public-edit.
- WhatsApp Desktop made controllable on port **9223** via the machine-wide
  environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`.

---

## ⛔ Never do this

**Never run Chrome with `--user-data-dir` pointing at a junction, symlink or copy
of a profile that is already signed in.** It makes Chrome discard the cookies and
wipe the account identity. This was done once, on 2026-09-26, to work around a
debug-port restriction — it destroyed Google sign-in on two profiles that were
needed for work and cost a real sign-in to recover.

The automation profile is different and safe: it has **only ever lived at one
path**. That is the whole reason it works.

**Never force-kill Chrome.** Graceful close, then wait for the process count to
hit zero.

**Never move or rename `BROWSER-AUTOMATION`.** Chrome ties cookie encryption to
the path.
