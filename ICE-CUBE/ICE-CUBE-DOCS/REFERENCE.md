# ICE CUBE — reference

The roster, the naming rules, the file map, and what to do when something breaks.
Everything here reflects how the system actually behaves.

---

## The roster

11 BAs. Every mapping below was confirmed from **two independent sources** — the
pinned message in each DM, and the `Jatim tok` member list.

| Folder in the month | WhatsApp number | Group name | Pinned message |
|---|---|---|---|
| `SBY PRISCA YUNITA 822-4547-6939` | `+62 822-4547-6939` | `~Priscaduma` | PRISCA YUANITA |
| `SBY SUMARI SAWI RATIH 823-2379-9015` | `+62 823-2379-9015` | `~.` | SUMARI SAWI RATIH |
| `SBY LAVITA 852-3619-2050` | `+62 852-3619-2050` | `~Celine Lavita Se` | LAVITA |
| `SBY RINDIANI 889-8997-5099` | `+62 889-8997-5099` | `~.` | RINDIANI |
| `SBY RINZANA NUR 878-9818-6141` | `+62 878-9818-6141` | `~Rinz` | RINZANA NUR |
| `SBY DESY NUR HIDAYATI 821-2000-0941` | `+62 821-2000-0941` | `~Scalpels` | DESY NUR HIDAYATI |
| `MALANG IFFARAH RAHMADANI 895-2460-4509` | `+62 895-2460-4509` | `~Iffah` | IFFARAH RAHMADANI |
| `MALANG DEWI FALASIVA 815-5511-600` | `+62 815-5511-600` | `~Siva` | DEWI FALASIVA |
| `MOJOKERTO DESI MUCHORIA 895-4029-70508` | `+62 895-4029-70508` | `~xx` | DESI MUCHORIA |
| `SIDOARJO LINDAWATI 856-3014-448` | `+62 856-3014-448` | `~Zhuxin` | LINDAWATI |
| `KEDIRI DEVI 855-3694-9462` | `+62 855-3694-9462` | `~..` | *(none — joined 2026-09-24)* |

**Not BAs:** `+62 822-5728-2525` (no pin, not in the group), `Mama Rara 3`
(group admin).

**`~the hermit` (`+62 897-0074-225`) is not a BA either — settled.** They are in
`Jatim tok` and have never DM'd, so this looked like a gap. It is not: the
spreadsheet's own header (row 1, columns B–L) lists exactly eleven names, and
`~the hermit` is not among them. **The spreadsheet's BA list is the authority**,
and the truth about what was *sent* is the group and the DMs together. If they
are not in the BA list, there is nowhere for a report of theirs to go and
nothing to fix. If they were added to the sheet, add a subfolder and a
`columns` entry in `config.json` — that is all it takes.

---

## The group

BAs post to `Jatim tok` as well as DMing. The group is **one pile with no
per-person structure** — a DM folder is a labelled pigeonhole, the group is a
tray in the lobby. So who sent what has to be established before anything can
be filed.

**Identity comes from WhatsApp's own record, never the caption.** Each message
bubble carries a `data-pre-plain-text` attribute that WhatsApp fills in:

```
DM    : "14:54, 27/09/2026] +62 852-3619-2050:"
group : "16:38, 27/09/2026] +62 815-5511-600:"
```

The number is matched against the roster folders, which already carry it in
their names. The caption is never read for identity: it is typed by hand, and
one has already been seen carrying a date the image did not.

What happens to a group image:

| Sender resolves to | Result |
|---|---|
| a roster BA | planned exactly like a DM — hash, then date, then ADD/SKIP/SUFFIX |
| nobody, but its hash is already filed somewhere | `SKIP` — a stale leftover |
| nobody, and it is not a report photo | `REJECT` |
| nobody, and it matches nothing | `UNATTRIBUTED` — listed, **not filed**, does not stop the run |

`UNATTRIBUTED` is deliberately not a gate. Reading the image cannot reveal who
sent it, so stopping the run would block every other photo behind one leftover
with no way forward. It is printed with the sender WhatsApp recorded so the
message can be found by hand.

A group post that is also DMed is filed once — the second copy hashes the same
and comes back `SKIP`.

---

## Naming

```
folder in the month : "<NAME> <number>"              SBY LAVITA 852-3619-2050
photo (BA folder)   : "DD-MM.jpeg"                   26-09.jpeg
                      same date, different image     26-09-(1).jpeg
nota copy           : "<NAME> DD-MM <number>.jpeg"   LAVITA 26-09 852-3619-2050.jpeg
```

