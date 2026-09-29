#!/usr/bin/env node
/**
 * verify_cells.js — read the sheet back, by eye.
 *
 *   node verify_cells.js                 every inserted cell not yet verified
 *   node verify_cells.js --cells C27,B28 only these
 *   node verify_cells.js --all           re-verify everything in the ledger
 *   node verify_cells.js --limit 3       stop after N (for a trial run)
 *
 * WHY THIS EXISTS
 * ---------------
 * The ledger records `verified: "picker closed, no error toast"`. That is a
 * statement about the DIALOG, not about the cell - it says the picker dismissed
 * without an error, which is the flow's success signal. It is not a read-back.
 * Until this ran, nothing had ever looked at a cell.
 *
 * WHY IT WORKS THIS WAY
 * ---------------------
 * An in-cell image cannot be read by any normal route:
 *   - Sheets renders to a CANVAS, so the DOM has no cell contents.
 *   - the `gviz` CSV endpoint returns text and OMITS IMAGES - the exact thing
 *     that needs checking.
 *   - selecting such a cell leaves the formula bar empty; there is no text.
 *
 * So the image is moved somewhere it can be seen: copy the cell, paste it into
 * the merged preview block AM3:AM30, screenshot that, and compare the result
 * against the photo on disk.
 *
 * The merged cell must be SELECTED before pasting. Pasting into a cell that is
 * not selected goes nowhere and the preview keeps showing whatever was there
 * before - which is how a check can "pass" while verifying the wrong image.
 *
 * The comparison is visual, so the agent makes it, not a hash: the two images
 * are a photo file and a screenshot of a canvas, and no hash spans that.
 *
 * State: ICE-CUBE-SEPT\_verified.json - one entry per cell, holding what was
 * seen. Delete it to re-verify everything from scratch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Browser, Session } from '../SHARED/cdp_browser.js';
import { MONTH, CONFIG, TOOLS } from '../SHARED/paths.js';

const LEDGER_PATH = path.join(MONTH, '.ledger.json');
const VERIFIED_PATH = path.join(MONTH, '_verified.json');
const SHOT_DIR = path.join(MONTH, 'verify-shots');

const PREVIEW = 'AM3';          // the merged preview block: AM3:AM30
const argv = process.argv.slice(2);
const ONLY = argv.includes('--cells') ? argv[argv.indexOf('--cells') + 1].split(',').map((s) => s.trim().toUpperCase()) : null;
const ALL = argv.includes('--all');
const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

// ---------------------------------------------------------------------------

const ledger = readJson(LEDGER_PATH, {});
// The file is wrapped: {_note, cells:{...}}. Reading the wrapper AS the map made
// every lookup undefined, so nothing was ever recognised as already checked and
// each run re-verified all 37 cells - and then wrote the wrapper's own keys back
// in as if they were cells.
const verified = readJson(VERIFIED_PATH, {}).cells || {};

/** cell -> the ledger entry that put it there */
const byCell = new Map();
for (const [key, v] of Object.entries(ledger)) {
  const cell = key.split('!').pop();
  byCell.set(cell, v);
}

let todo = [...byCell.keys()].filter((c) => ALL || !verified[c]);
if (ONLY) todo = ONLY.filter((c) => byCell.has(c));
if (LIMIT) todo = todo.slice(0, LIMIT);

/**
 * Resolve a ledger folder name to a folder that actually exists.
 *
 * Older ledger entries stored the SHORT name ("SBY PRISCA YUNITA"); the folders
 * on disk carry the number ("SBY PRISCA YUNITA 822-4547-6939"). Joining the
 * ledger's name straight onto the month path therefore found nothing, and 22
 * of 37 cells were reported "missing on disk" when their photos were there all
 * along. Match on prefix against the real directories instead of trusting it.
 */
const realFolders = fs.readdirSync(MONTH, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);
const IGNORE = new Set((CONFIG.ignoreFolders || []).map((f) => f.toUpperCase()));
function resolveFolder(name) {
  if (realFolders.includes(name)) return name;
  const up = String(name || '').toUpperCase();
  const hit = realFolders
    .filter((f) => !IGNORE.has(f.toUpperCase()))
    .filter((f) => f.toUpperCase().startsWith(up))
    .sort((a, b) => a.length - b.length)[0];
  return hit || name;
}

