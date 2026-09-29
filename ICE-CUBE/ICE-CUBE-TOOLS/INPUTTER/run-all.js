#!/usr/bin/env node
/**
 * run-all.js — insert every photo found under photoRoot into its correct cell.
 *
 *   node run-all.js                 # everything not already in the ledger
 *   node run-all.js --dry-run       # print the plan, touch nothing
 *   node run-all.js --folder "SBY LAVITA"   # limit to one folder
 *   node run-all.js --force         # ignore the ledger and redo everything
 *
 * Skips anything the ledger says is already done, so reruns are safe.
 * Aborts after 3 consecutive failures — that pattern means something systemic
 * broke, and hammering the sheet 20 more times won't help.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertOne, cellFor, photoRootDir } from './insert.js';
import { Browser, Session } from '../SHARED/cdp_browser.js';
import { MONTH, CONFIG } from '../SHARED/paths.js';


const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const onlyFolder = argv.includes('--folder') ? argv[argv.indexOf('--folder') + 1] : null;

// Scope limiter. Without this the tool would happily re-insert EVERY photo in
// the tree, including ones already entered by hand. --since filters on file
// mtime so a run targets only the batch that was actually dropped that day.
const sinceArg = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : null;
// --limit N: only the first N items. For proving a run on a small slice
// instead of committing 26 images to a live sheet.
const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : null;
const sinceMs = sinceArg ? new Date(`${sinceArg}T00:00:00`).getTime() : null;
if (sinceArg && Number.isNaN(sinceMs)) {
  console.error(`bad --since value: ${sinceArg} (expected YYYY-MM-DD)`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// build the work list from the actual folder tree
// ---------------------------------------------------------------------------

const work = [];
const skipped = [];
const problems = [];

const ROOT = MONTH;
const IGNORE = new Set((CONFIG.ignoreFolders || []).map((f) => f.toUpperCase()));
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = entry.name;
  if (IGNORE.has(folder.toUpperCase())) continue;
  if (onlyFolder && folder.toUpperCase() !== onlyFolder.toUpperCase()) continue;

  const files = fs.readdirSync(path.join(ROOT, folder))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .filter((f) => {
      if (sinceMs === null) return true;
      return fs.statSync(path.join(ROOT, folder, f)).mtimeMs >= sinceMs;
    });

  if (!files.length) { problems.push({ folder, issue: 'no image files' }); continue; }

  for (const file of files) {
    try {
      const { cell } = cellFor(folder, file, CONFIG);
      work.push({ folder, file, cell });
    } catch (e) {
      problems.push({ folder, file, issue: String(e.message).slice(0, 120) });
    }
  }
}

// stable order: by cell column then row, so it sweeps the sheet left-to-right
work.sort((a, b) => {
  const ca = a.cell.match(/^([A-Z]+)(\d+)$/), cb = b.cell.match(/^([A-Z]+)(\d+)$/);
  return ca[1].localeCompare(cb[1]) || Number(ca[2]) - Number(cb[2]);
});

if (limit && work.length > limit) {
  console.log(`\n--limit ${limit}: trimming ${work.length} -> ${limit} items (test slice)`);
  work.length = limit;
}

console.log(`\n=== ICE CUBE BATCH ===`);
console.log(`photos found : ${work.length}`);
console.log(`mode         : ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
if (onlyFolder) console.log(`folder filter: ${onlyFolder}`);
if (problems.length) {
  console.log(`\nskipped entries with problems:`);
  for (const p of problems) console.log(`  - ${p.folder}${p.file ? '/' + p.file : ''}: ${p.issue}`);
}
console.log(`\nplan:`);
for (const w of work) console.log(`  ${w.cell.padEnd(5)} <- ${w.folder} / ${w.file}`);
console.log('');

if (dryRun) { console.log('dry run complete — nothing was changed.\n'); process.exit(0); }

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const results = [];
let consecutiveFailures = 0;
const ABORT_AFTER = 3;
const started = Date.now();

// ONE connection for the whole batch.
// The automation profile's classic debug server has no permission gate, but a
// single stable connection is still required: the Google Picker dismisses the
// moment a CDP session drops, so reconnecting per image would break the flow.
let batchSession = null;
let batchBrowser = null;
if (work.length) {
  process.stdout.write('connecting to the automation Chrome... ');
  batchBrowser = await Browser.connect(CONFIG.chromePort || 9333);
  batchSession = await Session.open(batchBrowser, `spreadsheets/d/${CONFIG.spreadsheetId.slice(0, 12)}`);
  console.log(`connected, attached to "${String(batchSession.info.title).slice(0, 40)}"`);
  console.log('  -> no permission prompt on this transport; one connection serves all ' + work.length + ' images\n');
}

for (let i = 0; i < work.length; i++) {
  const { folder, file, cell } = work[i];
  const n = `[${i + 1}/${work.length}]`;
  process.stdout.write(`${n} ${cell.padEnd(5)} ${folder} / ${file} ... `);

  let res;
  try {
    res = await insertOne({ folder, file, force, session: batchSession });
  } catch (e) {
    res = { folder, file, cell, status: 'error', error: String(e).slice(0, 200) };
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${res.status.toUpperCase()}${res.pickerClosedAfterSeconds ? ` (${res.pickerClosedAfterSeconds}s)` : ''}  [${elapsed}s total]`);
  if (res.toast) console.log(`      toast: ${res.toast}`);
  if (res.error) console.log(`      error: ${res.error}`);

  results.push(res);

  if (res.status === 'inserted' || res.status === 'skipped') {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
    if (consecutiveFailures >= ABORT_AFTER) {
      console.log(`\n!! ${ABORT_AFTER} consecutive failures — aborting to avoid hammering the sheet.`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const tally = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const remaining = work.slice(results.length);

console.log(`\n=== SUMMARY ===`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`);
if (remaining.length) {
  console.log(`  not attempted: ${remaining.length}`);
  for (const r of remaining) console.log(`    - ${r.cell} ${r.folder}/${r.file}`);
}

// No batch-report file. One was written per run and nothing ever read it, so
// they only accumulated. The SUMMARY above is the record, and the pipeline
// captures this whole stdout into its own log.
console.log('');

// close the single batch connection now that all work is done
if (batchSession) { try { await batchSession.detach(); } catch { /* gone */ } }
if (batchBrowser) { try { batchBrowser.close(); } catch { /* gone */ } }
