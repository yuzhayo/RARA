#!/usr/bin/env node
/**
 * run-pipeline.js — run the whole ICE CUBE flow in one command, with logging
 * and guardrails.
 *
 *   node run-pipeline.js                    full run
 *   node run-pipeline.js --dry-run          stop after the plan; write nothing
 *   node run-pipeline.js --since 2026-09-27 override the sheet's --since date
 *   node run-pipeline.js --skip-fetch       reuse images already in WA-DOWNLOAD
 *
 * PHASES
 *   1 preflight  WhatsApp window open? automation Chrome up?
 *   2 fetch      wa_fetch_all.js
 *   3 plan       wa_plan.py
 *   4 review     STOP if any date needs a human. This is a gate, not an error.
 *   5 apply      wa_apply.py -- file into BA folders + copy to NOTA
 *   6 insert     run-all.js -- the spreadsheet, always last
 *   7 verify     verify_cells.js -- paste each inserted cell into AM3:AM30,
 *                screenshot it, and have the agent compare it with the photo.
 *                The ledger says "inserted"; only this says "looked at".
 *
 * THEN, TRIGGERED BUT NOT IN THE CHAIN:
 *   captions     captions.js + apply_captions.js -- NOMINAL and OUTLET.
 *                Neither is in the photo (nominal is handwritten on the
 *                receipt, outlet is not on it at all), so both come from the
 *                caption the BA types. Runs after the photos are done, and a
 *                failure here never fails the run.
 *
 * GUARDRAILS
 *   - per-phase timeout; the child is killed and the run aborts
 *   - every phase must succeed before the next one starts; a failed apply can
 *     never be followed by an insert, so the sheet is never built from folders
 *     that are not yet correct
 *   - fetch is retried once (WhatsApp Web is occasionally slow to settle)
 *   - Ctrl+C is trapped, logged, and exits cleanly
 *   - --dry-run writes nothing but the agent's readings, and never the sheet
 *   - verify is deliberately NOT fatal: the insert has already happened, and a
 *     mismatch is something to read and look at, not to undo automatically
 *
 * Log: ICE-CUBE-SEPT\logs\pipeline-<timestamp>.log
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, MONTH, WA_DOWNLOAD, CONFIG } from './SHARED/paths.js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const SKIP_FETCH = argv.includes('--skip-fetch');
const sinceIdx = argv.indexOf('--since');
const SINCE = sinceIdx !== -1 ? argv[sinceIdx + 1] : null;

const LOG_DIR = path.join(MONTH, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_PATH = path.join(LOG_DIR, `pipeline-${stamp}.log`);

const t0 = Date.now();

// Written SYNCHRONOUSLY on purpose. A WriteStream buffers, and every exit path
// here calls process.exit() immediately - which discarded the buffer and left
// empty log files. appendFileSync cannot lose the last lines.
function logRaw(text) {
  fs.appendFileSync(LOG_PATH, text.endsWith('\n') ? text : text + '\n');
}
function log(msg) {
  const line = `[${((Date.now() - t0) / 1000).toFixed(1).padStart(7)}s] ${msg}`;
  console.log(line);
  logRaw(line);
}

let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  log('');
  log('!! interrupted (Ctrl+C) - stopping. Finished phases are recorded above.');
  log(`   log: ${LOG_PATH}`);
  process.exit(130);
});

/** Run a child process with a hard timeout and full logging. */
function step(name, cmd, args, { timeoutMs, retries = 0 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const label = attempt ? `${name} (retry ${attempt})` : name;
    log(`--- ${label}: ${cmd} ${args.join(' ')}`);
    const started = Date.now();

    const r = spawnSync(cmd, args, {
      cwd: TOOLS,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      // PYTHONIOENCODING matters: captions and filenames contain emoji, and
      // Python writing those to a cp1252 stdout crashes the child.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const out = (r.stdout || '') + (r.stderr || '');
    logRaw(out);

    if (r.error && r.error.code === 'ETIMEDOUT') {
      log(`--- ${label}: TIMEOUT after ${secs}s (limit ${(timeoutMs / 1000).toFixed(0)}s)`);
      if (attempt < retries) continue;
      return { ok: false, reason: 'timeout', output: out };
    }
    if (r.error) {
      log(`--- ${label}: could not start - ${r.error.message}`);
      return { ok: false, reason: 'spawn-failed', output: out };
    }
    if (r.status !== 0) {
      log(`--- ${label}: exited ${r.status} after ${secs}s`);
      if (attempt < retries) continue;
      return { ok: false, reason: `exit ${r.status}`, output: out };
    }

    log(`--- ${label}: ok in ${secs}s`);
    return { ok: true, output: out };
  }
}

function abort(phase, why) {
  log('');
  log(`!! ABORTED at ${phase}: ${why}`);
  log('   Nothing further was run.');
  log(`   log: ${LOG_PATH}`);
  process.exit(1);
}

function py() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

// ---------------------------------------------------------------------------

log('============================================================');
log(`ICE CUBE pipeline   ${new Date().toISOString()}`);
log(`month folder : ${MONTH}`);
log(`mode         : ${DRY ? 'DRY RUN (writes nothing)' : 'LIVE'}${SKIP_FETCH ? '  (skip fetch)' : ''}`);
log('============================================================');

// --- 1. preflight ---------------------------------------------------------
log('');
log('PHASE 1/7  preflight');

if (!fs.existsSync(MONTH)) abort('preflight', `month folder not found: ${MONTH}`);

const sleepMs = (ms) => spawnSync('powershell',
  ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], { timeout: ms + 10000 });

const chromeLive = () => {
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      "try { (Invoke-RestMethod -Uri 'http://127.0.0.1:9333/json/version' -TimeoutSec 3).Browser } catch { '' }"
    ], { encoding: 'utf8', timeout: 15000 });
    return (r.stdout || '').trim() || null;
  } catch { return null; }
};

