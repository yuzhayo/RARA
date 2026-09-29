#!/usr/bin/env node
/**
 * insert.js — insert one ICE-CUBE photo into its correct Google Sheets cell.
 *
 *   node insert.js "<folder>" "<file>"            # insert, skip if already done
 *   node insert.js "<folder>" "<file>" --dry-run  # print the plan, touch nothing
 *   node insert.js "<folder>" "<file>" --force    # ignore the skip ledger
 *
 * WHY IT LOOKS LIKE THIS
 * ----------------------
 * The Insert ▸ Image ▸ Insert image in cell dialog is a Google Picker rendered in
 * an IFRAME (docs.google.com/picker/v2/home). Three consequences drive the code:
 *
 *   1. Main-document queries cannot see the dialog. We resolve the picker frame's
 *      execution context and evaluate inside it.
 *   2. Google's Material buttons ignore synthetic (untrusted) events. The Upload
 *      button must be clicked with a real Input.dispatchMouseEvent at absolute
 *      viewport coordinates (picker iframe offset + element offset).
 *   3. Focus emulation is scoped to a CDP session, and losing focus dismisses the
 *      dialog — so the ENTIRE flow must run inside one connection.
 *
 * The dialog closing is the SUCCESS signal, not a failure.
 *
 * Prerequisites: the automation Chrome must be running.
 *   start-automation-chrome.bat
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, Session } from '../SHARED/cdp_browser.js';
import { MONTH, CONFIG } from '../SHARED/paths.js';

// Per-month state lives WITH the month's data, not with the code, so next
// month starts from a clean ledger simply by pointing config at the new folder.
const LEDGER_PATH = path.join(MONTH, '.ledger.json');

/** The photo tree is the MONTH folder; one BA per subfolder inside it. */
export function photoRootDir() { return MONTH; }
const PHOTO_ROOT = MONTH;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// cell resolution — derived, never typed
// ---------------------------------------------------------------------------

/** "22-09.jpeg" -> 22. Also accepts renamed forms:
 *    "22-09+62 878-9818-6141.jpeg"   (with country code)
 *    "22-09 878-9818-6141.jpeg"      (number only)  */
export function dayFromFilename(file) {
  const m = /^(\d{1,2})-(\d{1,2})(?:[\s+]\d[\d\s-]*)?\.[a-z]+$/i.exec(file.trim());
  if (!m) throw new Error(`filename not in DD-MM[ number].ext form: ${file}`);
  return Number(m[1]);
}

/**
 * Folders may or may not carry the sender's number appended, in either style:
 *   "SBY LAVITA"                    (original)
 *   "SBY LAVITA +62 852-3619-2050"  (with country code)
 *   "SBY LAVITA 852-3619-2050"      (number only)
 * Strip the suffix so the config's column map works with any of them.
 */
export function normalizeFolderName(folder) {
  return folder.replace(/\s+\+?\d[\d\s-]*$/, '').trim();
}

/** folder + filename -> "H24" */
export function cellFor(folder, file, cfg = CONFIG) {
  const col = cfg.columns[normalizeFolderName(folder).toUpperCase()];
  if (!col) throw new Error(`no column mapped for folder: ${folder}`);
  const day = dayFromFilename(file);
  const row = day - cfg.dateRow.firstDay + cfg.dateRow.firstRow;
  return { cell: `${col}${row}`, col, row, day };
}

// ---------------------------------------------------------------------------
// ledger — skip work that's already correct
// ---------------------------------------------------------------------------

function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch { return {}; }
}
function ledgerKey(cell, cfg = CONFIG) { return `${cfg.spreadsheetId}!${cfg.tab}!${cell}`; }
function writeLedger(l) { fs.writeFileSync(LEDGER_PATH, JSON.stringify(l, null, 2)); }

// ---------------------------------------------------------------------------
// the flow
// ---------------------------------------------------------------------------

const OPEN_MENUS = `Array.from(document.querySelectorAll('.goog-menu')).filter(m=>getComputedStyle(m).display!=='none')`;