/**
 * Resolve a ledger file name to one that exists.
 *
 * Same class of problem as the folder: files get renamed with the sender's
 * number appended ("25-09.jpeg" -> "25-09+62 878-9818-6141.jpeg"), and the
 * ledger keeps the name from insert time. `insert.js` reads that form happily -
 * `dayFromFilename` allows a number suffix - so the photo is there and correct,
 * and only a literal path join fails to find it.
 */
function resolveFile(folderPath, name) {
  if (fs.existsSync(path.join(folderPath, name))) return name;
  const ddmm = String(name).slice(0, 5);
  try {
    const hit = fs.readdirSync(folderPath)
      .filter((f) => f.startsWith(ddmm) && /\.(jpe?g|png)$/i.test(f))
      .sort((a, b) => a.length - b.length)[0];
    return hit || name;
  } catch { return name; }
}

console.log(`ledger cells : ${byCell.size}`);
console.log(`already seen : ${Object.keys(verified).length}`);
console.log(`to check now : ${todo.length}`);
if (!todo.length) { console.log('\nnothing to verify.'); process.exit(0); }

fs.mkdirSync(SHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------

const browser = await Browser.connect(CONFIG.chromePort || 9333);
const cdp = await Session.open(browser, `spreadsheets/d/${CONFIG.spreadsheetId.slice(0, 12)}`);
console.log(`attached to "${String(cdp.info.title).slice(0, 50)}"\n`);

/** Absolute selection via the Name Box - deterministic, unlike a coordinate click. */
async function select(addr) {
  await cdp.eval(`(() => { const nb=document.getElementById('t-name-box'); nb.focus(); nb.select(); return true; })()`);
  await sleep(150);
  await cdp.send('Input.insertText', { text: addr });
  await sleep(200);
  for (const t of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type: t, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }
  await sleep(900);
  const now = await cdp.eval(`document.getElementById('t-name-box').value`);
  return String(now).toUpperCase().startsWith(addr.toUpperCase());
}

/** A shortcut key with Ctrl held. */
async function ctrl(letter) {
  const vk = letter.toUpperCase().charCodeAt(0);
  const opts = { modifiers: 2, key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...opts });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...opts });
}