const whatsappState = () => {
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*WhatsApp*' } | " +
      "Select-Object -First 1 -Property Id,@{n='W';e={$_.MainWindowHandle -ne 0}} | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', timeout: 15000 });
    const j = JSON.parse((r.stdout || '{}').trim() || '{}');
    return { running: !!j.Id, window: !!j.W };
  } catch { return { running: false, window: false }; }
};

/**
 * Preflight STARTS what is missing instead of telling the operator to go and
 * do it. If the guard knows how to check something, it knows how to start it -
 * aborting with instructions is only the right answer when starting fails.
 */
async function ensureChrome() {
  const already = chromeLive();
  if (already) { log(`  automation Chrome: ${already}`); return; }

  log('  automation Chrome: not running - starting it...');
  spawnSync('cmd', ['/c', path.join(TOOLS, 'start-automation-chrome.bat')],
    { cwd: TOOLS, encoding: 'utf8', timeout: 120000, stdio: 'ignore' });

  for (let i = 0; i < 40; i++) {
    sleepMs(1000);
    const b = chromeLive();
    if (b) { log(`  automation Chrome: started (${b})`); return; }
  }
  abort('preflight', 'could not start the automation Chrome after 40s');
}

async function ensureWhatsApp() {
  const st = whatsappState();
  if (st.running) {
    log(`  WhatsApp: running, window ${st.window ? 'open' : 'CLOSED (the fetch phase will open it)'}`);
    return;
  }

  log('  WhatsApp: not running - starting it...');
  spawnSync('powershell', ['-NoProfile', '-Command',
    "Start-Process 'shell:appsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App'"],
    { encoding: 'utf8', timeout: 30000 });

  for (let i = 0; i < 40; i++) {
    sleepMs(1000);
    const s = whatsappState();
    if (s.running) { log(`  WhatsApp: started, window ${s.window ? 'open' : 'opening'} `); return; }
  }
  abort('preflight', 'could not start WhatsApp after 40s');
}

// A dry run reads folders, not the browser, so it must not launch anything.
if (DRY) {
  const b = chromeLive();
  log(`  automation Chrome: ${b || 'not running (fine for a dry run - nothing is launched)'}`);
  if (!SKIP_FETCH) log(`  WhatsApp: ${whatsappState().running ? 'running' : 'not running (fine for a dry run)'}`);
} else {
  await ensureChrome();
  if (!SKIP_FETCH) await ensureWhatsApp();
}

// --- 2. fetch -------------------------------------------------------------
if (!SKIP_FETCH) {
  log('');
  log('PHASE 2/7  fetch from WhatsApp');
  // 90 minutes for all 12 chats. Each one scrolls back to the start of its
  // window now, so the phase is bounded by conversation length rather than by
  // a single screenview - and a deliberate re-scan of several days is the
  // slowest case this phase has to survive.
  const r = step('fetch', 'node', ['SCANNER-DOWNLOADER/wa_fetch_all.js'], { timeoutMs: 90 * 60 * 1000, retries: 1 });
  if (!r.ok) abort('fetch', r.reason);
} else {
  log('');
  log('PHASE 2/7  fetch - SKIPPED (--skip-fetch)');
}

