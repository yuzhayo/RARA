# Starting a new month

Short checklist. Everything else stays as it is.

## 1. Copy the month folder

Copy `ICE-CUBE-SEPT` → `ICE-CUBE-OCT` (still inside `C:\RARA\ICE-CUBE\`).

Then inside the new folder:

- delete last month's photos from every BA subfolder
- empty `ICE-CUBE-NOTA`
- delete `.ledger.json` (insert history — must start clean)
- delete `_manual-dates.json` (last month's by-eye readings)
- delete `_not-reports.json` (last month's "not a report" verdicts)
- delete `_verified.json` (last month's cell read-backs)
- empty or delete `verify-shots\` (the screenshots behind those verdicts)
- delete `captions.json` (last month's nominal/outlet readings)
- delete `_scan-state.json` (last month's check markers - the first run then
  does a full check of every chat)
- delete the `logs\` folder, or leave it as history

These are keyed by things that repeat month to month, so carrying them over
would apply last month's readings to this month's photos:

| file | keyed by | collides because |
|---|---|---|
| `_manual-dates.json` | `<BA>/<filename>` | `26-09.jpeg`, `11_image_11.jpg` |
| `_not-reports.json` | `<BA>/<filename>` | same |
| `_verified.json` | **cell address** | `C27` is the 25th of every month |
| `captions.json` | BA + date | the same dates every month |

Keep the BA subfolder names. They carry the WhatsApp number, which is what
`config.json` matches on.

## 2. Point the tools at it

Edit **one line** in `ICE-CUBE-TOOLS\SHARED\config.json`:

```json
"monthFolder": "ICE-CUBE-OCT"
```

Every path derives from that — no other file needs touching.

## 3. Update the grid

1. Open the new tab in the sheet
2. Click the cell holding day 1 (`01-Oct`)
3. Read the **Name Box** — it shows something like `A3`. That number is `firstRow`
4. Read the header rows for the person → column letters

Update in `config.json`:

```json
"tab": "OKTOBER",
"dateRow": { "firstRow": 3, "firstDay": 1 },
"columns": { "SBY LAVITA": "D", ... }
```

- `row = day - firstDay + firstRow`, so `03-Oct` at `firstRow 3` lands on row 5
- `columns` keys are matched uppercase, and the folder's trailing number is
  stripped before matching — so `SBY LAVITA 852-3619-2050` matches key
  `SBY LAVITA`

If the roster changed, add or remove people here and rename the matching
subfolder.

## 4. Verify before running

```powershell
cd C:\RARA\ICE-CUBE\ICE-CUBE-TOOLS
node run-pipeline.js --dry-run
```

That checks the whole chain without writing anything: it confirms the automation
Chrome is up, fetches nothing new, re-plans, and prints what it would file and
insert. **Read the plan.** The photos should map to the cells you expect, and the
count should match what is in the folders.

If the count or the cells look wrong, fix `config.json` and run it again before
going any further.

## What does NOT change

| | |
|---|---|
| `BROWSER-AUTOMATION\` | lives at `C:\RARA\`, beside the workspace. Derived, not fixed. It has been copied, moved and renamed with its sign-in intact — see REFERENCE's Housekeeping |
| `ICE-CUBE-TOOLS\` | the code |
| `ICE-CUBE-DOCS\` | this documentation |
| `WA-DOWNLOAD\` | staging, safe to clear any time |
| the automation Chrome sign-in | persists — nothing to re-do |
| `agentModel` in `config.json` | **leave it alone.** You edit `config.json` in step 2, so the temptation is to touch everything in it. This one is `deepseek-v4-flash` and must not change: it is the only model available here that can read an image, and both phase 4 and phase 7 read images. See **The agent** in `REFERENCE.md` |