Plain spaces. No `+62` country code. Date first in the BA folders so they sort
chronologically; name first in `ICE-CUBE-NOTA` because that folder is worked
through by person.

`insert.js` accepts the number suffix on both folders and files in any of these
forms — with `+62`, without it, or absent — so renaming is always safe:

```
SBY LAVITA                    SBY LAVITA 852-3619-2050      SBY LAVITA +62 852-3619-2050
```

---

## The files

The code is grouped into the four stages, plus `SHARED\` for what more than one
stage needs. The folder a file is in says what it is for.

```
ICE-CUBE-TOOLS\
  run-pipeline.js            runs the stages in order
  start-automation-chrome.bat   start the automation browser
  stop-automation-chrome.bat / .ps1   stop it again
  SHARED\
  SCANNER-DOWNLOADER\
  VERIFIER\
  INPUTTER\
```

### SHARED — used by more than one stage

| File | Job |
|---|---|
| `config.json` | **The only file to edit for a new month.** `monthFolder`, sheet, tab, date grid, person→column map. It also holds `agentModel` — the vision model the agent calls use; see **The agent** below |
| `paths.js` | Derives every path from where the code sits and from `monthFolder`. One source of truth. **Climbs one level** to find `ICE-CUBE-TOOLS`, because it lives in a subfolder |
| `wa_common.py` | The same for Python: paths, roster, perceptual hash. Also climbs one level |
| `cdp_browser.js` | CDP transport. One connection per batch |
| `wa_apply.py` | Files the confirmed photos into the BA folders + copies to NOTA |

### The automation browser, and how to stop it

| File | Job |
|---|---|
| `start-automation-chrome.bat` | Starts the automation Chrome on port 9333 |
| `stop-automation-chrome.bat` | Stops it — calls `.ps1` beside it, which holds the logic |
| `stop-automation-chrome.ps1` | Finds the processes whose command line names the automation profile and asks them to close |

**Closing the window is not enough.** Chrome keeps the profile's processes alive
after the window goes — 12 of them, in the test — and they hold the debug port
and the folder. The stop script closes them properly.

**It does not force-kill, and that is deliberate.** `CloseMainWindow()` asks, the
way clicking the X does; then it polls until the process count is genuinely zero.
A force-kill during shutdown can corrupt profile state — that is what destroyed a
Google sign-in on 2026-09-26, and it was done again after being warned. If the
processes will not close, the script **says so and stops** rather than escalating.

It only matches processes whose command line contains the automation profile, so
the normal Chrome — which runs from the default profile path — is never touched.
Verified: 12 automation processes closed, 18 normal ones left alone.

### SCANNER-DOWNLOADER — find what to look at, bring it down

| File | Job |
|---|---|
| `wa_fetch_all.js` | Runs every BA chat + the group through `wa_fetch.js` |
| `wa_fetch.js` | Opens ONE chat, walks its history back to the window start, downloads what it finds |
| `scan-state.js` | The per-chat check markers and the scan log |

**Scanning and downloading are ONE file on purpose.** They were separate
processes once, and the conversation silently switched between them — one BA's
photos were written into another BA's folder. They now happen in one process
with a guard that refuses if the header is not the chat that was asked for.

### VERIFIER — decide what each image is; ask the agent when unsure

| File | Job |
|---|---|
| `detect_report.py` | Is this a report photo? Visual test |
| `ocr_photo.py`, `ocr_image.ps1`, `ocr_words.ps1` | OCR, best-effort date reading |
| `wa_plan.py` | Decides ADD / SKIP / SUFFIX / REJECT / UNCLEAR / NEEDS-READ / UNATTRIBUTED / OUT-OF-MONTH |
| `captions.js` | Reads NOMINAL and OUTLET out of report captions. Neither is in the photo — nominal is handwritten on the receipt and outlet is not on it at all |

The agent itself is not a file: it is `claude -p --model <agentModel>`, called
from phase 4 and from `captions.js`. See **The agent** below.

### INPUTTER — write to the sheet, then read it back

| File | Job |
|---|---|
| `run-all.js` | Batch insert. Owns the single connection |
| `insert.js` | Inserts one image end to end |
| `verify_cells.js` | **Reads the sheet back.** Copies each unverified cell into the merged preview block `AM3:AM30`, screenshots it, and has the agent compare it with the photo on disk |
| `apply_captions.js` | Writes nominal and outlet into the matrices `N3:X32` and `Z3:AJ32`. Reads each cell back before and after, so re-running is safe and needs no ledger |

Every file here is reachable from `run-pipeline.js`. Nothing is a leftover.

### ICE-CUBE-SEPT (the month folder)

| Path | Job |
|---|---|
| `<BA folder>\` | one per BA — the photos |
| `ICE-CUBE-NOTA\` | flat copies for manual nota/price entry |
| `.ledger.json` | which cells are already inserted. Delete a row to redo one |
| `_manual-dates.json` | dates read by eye or by the agent when OCR failed |
| `_not-reports.json` | images the agent found carry no timestamp at all — ordinary chat photos. Checked once, skipped from then on |
| `_verified.json` | what each inserted cell was **seen** to contain. The ledger says "inserted"; this says "looked at". Delete it to re-verify everything |
| `verify-shots\` | the screenshot behind each verdict, so a reading can be checked later |
| `captions.json` | NOMINAL and OUTLET read from captions, with the date the overlay confirmed. Read by `apply_captions.js`; delete it to rebuild |
| `_scan-state.json` | how far each chat has been checked — see below |
| `logs\pipeline-*.log` | one per wrapper run - each phase, its duration and output |
| `logs\scan-history.log` | one line per chat per scan: when, what range, how many new |

These state files are per-month. Next month starts clean by pointing
`monthFolder` at the new folder. So does `_scan-state.json` — deleting it makes
the next run do a full first check of every chat.

`_manual-dates.json` and `_not-reports.json` are different: they hold **readings
already paid for**. Deleting them is not a clean start, it is a bill — the next
run buys the same agent calls again.

---

## The agent — exactly what is called, and with which model

Two phases call out to a model to **look at an image**. Nothing else does.

| Phase | What it is asked | Where the call is |
|---|---|---|
| 4 review | read the date out of an image's overlay, or say `UNREADABLE` / `NO-OVERLAY` | `run-pipeline.js`, `askAgent()` |
| 7 verify | compare a screenshot of a sheet cell against the photo on disk | `verify_cells.js`, `askAgent()` |

**The exact command, both places:**

```
claude -p --model <agentModel> "<prompt>"
```

`claude` is the Claude Code CLI in print mode (`-p`), spawned through a shell
because on Windows it is a `.cmd` shim. `<agentModel>` is the `agentModel`
setting in `config.json`, which is **`deepseek-v4-flash`**.

**The model must accept images, and that is not a detail.** A model that cannot
see an image does not error — it answers anyway. Every "reading" would then be a
plausible guess that looks exactly like a real one, and phase 7 would report
`SAME` for cells it never looked at. That is the failure this pinning prevents.

**Only `deepseek-v4-flash` works here.** This machine's CLI is pointed at a
gateway that remaps the model aliases (`haiku`, `sonnet`, `opus`) to other
models, and image reading does not work through them. That is why the model is
written down rather than left to the ambient default — the default lives in
`~/.claude/settings.json` and has been changed before.

To use a different model, change `agentModel` in `config.json`. Nothing else
needs touching; both call sites read it from there.

**How failures are handled.** An agent outage (no budget, no network, bad key)
is detected by its error text on stdout — `claude -p` exits `0` even when the
API call fails. It is reported as an outage, never as an unreadable image, and
the run stops rather than guessing. If the agent answers something unusable,
that is reported too, with what it actually said.

---

## How far back each scan looks

Reports do not arrive on a schedule. A BA can send a report for the 25th **late
on the 25th**, after that day's check already ran. If the next check started
from the 26th, that message would never be looked at again and nothing would
say so.

So the next scan starts **at** the day the last scan covered, not after it:

```
checked on the 25th      ->  covered through 2026-09-25
next check on the 27th   ->  scans 25, 26, 27        (25 is repeated)
```

Repeating the last day costs nothing — anything already filed hashes to the
same file and comes back `SKIP`. What it buys is that nothing slips through.

### The scan walks the conversation, it does not read the screen

Knowing *which days* to look at is only half of it. WhatsApp renders a window of
the conversation and unmounts the rest, so reading whatever is on screen is not
a scan. Measured on the real group: **13 bubbles in a 3999px list**, covering
five minutes. Several of a day's photos were simply not in the DOM.

So the fetch scrolls from the newest message **backwards** until it sees a
message older than the window start — that is the proof the whole window has
been walked. Each image is downloaded the moment its bubble is mounted, because
the list is virtualised: a bubble found now and fetched later may be gone.

Two things this depends on, both learned by measurement:

- **The message list is `[data-testid="conversation-panel-messages"]`, not
  `#main`.** `#main` does not scroll at all — its own `scrollTop` stays pinned
  at 0 — so scrolling it moves nothing and the walk ends on its first round
  believing the chat is empty.
