#!/usr/bin/env node
/**
 * apply_captions.js — put NOMINAL and OUTLET into the spreadsheet.
 *
 *   node apply_captions.js             write anything not already correct
 *   node apply_captions.js --dry-run   print what would change, write nothing
 *
 * READS:  ICE-CUBE-SEPT\captions.json   (written by captions.js)
 * WRITES: the nominal matrix  N3:X32
 *         the outlet  matrix  Z3:AJ32
 *
 * WHY IT IS SAFE TO RE-RUN
 * ------------------------
 * There is no ledger. Before each write the cell is READ BACK and compared, and
 * a cell that already holds the right value is left alone. Unlike an image, a
 * number or a name IS readable - the formula bar shows it - so the check costs
 * one selection and needs no state file to drift out of step with the sheet.
 *
 * It never touches the photo matrix (B..L). Nominal and outlet live in their own
 * blocks; the photos are not this script's business.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Browser, Session } from '../SHARED/cdp_browser.js';
import { MONTH, CONFIG } from '../SHARED/paths.js';

const CAPTIONS = path.join(MONTH, 'captions.json');
const DRY = process.argv.includes('--dry-run');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(CAPTIONS)) {
  console.log(`no ${CAPTIONS} - run captions.js first.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(CAPTIONS, 'utf8'));
const entries = data.entries || [];
if (!entries.length) { console.log('captions.json has no entries - nothing to do.'); process.exit(0); }

/** Row for a date: day - firstDay + firstRow. Derived, never typed. */
const rowFor = (iso) => Number(iso.slice(8, 10)) - CONFIG.dateRow.firstDay + CONFIG.dateRow.firstRow;

// ---------------------------------------------------------------------------

const browser = await Browser.connect(CONFIG.chromePort || 9333);
const cdp = await Session.open(browser, `spreadsheets/d/${CONFIG.spreadsheetId.slice(0, 12)}`);
console.log(`attached to "${String(cdp.info.title).slice(0, 50)}"`);
console.log(DRY ? 'DRY RUN - nothing will be written\n' : '');

/**
 * Select a cell by the Name Box.
 *
 * The value is set through the native setter and an `input` event, NOT by
 * typing. `Input.insertText` APPENDS to whatever the box already holds, so the
 * second selection became "O28AA27" - not a cell, so Enter silently did nothing
 * and every later write landed in the first cell again. Checking `nb.value`
 * could not catch it either: it reads back the text we just put there.
 *
 * The real check is the read-back of the cell, which the caller does.
 */
async function select(addr) {
  // Leave any in-progress cell edit FIRST.
  //
  // While the grid is editing, the Name Box does not take the selection: the
  // Enter goes to the editor, the active cell never moves, and every following
  // keystroke appends to the SAME cell. That is what turned O27 into
  // "15000Tipsy bro citraland1000023 Krembangan...". Escape ends the edit
  // without committing, then the selection lands where it was asked to.
  for (const t of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type: t, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  }
  await sleep(250);

  await cdp.eval(`(() => {
    const nb = document.getElementById('t-name-box');
    if (!nb) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nb.focus(); set.call(nb, ${JSON.stringify(addr)});
    nb.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await sleep(200);
  for (const t of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type: t, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }
  await sleep(900);
}

/** What the cell currently holds, from the formula bar. Text and numbers only -
 *  this route returns nothing for an image, which is why photos are verified by
 *  a screenshot instead (verify_cells.js). */
async function readCell() {
  return await cdp.eval(
    `(() => { const f=document.getElementById('t-formula-bar-input');
      return f ? String(f.innerText||f.value||'').replace(/\\s+$/,'') : null; })()`);
}

/**
 * The virtual key code for a character.
 *
 * Sheets' cell editor IGNORES a keydown that carries no VK. Typing with
 * `windowsVirtualKeyCode: 0` therefore produced no characters at all - the call
 * succeeded and nothing was written, which is the worst way for a write to fail.
 * A character with no sensible VK falls back to its own code.
 */
function vkFor(ch, code) {
  if (ch === ' ') return 32;
  if (/[0-9]/.test(ch)) return ch.charCodeAt(0);
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase().charCodeAt(0);
  return code || ch.charCodeAt(0);
}
const codeFor = (ch) => {
  if (ch === ' ') return 'Space';
  if (/[0-9]/.test(ch)) return 'Digit' + ch;
  if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
  if (ch === '.') return 'Period';
  if (ch === ',') return 'Comma';
  return '';
};

/**
 * Type into the selected cell, one character at a time.
 *
 * NOT Input.insertText. That produces an `input` event, which goes to a focused
 * input element - and the Sheets grid is a canvas with no such element, so it
 * never sees it. The grid listens for real key events, which is what this sends.
 */
async function writeCell(value) {
  for (const ch of String(value)) {
    const code = codeFor(ch);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', text: ch, unmodifiedText: ch, key: ch,
      ...(code ? { code } : {}),
      windowsVirtualKeyCode: vkFor(ch, 0), nativeVirtualKeyCode: vkFor(ch, 0),
    });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, ...(code ? { code } : {}) });
    await sleep(45);
  }
  await sleep(200);
  // A real Enter keydown carries text: '\r'. Without it the cell editor does
  // not commit, the edit stays open, and the next select()'s Escape CANCELS it -
  // so the value vanished before anything could read it back.
  for (const t of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: t, key: 'Enter', code: 'Enter',
      text: t === 'keyDown' ? '\r' : undefined,
      unmodifiedText: t === 'keyDown' ? '\r' : undefined,
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
  }
  await sleep(600);
}

// ---------------------------------------------------------------------------

let written = 0, already = 0, failed = 0;

for (const e of entries) {
  const row = rowFor(e.date);
  const targets = [
    { what: 'nominal', addr: `${e.cells.nominal}${row}`, want: String(e.nominal) },
    { what: 'outlet',  addr: `${e.cells.outlet}${row}`,  want: String(e.outlet) },
  ];

  console.log(`${e.ba}  ${e.date}`);
  for (const t of targets) {
    process.stdout.write(`   ${t.what.padEnd(8)} ${t.addr.padEnd(6)} = ${t.want.slice(0, 30).padEnd(30)} `);

    await select(t.addr);

    const now = await readCell();
    if (now === t.want) { console.log('already correct'); already++; continue; }

    if (DRY) { console.log(`would write  (now: ${now === null ? 'unreadable' : `"${now}"`})`); continue; }

    await writeCell(t.want);

    // Read it back. A write that "succeeded" is not the same as a cell that
    // holds the value, and this one is cheap to check.
    await select(t.addr);
    const after = await readCell();
    if (after === t.want) { console.log('written'); written++; }
    else { console.log(`FAILED - cell reads ${after === null ? 'unreadable' : `"${after}"`}`); failed++; }
  }
  console.log('');
}

console.log(`written ${written}, already correct ${already}, failed ${failed}`);
if (DRY) console.log('(dry run - nothing was changed)');

try { await cdp.detach(); } catch { /* gone */ }
try { browser.close(); } catch { /* gone */ }
process.exit(failed ? 1 : 0);