// --- 3. plan --------------------------------------------------------------
log('');
log('PHASE 3/7  plan');
const planPath = path.join(WA_DOWNLOAD, '_plan.json');
{
  const r = step('plan', py(), ['VERIFIER/wa_plan.py', '--out', planPath], { timeoutMs: 15 * 60 * 1000 });
  if (!r.ok) abort('plan', r.reason);
}

let plan = [];
try {
  plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
} catch (e) {
  abort('plan', `could not read the plan file: ${e.message}`);
}

const counts = plan.reduce((a, p) => { a[p.action] = (a[p.action] || 0) + 1; return a; }, {});
log(`  plan: ${JSON.stringify(counts)}`);

// --- 4. review gate -------------------------------------------------------
log('');
log('PHASE 4/7  review');

/**
 * Every list below is derived from the plan - and the plan is REPLACED once the
 * agent has read the dates OCR could not. Deriving them once, before that, meant
 * the ADDs the agent produced were never seen again: a run would report
 * "add: 3" and then file nothing at all, and still finish DONE.
 *
 * So they are derived by a function and re-derived after every re-plan.
 */
function derive(p) {
  return {
    unclear: p.filter((x) => x.action === 'unclear'),
    todo: p.filter((x) => x.action === 'add' || x.action === 'suffix'),
    needsRead: p.filter((x) => x.action === 'needs-read'),
    // Group images whose sender WhatsApp did not record, so they cannot be
    // matched to a BA. Listed, but deliberately NOT a gate: reading the image
    // cannot reveal who sent it, so stopping would block every other photo
    // behind one leftover with no way forward.
    unattributed: p.filter((x) => x.action === 'unattributed'),
    // Images carrying a date from another month. The cell is worked out from the
    // DAY alone, so a 13 August photo would be filed as 13-08.jpeg and land in
    // the row for 13 SEPTEMBER. Never filed; listed.
    outOfMonth: p.filter((x) => x.action === 'out-of-month'),
  };
}

let { unclear, todo, needsRead, unattributed, outOfMonth } = derive(plan);

if (unclear.length) {
  log(`  ${unclear.length} image(s) the filter could not classify - look at these:`);
  unclear.forEach((p) => log(`     ${p.ba}\\${p.file}`));
}

if (outOfMonth.length) {
  log(`  ${outOfMonth.length} image(s) dated OUTSIDE this month - NOT filed:`);
  outOfMonth.forEach((p) => log(`     ${p.ba}\\${p.file}   carries ${p.date}`));
  log('     the cell comes from the day alone, so these would land in the wrong row.');
}

if (unattributed.length) {
  log(`  ${unattributed.length} group image(s) with no identifiable sender - NOT filed:`);
  unattributed.forEach((p) => log(`     ${p.file}   (${p.note})`));
  log('     open the group in WhatsApp and check who posted these.');
}

/**
 * Ask the agent to read a date off an image.
 *
 * OCR is only a convenience; the authoritative reading is a pair of eyes. This
 * shells out to the Claude CLI, which can open the image and report what the
 * overlay says. It is a convenience too - if the call fails (no budget, no
 * network, CLI missing) we fall back to the human gate rather than guessing.
 *
 * Returns "YYYY-MM-DD" on success, or null for anything else. Never invents.
 */