/** Ask the agent whether the screenshot shows the same photo as the file. */
function askAgent(expectedFile, shotPath) {
  const prompt =
    `Two images. First: ${expectedFile} - a delivery report photo. ` +
    `Second: ${shotPath} - a screenshot of a Google Sheets preview block. ` +
    `Answer with exactly one word: SAME if the screenshot shows that same photo ` +
    `(same scene and same burned-in timestamp), or DIFFERENT if it shows a ` +
    `different photo, an empty area, or anything else. Then a comma and one short ` +
    `phrase saying what you saw.`;
  const quoted = prompt.replace(/"/g, '\\"');
  // The model is named, not left to the ambient default: this comparison is
  // between two images, and a model that cannot see one still answers.
  const r = spawnSync(`claude -p --model ${CONFIG.agentModel || 'deepseek-v4-flash'} "${quoted}"`, {
    encoding: 'utf8', timeout: 4 * 60 * 1000, shell: true, maxBuffer: 16 * 1024 * 1024,
  });
  const raw = ((r.stdout || '') + (r.stderr || '')).trim();
  if (/API Error|quota|rate.?limit|unauthor|invalid api key/i.test(raw)) {
    return { verdict: 'error', why: `agent unavailable: ${raw.split('\n')[0].slice(0, 80)}` };
  }
  // Scan every line for a verdict that OPENS with the word. Taking only the
  // last line failed the moment the agent wrote a sentence of reasoning after
  // its answer: a good comparison got reported as an error, which reads as
  // "unverified" when it had in fact been verified.
  const lines = raw.split('\n').map((l) => l.trim().replace(/^[*_`\s]+/, '')).filter(Boolean);
  for (const line of lines) {
    if (/^SAME\b/i.test(line)) return { verdict: 'same', why: line.slice(0, 110) };
    if (/^DIFFERENT\b/i.test(line)) return { verdict: 'different', why: line.slice(0, 110) };
  }
  for (const line of lines) {
    if (/\bSAME\b/i.test(line) && !/\bNOT SAME\b/i.test(line)) return { verdict: 'same', why: line.slice(0, 110) };
    if (/\bDIFFERENT\b/i.test(line)) return { verdict: 'different', why: line.slice(0, 110) };
  }
  return { verdict: 'error', why: `agent gave no verdict: "${raw.split('\n').filter(Boolean).pop().slice(0, 70)}"` };
}

// ---------------------------------------------------------------------------

const results = [];
let same = 0, different = 0, errored = 0;

for (const [i, cell] of todo.entries()) {
  const entry = byCell.get(cell);
  const folder = resolveFolder(entry.folder);
  const folderPath = path.join(MONTH, folder);
  const file = resolveFile(folderPath, entry.file);
  const expected = path.join(folderPath, file);
  const n = `[${i + 1}/${todo.length}]`;
  process.stdout.write(`${n} ${cell.padEnd(5)} ${folder} / ${file} ... `);

  if (!fs.existsSync(expected)) {
    console.log('MISSING on disk - cannot compare');
    results.push({ cell, folder, file, verdict: 'missing' });
    continue;
  }

  const okSelect = await select(cell);
  if (!okSelect) { console.log(`could not select ${cell}`); results.push({ cell, verdict: 'error' }); continue; }
  await ctrl('c');
  await sleep(700);

  // The merged preview must be SELECTED before the paste, or the paste goes
  // nowhere and the block still shows the PREVIOUS image - which would read as
  // a confident pass on the wrong photo.
  const okPreview = await select(PREVIEW);
  if (!okPreview) { console.log('could not select the preview cell'); results.push({ cell, verdict: 'error' }); continue; }
  await sleep(500);
  await ctrl('v');
  await sleep(2600);

  const shot = path.join(SHOT_DIR, `${cell.replace(/[^A-Z0-9]/gi, '')}.png`);
  const img = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shot, Buffer.from(img.data, 'base64'));

  const res = askAgent(expected, shot);
  if (res.verdict === 'same') { same++; console.log(`SAME       ${res.why}`); }
  else if (res.verdict === 'different') { different++; console.log(`DIFFERENT  ${res.why}`); }
  else { errored++; console.log(`ERROR      ${res.why}`); }

  results.push({ cell, folder, file, verdict: res.verdict, why: res.why, shot: path.basename(shot) });

  if (res.verdict !== 'error') {
    verified[cell] = {
      folder, file, verdict: res.verdict, saw: res.why,
      checkedAt: new Date().toISOString().slice(0, 19),
      shot: path.basename(shot),
    };
    fs.writeFileSync(VERIFIED_PATH, JSON.stringify({
      _note: 'What each inserted cell was SEEN to contain, by pasting it into the ' +
             'merged preview block AM3:AM30 and screenshotting it. The ledger says ' +
             '"inserted"; this says "looked at". Delete this file to re-verify.',
      cells: verified,
    }, null, 2), 'utf8');
  }
}

// ---------------------------------------------------------------------------

console.log(`\n=== VERIFY SUMMARY ===`);
console.log(`  same      : ${same}`);
console.log(`  different : ${different}`);
console.log(`  error     : ${errored}`);
if (results.some((r) => r.verdict === 'different')) {
  console.log('\n  cells that do NOT match their photo - look at these:');
  for (const r of results.filter((x) => x.verdict === 'different')) {
    console.log(`    ${r.cell}  ${r.folder} / ${r.file}   (${r.why})`);
  }
}
console.log(`\nstate : ${VERIFIED_PATH}`);
console.log(`shots : ${SHOT_DIR}`);

try { await cdp.detach(); } catch { /* gone */ }
try { browser.close(); } catch { /* gone */ }
process.exit(different ? 1 : 0);