/** Select a cell via the Name Box and confirm the Name Box actually changed. */
async function selectCell(cdp, cell) {
  await cdp.eval(`(() => { const nb=document.getElementById('t-name-box'); nb.focus(); nb.select(); return true; })()`);
  await cdp.send('Input.insertText', { text: cell });
  await sleep(150);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(800);
  const now = await cdp.eval(`document.getElementById('t-name-box').value`);
  if (now !== cell) throw new Error(`cell selection failed: wanted ${cell}, Name Box reads ${now}`);
}

/** Insert ▸ Image ▸ Insert image in cell, and wait for the picker frame. */
async function openPicker(cdp) {
  // dismiss any stray dialog first
  for (let i = 0; i < 3; i++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(250);
  }

  if ((await cdp.eval(`${OPEN_MENUS}.length`)) === 0) {
    await cdp.eval(`(() => { const el=document.getElementById('docs-insert-menu');
      ['mousedown','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,button:0}))); return true; })()`);
    await sleep(900);
  }
  await cdp.eval(`(() => {
    const menus=${OPEN_MENUS}; const menu=menus[menus.length-1];
    const item=[...menu.querySelectorAll('.goog-menuitem')].find(i=>/(^image|^gambar)/i.test((i.innerText||'').trim()));
    if(!item) return false;
    const r=item.getBoundingClientRect();
    ['mouseover','mousemove'].forEach(t=>item.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,
      clientX:r.left+r.width/2, clientY:r.top+r.height/2})));
    return true; })()`);
  await sleep(1500);
  await cdp.eval(`(() => {
    for (const m of ${OPEN_MENUS}) {
      const item=[...m.querySelectorAll('.goog-menuitem')].find(i=>/(insert image in cell|sisipkan gambar dalam sel)/i.test((i.innerText||'').trim()));
      if(item){ ['mousedown','mouseup','click'].forEach(t=>item.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,button:0}))); return true; }
    } return false; })()`);

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const p = await cdp.pickerFrames();
    if (p.length) return p[p.length - 1];
  }
  throw new Error('Insert image picker never appeared');
}

/**
 * GENERIC Upload locator. Matches on visible text, not the obfuscated
 * nth-child/class chain — those rotate between Google releases, "Upload" doesn't.
 */
const FIND_UPLOAD = `(() => {
  const picks = [...document.querySelectorAll('button,[role=button],div,span')]
    .filter(e => (e.innerText||'').trim() === 'Upload' && e.getBoundingClientRect().width > 0);
  if (!picks.length) return null;
  const el = picks.find(e => e.tagName === 'BUTTON')
          ?? picks.sort((a,b) => a.children.length - b.children.length)[0];
  const r = el.getBoundingClientRect();
  return { tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
           x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
})()`;

/** Click Upload with a trusted event, then hand the local file to the input. */
async function uploadFile(cdp, picker, filePath) {
  // The picker iframe exists before its contents finish rendering, so poll for
  // the Upload control rather than assuming it is there immediately.
  let btn = null;
  for (let i = 0; i < 30; i++) {
    btn = await cdp.eval(FIND_UPLOAD, picker.ctxId);
    if (btn) break;
    await sleep(400);
  }
  if (!btn) throw new Error('Upload control not found in picker frame (30 tries)');

  const frame = await cdp.eval(`(() => {
    const fs=[...document.querySelectorAll('iframe')].filter(f=>(f.src||'').includes('/picker/'));
    if(!fs.length) return null;
    const r=fs[fs.length-1].getBoundingClientRect();
    return {x:r.left, y:r.top};
  })()`);
  if (!frame) throw new Error('picker iframe not found in main document');

  await cdp.click(Math.round(frame.x + btn.x), Math.round(frame.y + btn.y));

  // the input materialises on click; either Chrome reports a chooser, or we find it
  for (let i = 0; i < 50 && cdp.chooser === null; i++) await sleep(200);
  await sleep(400);

  if (cdp.chooser !== null) {
    await cdp.send('DOM.setFileInputFiles', { files: [filePath], backendNodeId: cdp.chooser });
    return { via: 'fileChooserOpened', clicked: btn };
  }

  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  let nodeId = 0;
  (function walk(n) {
    if (!nodeId && n.nodeName === 'INPUT') {
      const a = (n.attributes || []).map(String);
      if (a.includes('type') && a.includes('file')) nodeId = n.nodeId;
    }
    (n.children || []).forEach(walk);
    (n.contentDocument ? [n.contentDocument] : []).forEach(walk);
  })(doc.root);
  if (!nodeId) throw new Error('no file chooser and no file input found');
  await cdp.send('DOM.setFileInputFiles', { files: [filePath], nodeId });
  return { via: 'domFallback', nodeId, clicked: btn };
}