function askAgent(imagePath) {
  // Three answers, not two. "I cannot read the date" and "there is no date on
  // this image at all" look identical if the only allowed replies are a date
  // and UNKNOWN - and they mean opposite things. The first is a report that
  // needs a human; the second is not a report. A deeper scan reaches ordinary
  // chat photos the visual filter cannot rule out (a holiday snap has just as
  // little white in its lower-left as a report does), so without this
  // distinction they pile up as unreadable and stop the run for nothing.
  const prompt =
    `Look at the image at ${imagePath}. A report photo carries a Timestamp ` +
    `Camera overlay: a block of text near an edge showing a date and time. ` +
    `Reply with exactly two lines and nothing else. ` +
    `Line 1: the date from that overlay as YYYY-MM-DD; or UNREADABLE if an ` +
    `overlay is there but you cannot make out the date; or NO-OVERLAY if the ` +
    `image carries no such timestamp overlay at all. ` +
    `Line 2: when line 1 is a date, the overlay text exactly as printed; ` +
    `otherwise leave line 2 empty.`;

  // On Windows `claude` is a .cmd shim. Node refuses to spawn a .cmd directly
  // (EINVAL) and cannot resolve it without the extension (ENOENT), so the call
  // has to go through a shell. The prompt contains no double quotes, so quoting
  // it with " is safe here.
  //
  // --model is named, never left to the ambient default: the model has to accept
  // images, and one that cannot does not error - it answers anyway.
  const quoted = prompt.replace(/"/g, '\\"');
  const r = spawnSync(`claude -p --model ${CONFIG.agentModel || 'deepseek-v4-flash'} "${quoted}"`, {
    encoding: 'utf8',
    timeout: 4 * 60 * 1000,
    shell: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  });

  if (r.error) return { kind: 'error', why: `could not run the agent: ${r.error.message}` };

  const raw = ((r.stdout || '') + (r.stderr || '')).trim();

  // `claude -p` exits 0 even when the API call fails - the error arrives on
  // stdout. Check for that explicitly, so an outage is reported as an outage
  // rather than looking like an unreadable image.
  if (/API Error|quota|rate.?limit|unauthor|invalid api key/i.test(raw)) {
    return { kind: 'error', why: `agent unavailable: ${raw.split('\n')[0].slice(0, 90)}` };
  }
  if (r.status !== 0) {
    return { kind: 'error', why: `agent call failed (exit ${r.status}): ${raw.split('\n')[0].slice(0, 90)}` };
  }

  // The verdict is on one line and what was seen on the next. Find the verdict
  // rather than assuming it is last, and keep the line under it as the evidence.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let vi = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/(\d{4})-(\d{2})-(\d{2})/.test(lines[i]) ||
        /NO[\s-]?OVERLAY/i.test(lines[i]) || /UNREADABLE/i.test(lines[i])) { vi = i; break; }
  }
  const answer = vi >= 0 ? lines[vi] : (lines[lines.length - 1] || '');
  const saw = vi >= 0 ? lines.slice(vi + 1).join(' ').slice(0, 200) : '';

  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(answer);
  if (m) {
    const [, y, mo, d] = m;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return { kind: 'date', date: `${y}-${mo}-${d}`, saw, why: 'read by the agent' };
    }
  }
  if (/NO[\s-]?OVERLAY/i.test(answer)) {
    return { kind: 'no-overlay', saw, why: 'no timestamp overlay on the image - not a report' };
  }
  if (/UNREADABLE/i.test(answer)) {
    return { kind: 'unreadable', saw, why: 'the agent could see an overlay but not the date' };
  }
  return { kind: 'error', saw, why: `agent replied "${answer.slice(0, 40)}" - not a usable answer` };
}