- **The sender attribute sits ~19 levels above the image in a group**, against
  a shallower tree in a DM. A fixed 8-level climb reached it in DMs and missed
  it in every group message, which is why group images were recorded with an
  empty sender while DMs were fine.

**If the walk runs out of rounds before reaching the window start, the marker
does not advance.** A partial scan is not a scan. Leaving the marker put costs
one repeated pass next run; advancing it would skip the rest of that window for
good, and nothing would say so.

`_scan-state.json` holds one entry per chat:

```json
{
  "LAVITA": { "checkedThrough": "2026-09-27", "previous": "2026-09-25",
              "lastRunAt": "2026-09-27T05:28:11" }
}
```

**Per chat, not global**, because one chat can fail to open while others
succeed. A single global marker would drag every chat forward on one failure.

`logs\scan-history.log` is the readable version:

```
2026-09-27T05:27:29  LAVITA   2026-09-25 .. 2026-09-27    2 seen   2 new   1 older skipped
```

**The date compared is the message SEND date**, not the overlay date. The
question is *"which messages have I not looked at yet"*, and that is about when
they were sent. The burned-in overlay date is a different thing — it names the
file, it does not decide what gets scanned.

**The marker only advances on success.** `wa_fetch.js` writes it at the very
end, after everything has been read and saved. If a chat fails partway, the
marker stays put and the next run re-covers the same days.