/** Any visible Sheets error toast (the "must log in" class of failure). */
const TOAST = `(() => {
  const el=[...document.querySelectorAll('div,span')]
    .find(e=>/tidak disisipkan|must log in|harus login|gagal|not inserted|couldn.t|error/i.test(e.innerText||'')
           && e.getBoundingClientRect().width>0 && (e.innerText||'').length<220);
  return el ? el.innerText.trim().slice(0,200) : null; })()`;

/**
 * Insert one image end to end. Returns a result object; throws only on hard errors.
 */
/**
 * Insert one image. Pass an existing `session` to reuse a connection across a
 * whole batch — the Google Picker dismisses when a CDP session drops, so the
 * flow needs one stable session rather than a connection per image.
 *
 * If no session is given, one is opened and closed here (single-shot use).
 */
export async function insertOne({ folder, file, force = false, dryRun = false, cfg = CONFIG, session = null }) {
  const { cell, row, day } = cellFor(folder, file, cfg);
  const filePath = path.join(MONTH, folder, file);
  const key = ledgerKey(cell, cfg);
  const ledger = readLedger();

  const plan = { folder, file, cell, row, day, filePath };

  if (!fs.existsSync(filePath)) throw new Error(`photo not on disk: ${filePath}`);
  if (!force && ledger[key]) return { ...plan, status: 'skipped', reason: 'ledger says already inserted', at: ledger[key].at };
  if (dryRun) return { ...plan, status: 'dry-run' };

  const ownSession = !session;
  const cdp = session || await Session.open(
    await Browser.connect(cfg.chromePort || 9333),
    `spreadsheets/d/${cfg.spreadsheetId.slice(0, 12)}`
  );
  try {
    cdp.reset();
    await sleep(400);

    await selectCell(cdp, cell);
    const picker = await openPicker(cdp);
    const up = await uploadFile(cdp, picker, filePath);

    // wait for upload + placement; the dialog closing is the success signal
    let closedAfter = null;
    for (let i = 0; i < 90; i++) {
      await sleep(500);
      const n = (await cdp.pickerFrames()).length;
      if (n === 0) { closedAfter = (i + 1) * 0.5; break; }
    }
    await sleep(1500);

    const toast = await cdp.eval(TOAST);
    const cellNow = await cdp.eval(`document.getElementById('t-name-box').value`);

    const ok = closedAfter !== null && !toast && cellNow === cell;

    if (ok) {
      ledger[key] = { folder, file, cell, at: new Date().toISOString(), verified: 'picker closed, no error toast' };
      writeLedger(ledger);
    }

    return {
      ...plan,
      status: ok ? 'inserted' : 'failed',
      pickerClosedAfterSeconds: closedAfter,
      toast,
      cellNow,
      uploadVia: up.via,
      uploadTarget: up.clicked
    };
  } finally {
    // only tear down what we opened; a shared batch session stays alive
    if (ownSession) {
      try { await cdp.detach(); } catch { /* already gone */ }
      try { cdp.browser.close(); } catch { /* already gone */ }
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const [folder, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
  if (!folder || !file) {
    console.error('usage: node insert.js "<folder>" "<file>" [--dry-run] [--force]');
    process.exit(2);
  }
  try {
    const res = await insertOne({
      folder, file,
      dryRun: flags.includes('--dry-run'),
      force: flags.includes('--force')
    });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.status === 'failed' ? 1 : 0);
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', error: String(e).slice(0, 300) }, null, 2));
    process.exit(1);
  }
}