if (needsRead.length) {
  log('');
  log(`  ${needsRead.length} report(s) whose date OCR could not read.`);
  log('  Asking the agent to read them...');
  log('');

  const manualPath = path.join(MONTH, '_manual-dates.json');
  let manual = {};
  try { manual = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch { manual = {}; }

  let readCount = 0;
  const noOverlay = new Set();     // the agent says there is no timestamp at all

  for (const p of needsRead) {
    // `src` is where the file actually sits: the BA's folder for a DM, the
    // group folder for a group post. Using `ba` blindly missed every group one.
    const img = path.join(WA_DOWNLOAD, p.src || p.ba, p.file);
    process.stdout.write(`     ${p.file.slice(0, 46)} ... `);
    const res = askAgent(img);

    if (res.kind === 'date') {
      manual[`${p.ba}/${p.file}`] = {
        date: res.date,
        // The overlay text itself, not a claim that a date was seen. The
        // manual-dates file exists so a reading can be checked afterwards, and
        // a bare claim cannot be checked.
        saw: res.saw || '(the agent did not repeat the overlay text)',
        readBy: 'agent',
        readAt: new Date().toISOString().slice(0, 10),
        why: 'OCR could not read this image',
      };
      logRaw(`     ${p.file.slice(0, 46)} ... ${res.date}  (agent)`);
      console.log(`${res.date}  (agent)`);
      readCount++;
    } else if (res.kind === 'no-overlay') {
      noOverlay.add(`${p.ba}/${p.file}`);
      logRaw(`     ${p.file.slice(0, 46)} ... no overlay - not a report`);
      console.log('no overlay');
      log(`       ${res.why}`);
    } else {
      logRaw(`     ${p.file.slice(0, 46)} ... unreadable - ${res.why}`);
      console.log('unreadable');
      log(`       ${res.why}`);
    }
  }

  if (readCount || noOverlay.size) {
    if (readCount) {
      fs.writeFileSync(manualPath, JSON.stringify(manual, null, 2), 'utf8');
      log('');
      log(`  recorded ${readCount} date(s) in ${manualPath}`);
    }

    // Re-plan so the newly-read dates flow into the normal ADD/SKIP logic.
    log('  re-running the plan with those dates...');
    const r2 = step('plan (after agent)', py(), ['VERIFIER/wa_plan.py', '--out', planPath],
      { timeoutMs: 15 * 60 * 1000 });
    if (!r2.ok) abort('plan', `re-plan failed: ${r2.reason}`);
    plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    // The agent's NO-OVERLAY verdict is a REJECTION, not an unreadable date.
    // Folding it into the plan is what stops ordinary chat photos from holding
    // the gate shut - there is no date to go and read, because there is no
    // timestamp on them.
    let flipped = 0;
    for (const p of plan) {
      if (p.action === 'needs-read' && noOverlay.has(`${p.ba}/${p.file}`)) {
        p.action = 'reject';
        p.reason = 'the agent found no timestamp overlay on this image - not a report photo';
        flipped++;
      }
    }
    if (flipped) log(`  ${flipped} image(s) carry no timestamp at all - reclassified as not-a-report`);

    // Write those verdicts down. The visual filter cannot rule these images out
    // on its own, so without a record every later run pays for another agent
    // call to reach the same answer about the same photos.
    if (noOverlay.size) {
      const nrPath = path.join(MONTH, '_not-reports.json');
      let nr = { files: [] };
      try { nr = JSON.parse(fs.readFileSync(nrPath, 'utf8')); } catch { /* first time */ }
      const known = new Set(nr.files || []);
      const before = known.size;
      for (const k of noOverlay) known.add(k);
      fs.writeFileSync(nrPath, JSON.stringify({
        _note: 'Images the agent examined and found to carry no timestamp overlay at all - ' +
               'ordinary chat photos, not reports. Checked once, skipped from then on. ' +
               'Delete this file to have them looked at again.',
        files: [...known].sort(),
      }, null, 2), 'utf8');
      log(`  ${known.size - before} new one(s) remembered in ${nrPath} (${known.size} total)`);
    }

    // Re-derive EVERYTHING from the new plan - not just needsRead. `todo` in
    // particular: those are the photos the agent just made fileable, and holding
    // a stale copy is how the run reported "add: 3" and then filed none of them.
    ({ unclear, todo, needsRead, unattributed, outOfMonth } = derive(plan));
    const c2 = plan.reduce((a, p) => { a[p.action] = (a[p.action] || 0) + 1; return a; }, {});
    log(`  new plan: ${JSON.stringify(c2)}`);
  }
}

if (needsRead.length) {
  log('');
  log(`  ${needsRead.length} date(s) STILL unreadable. Nothing will be filed for them.`);
  log('  Read the overlay yourself, add an entry to');
  log(`     ${path.join(MONTH, '_manual-dates.json')}`);
  log('  then re-run. The images are here:');
  needsRead.forEach((p) => log(`     ${path.join(WA_DOWNLOAD, p.ba, p.file)}`));
  log('');
  log(`STOPPED at the review gate. ${todo.length} other photo(s) are ready to file.`);
  log(`   log: ${LOG_PATH}`);
  process.exit(2);          // 2 = needs a human, not a failure
}

log(`  nothing needs a human. ${todo.length} photo(s) to file.`);
if (unclear.length) log(`  (${unclear.length} unclear image(s) left alone, listed above)`);
if (unattributed.length) log(`  (${unattributed.length} unattributed group image(s) left alone, listed above)`);
if (outOfMonth.length) log(`  (${outOfMonth.length} out-of-month image(s) left alone, listed above)`);

if (DRY) {
  log('');
  log('DRY RUN - stopping before any write.');
  if (todo.length) {
    log('  would file:');
    todo.forEach((p) => log(`     ${p.ba}\\${p.file}  ->  ${p.target}`));
  }
  log(`   log: ${LOG_PATH}`);
  process.exit(0);
}

// --- 5. apply -------------------------------------------------------------
let insertedNothing = false;   // phase 6 found nothing new
let verifyFailed = false;      // phase 7 saw a cell that does not match
log('');
log('PHASE 5/7  file into folders + copy to NOTA');
if (todo.length === 0) {
  log('  nothing to file');
} else {
  const r = step('apply', py(), ['SHARED/wa_apply.py', '--plan', planPath], { timeoutMs: 5 * 60 * 1000 });
  if (!r.ok) {
    // Deliberately fatal: inserting now would build the sheet from folders that
    // are not yet correct, and nothing downstream would reveal it.
    abort('apply', `${r.reason} - the sheet is NOT being touched`);
  }
}

// --- 6. insert ------------------------------------------------------------
log('');
log('PHASE 6/7  insert into the spreadsheet');

const since = SINCE || new Date().toISOString().slice(0, 10);
log(`  --since ${since}`);

{
  const r = step('insert (dry)', 'node', ['INPUTTER/run-all.js', '--since', since, '--dry-run'],
    { timeoutMs: 5 * 60 * 1000 });
  if (!r.ok) abort('insert', `dry run failed: ${r.reason}`);
  const found = /photos found : (\d+)/.exec(r.output);
  if (found && Number(found[1]) === 0) {
    log('  nothing to insert - nothing new since that date.');
    insertedNothing = true;
  }
}

{
  const r = step('insert', 'node', ['INPUTTER/run-all.js', '--since', since], { timeoutMs: 45 * 60 * 1000 });
  if (!r.ok) abort('insert', r.reason);

  // run-all.js prints a SUMMARY block whose keys are only the statuses that
  // actually occurred - a run where everything was skipped has no "inserted:"
  // line at all. Probing for individual counters therefore reports "?" on a
  // perfectly healthy run. Reproduce the block instead of guessing at it.
  //
  // The block ENDS AT THE FIRST BLANK LINE. It used to be anchored on the
  // "full report: <path>" line that followed it, and when the batch-report file
  // was dropped that line went with it - which silently turned every insert
  // summary into "could not read".
  const start = r.output.indexOf('=== SUMMARY ===');
  if (start !== -1) {
    for (const line of r.output.slice(start + '=== SUMMARY ==='.length).split('\n')) {
      if (!line.trim()) break;
      log(`  ${line.trim()}`);
    }
  } else {
    log('  (could not read the insert summary - see the run-all.js output above)');
  }
}

// --- 7. verify ------------------------------------------------------------
// The ledger says "inserted". That is a statement about the picker DIALOG, not
// about the cell - until this phase existed, no run had ever looked at a cell.
// This copies each unverified cell into the merged preview block AM3:AM30,
// screenshots it, and has the agent compare it against the photo on disk.
//
// Deliberately NOT fatal. The insert has already happened; a mismatch is
// something to report and look at, not something to undo automatically.
{
  log('');
  log('PHASE 7/7  verify against the sheet');
  const r = step('verify', 'node', ['INPUTTER/verify_cells.js'], { timeoutMs: 60 * 60 * 1000 });
  if (!r.ok) {
    log('');
    log('!! verification did NOT pass - a cell does not show the photo it should.');
    log('   Nothing was changed. Read the list above and look at those cells.');
    verifyFailed = true;
  }
}

// --- captions: TRIGGERED, but not part of the chain -----------------------
// NOMINAL and OUTLET are not in the photo. Nominal is handwritten on the
// receipt and outlet is not written on it at all, so the caption the BA types
// is the only source for either.
//
// This is triggered here and then runs on its own. Nothing above waits on it,
// and a failure here does NOT fail the run: the photos are already filed and
// verified by this point, and no caption problem should touch that work.
{
  log('');
  log('CAPTIONS   nominal + outlet (triggered - not part of the chain)');
  const a = step('captions', 'node', ['VERIFIER/captions.js'], { timeoutMs: 30 * 60 * 1000 });
  if (!a.ok) {
    log(`  skipped: captions.js did not finish (${a.reason}) - the run is unaffected`);
  } else {
    const b = step('apply captions', 'node', ['INPUTTER/apply_captions.js'], { timeoutMs: 20 * 60 * 1000 });
    if (!b.ok) log(`  nominal/outlet not written (${b.reason}) - the run is unaffected`);
  }
}

log('');
log('============================================================');
if (verifyFailed) {
  log('FINISHED, but phase 7 found a cell that does NOT show its photo.');
  log('   Nothing was changed. Look at the list above before trusting the sheet.');
  log(`   log: ${LOG_PATH}`);
  process.exit(1);
}
log(insertedNothing
  ? 'DONE - all seven phases finished. Nothing new to insert.'
  : 'DONE - all seven phases finished, and the sheet was read back to confirm it.');
log(`   log: ${LOG_PATH}`);