---

## Why some things are done the way they are

**The report filter is visual, not OCR.** OCR read only 24 of 36 known-real
photos. The test that works measures how much of the lower-left corner is solid
white — every Timestamp template puts its text block there, whatever the date
format. A screenshot of the sheet scores 0.98; real photos score 0.003–0.19.

**But the filter cannot tell a report from an ordinary photo.** A holiday snap
has just as little white in its lower-left as a report does, so the test only
rules out screenshots. This went unnoticed while scans only ever saw one day of
DMs; the moment the scan reached back a week it met a pile of chat photos that
passed the filter and had no date. That is what the agent's `NO-OVERLAY` answer
is for — see phase 4 in the README — and the settled verdicts are kept in
`_not-reports.json` so they are decided once, not every run.

**The comparison is by hash, not by date.** WhatsApp re-compresses on send, so
plain hashing would not match — it uses a DCT perceptual hash. On real data the
separation was stark: matches scored 0, genuinely different images scored 24–30.

**The threshold has thin headroom and deserves a note.** `HASH_MATCH_MAX = 12`
was picked as the midpoint of that 0-vs-24 data, and the group-vs-DM re-encode
gap was not part of it: the same photo sent both ways measured **8** bits apart.
So 12 clears the known gap with four bits to spare against a floor at 22. It
works on everything seen so far, but it was arrived at by inheritance rather
than calibration, and nothing has re-derived it.

**One connection per batch.** The Google Picker dialog dismisses the moment the
CDP session drops, so the menu → upload flow has to live inside one stable
connection anyway.

**The picker is an iframe.** `document.querySelector` on the sheet page cannot
see it. The code resolves the picker frame's execution context and evaluates
inside it.

**The Upload button needs a real click.** Google's Material buttons ignore
synthetic `MouseEvent`. The code computes absolute viewport coordinates and uses
`Input.dispatchMouseEvent`.

**The menu is matched in two languages.** This sheet's UI is Indonesian:
`Gambar` / `Sisipkan gambar dalam sel`, as well as `Image` / `Insert image in
cell`.

**Verification compares by eye, not by hash.** The two things being compared are
a photo file and a screenshot of a canvas — no hash spans that. The agent makes
the call, and it is the only stage in the whole pipeline that reads back what
was written.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No debug port on 9333` | automation Chrome not running | nothing to do — preflight starts it. If it cannot, the run says so and names the script |
| Every DM fails, `header=""`, rows render empty | **the WhatsApp window is minimised.** A minimised WebView2 stops rendering while its debug port keeps answering, so the DOM freezes: `header=""`, chat-list rows with no text, and the search never filters | restore the window. `wa_fetch_all.js` does this before every chat now — `ShowWindow(SW_RESTORE)`, because `AppActivate` alone is not enough |
| The window check passed but the DOM was frozen | `MainWindowHandle -ne 0` is **true for a minimised window** | the real check is `IsIconic`, and the real proof is the DOM: `wa_fetch.js` refuses to scan if the chat list has fewer than five named rows |
| `!! could not open "<chat>"` | the conversation did not switch | re-run. The log now prints **which row was clicked and whether it was on screen**, so the next failure says which of the two causes it was |
| `Upload control not found` | picker iframe not rendered yet | `insert.js` polls for it; if it persists the picker UI changed |
| Menu item not found | the sheet's UI language changed | add the new wording to the matcher in `insert.js` |
| Plan says `NEEDS-READ` | OCR could not read the date | nothing, usually — the agent reads it and the plan is re-run. It only reaches you if the agent could not read it either |
| Plan says `UNCLEAR` | the report filter was inconclusive | look at the image; if it is a report, read its date by hand |
| Run stopped with exit 2 | a date needed reading and the agent could not read it either | open the image listed in the log, read it, add it to `_manual-dates.json` |
| Run stopped with exit 1 | a phase failed, **or phase 7 found a cell that does not match** | read `ICE-CUBE-SEPT\logs\pipeline-*.log` - it names the phase and the error |
| Agent call fails (`agent unavailable`) | the Claude CLI has no budget or is not installed | the run stops safely and asks you to read the image; nothing is guessed |
| A chat seems to be re-scanning everything | that chat has no entry in `_scan-state.json` | it is doing a first check; it settles after one run |
| A report was missed | should not happen - the last checked day is always repeated | check `logs\scan-history.log` for what range each chat actually covered |
| Batch inserts rows you did not expect | `--since` was omitted | always pass `--since`; check `--dry-run` output first |
| A file is skipped as unparseable | filename not `DD-MM.*` (e.g. `03-09-NOTA.jpeg`) | expected for non-report images; they are reported, never silently dropped |
| Plan says `UNATTRIBUTED` | a group image whose sender WhatsApp did not record (downloaded before the sender was being saved) | it is listed with whatever sender was recorded; find the message in `Jatim tok` and file it by hand, or re-run the group fetch |
| Log says `walk hit the 150-round cap` | that chat has more history than the walk can cover in one pass | its marker was deliberately NOT advanced, so the next run re-covers it; nothing was lost |
| Plan says `OUT-OF-MONTH` | the image carries a date from another month (e.g. a photo dated 13-08 sent during September) | **not** filed — the cell comes from the day alone, so it would land in the row for 13 September. Read the overlay in the plan log; file it by hand if it belongs somewhere |
| A BA's folder is empty and the chat scans clean | they have not sent anything | check `.ledger.json` — no entries for that BA means nothing was ever filed, so nothing was missed |
| You want to know whether the sheet is actually right | phase 7 (`verify_cells.js`) answers it — it pastes each inserted cell into `AM3:AM30`, screenshots it, and has the agent compare it with the photo | check `_verified.json` for the verdict per cell, and `verify-shots\` for what was actually seen. Nothing can read in-cell images any other way: `gviz` CSV omits them and the DOM has no cells |
| Phase 7 reports a cell as `DIFFERENT` | the cell does not show the photo the ledger says is there | nothing was changed. Open that cell and look. The screenshot in `verify-shots\` is the evidence |
| Phase 7 says `could not select AM3` | the merged preview block moved or was unmerged | update `PREVIEW` in `verify_cells.js` to wherever the preview block now lives — pasting into an unselected cell silently does nothing |
| A group report was filed although the BA also DMed it | it was not — the second copy hashes the same and comes back `SKIP` | check the plan output; a genuine double file would need two different images |

---

## Housekeeping

- **The whole `C:\RARA\` folder can be moved anywhere.** Every path, including
  the automation profile, is derived from where the code itself sits — `paths.js`
  reads its own location and climbs from there. Nothing needs editing after a
  move.
- **`BROWSER-AUTOMATION\` lives BESIDE the workspace, at `C:\RARA\`, not inside
  `ICE-CUBE\`** — deliberately, so a 600 MB Chrome profile never travels with the
  project. It is the one folder Chrome pins to its path: a moved or copied
  profile survived a copy, a move AND a rename with its sign-in intact — measured
  2026-09-29. The dangerous failure is the OTHER one: running a signed-in real
  profile through a junction, which destroyed cookies and account identity.
- `WA-DOWNLOAD\` is a staging folder. It is safe to delete between runs.
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` is **machine-wide** — it enables a
  debug port on every WebView2 app, not just WhatsApp. To turn it off:
  ```
  [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $null, 'User')
  ```
