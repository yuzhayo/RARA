// wa_fetch.js — open ONE WhatsApp chat and download its image messages.
//
//   node wa_fetch.js "<chat query>" "<outdir>" [port] [--list-only]
//
// Self-contained on purpose. Opening the chat and downloading it must happen in
// ONE process: when they were separate, the conversation silently reverted
// between runs and one BA's photos got written into another BA's folder.
//
// The chat is verified before any download. A group header lists its members,
// so `includes(number)` is not a valid check - the header must START with the
// expected chat.

import fs from 'node:fs';
import path from 'node:path';
import { scanWindow, markChecked, logScan, fromWhatsAppDate } from './scan-state.js';

const argv = process.argv.slice(2);
const LIST_ONLY = argv.includes('--list-only');
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--label');

const CHAT = pos[0];
// The state file and the scan log are keyed by LABEL (the human name), not by
// the search query, so "LAVITA" is what you see rather than a phone number.
const labelIdx = argv.indexOf('--label');
const LABEL = labelIdx !== -1 ? argv[labelIdx + 1] : CHAT;
const OUT = pos[1];
const port = pos[2] || '9223';
if (!CHAT || (!OUT && !LIST_ONLY)) {
  console.error('usage: node wa_fetch.js "<chat>" "<outdir>" [port] [--list-only]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && (t.url || '').includes('web.whatsapp'));
if (!page) { console.log('no whatsapp page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, {once:true}); ws.addEventListener('error', rej, {once:true}); });

let id = 1; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
const send = (method, params = {}, timeout = 60000) => { const i = id++;
  return new Promise((resolve, reject) => { pending.set(i, {resolve, reject});
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, timeout); }); };
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + ((r.result && r.result.description) || ''));
  return r.result && r.result.value; };
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); await sleep(110);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(90);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };

await send('Page.bringToFront').catch(() => {});
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await sleep(500);

const SEARCH = `document.querySelector('input[data-tab="3"]')`;
const setSearch = (v) => ev(`(() => {
  const el = ${SEARCH}; if (!el) return false;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, ${JSON.stringify(v)});
  el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

const headerNow = () => ev(`((document.querySelector('#main header')||{}).innerText || '').replace(/\\n/g,' | ').trim()`);

/**
 * Is the WhatsApp renderer actually alive?
 *
 * The app keeps a background process after its window closes, and its WebView2
 * keeps "rendering" offscreen: the debug port answers and the DOM still looks
 * alive, but the chat list is stale - rows come back with no text, the header is
 * empty, and every open fails. A window handle is not proof of a working window:
 * a MINIMISED window reports one too, and its renderer is just as stalled.
 *
 * So ask the DOM. A healthy chat list has text in its rows.
 */
async function domAlive() {
  try {
    const probe = await ev(`(() => {
      const pane = document.querySelector('#pane-side'); if (!pane) return null;
      const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
      const named = rows.filter(r => ((r.innerText||'').trim().length > 0)).length;
      return { rows: rows.length, named };
    })()`);
    return !!probe && probe.rows > 0 && probe.named >= Math.min(probe.rows, 5);
  } catch { return false; }
}

// ---- open the chat, with retries, and VERIFY ----------------------------
if (!(await domAlive())) {
  await send('Page.bringToFront').catch(() => {});
  await sleep(2500);
}
if (!(await domAlive())) {
  console.log('  !! the WhatsApp window is stale - its chat list renders empty rows.');
  console.log('     The debug port answers, but the renderer is frozen: this is the');
  console.log('     closed-or-minimised state. Restore or reopen WhatsApp, then re-run.');
  console.log('     Refusing to scan: retrying here would just fail five times and');
  console.log('     look like something else.');
  ws.close();
  process.exit(1);
}

let opened = false, hdr = '', lastRow = null;
for (let attempt = 1; attempt <= 5 && !opened; attempt++) {
  await setSearch(CHAT);
  await sleep(2400);

  const row = await ev(`(() => {
    const pane = document.querySelector('#pane-side'); if (!pane) return null;
    const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
    const hit = rows.find(r => (r.innerText||'').includes(${JSON.stringify(CHAT)}));
    if (!hit) return null;
    const b = hit.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    return {
      x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2),
      inPane: b.top >= p.top - 4 && b.bottom <= p.bottom + 4,
      rowTop: Math.round(b.top), paneBottom: Math.round(p.bottom),
      text: (hit.innerText||'').replace(/\\n/g,' / ').slice(0, 58)
    };
  })()`);

  if (row) {
    lastRow = row;

    // A row matched by its text can still be scrolled out of the visible pane,
    // and clicking those coordinates hits something else entirely. Put it in
    // view before trusting its position.
    if (!row.inPane) {
      await ev(`(() => {
        const pane = document.querySelector('#pane-side'); if (!pane) return false;
        const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
        const hit = rows.find(r => (r.innerText||'').includes(${JSON.stringify(CHAT)}));
        if (!hit) return false;
        hit.scrollIntoView({ block: 'center' });
        return true; })()`);
      await sleep(700);
    }

    await click(row.x, row.y);
    await sleep(3000);

    hdr = await headerNow();
    // Header shapes differ:
    //   DM    : "I | +62 895-2460-4509 | click here for contact info"
    //   Group : "Jatim tok | Mama, +62 823-..., ..."
    // A group header lists its members, so `includes(number)` would pass while
    // sitting in a group. Requiring the match in the FIRST TWO segments accepts
    // both a DM and a group named by the query, and rejects a member list.
    opened = hdr.split('|').slice(0, 2).map(s => s.trim()).includes(CHAT);

    // Clear the search only once the chat is confirmed open. Clearing it
    // re-renders the sidebar, which is the last thing to do while a chat switch
    // is still settling - and on failure it destroys the one signal that says
    // whether a row was ever matched.
    if (opened) { await setSearch(''); await sleep(500); }
  } else {
    // Nothing matched, so the box still holds the query. Clear it so the next
    // attempt starts from a known state rather than re-filtering a filtered list.
    await setSearch('');
    await sleep(900);
  }
  if (!opened) {
    // Say WHAT was on screen, not just that it failed - "header empty" alone
    // does not distinguish "search found nothing" from "page is mid-reload".
    const diag = await ev(`(() => {
      const pane = document.querySelector('#pane-side');
      const rows = pane ? Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]')) : [];
      const main = document.querySelector('#main');
      return {
        paneRows: rows.length,
        firstRows: rows.slice(0,4).map(r => (r.innerText||'').split('\\n').slice(0,2).join(' / ').slice(0,46)),
        hasMain: !!main,
        hasHeader: !!(main && main.querySelector('header')),
        searchVal: (document.querySelector('input[data-tab="3"]')||{}).value
      };
    })()`);
    console.log(`  attempt ${attempt}: header="${hdr.slice(0,30)}"` +
                ` paneRows=${diag.paneRows} hasHeader=${diag.hasHeader} search="${diag.searchVal}"`);
    if (diag.firstRows.length) console.log(`      rows: ${JSON.stringify(diag.firstRows)}`);
    // The single most useful line on a failure: WHICH row was clicked, and
    // whether it was actually visible. Without it, "the header didn't change"
    // cannot be told apart from "the click went somewhere else entirely".
    console.log(lastRow
      ? `      matched: "${lastRow.text}"  at (${lastRow.x},${lastRow.y})  inPane=${lastRow.inPane}`
      : '      matched: nothing - no row contained the query');
  }
}

if (!opened) {
  console.log(`!! could not open "${CHAT}" after 5 attempts (header: "${hdr.slice(0,45)}")`);
  ws.close(); process.exit(1);
}
console.log(`  open: ${hdr.slice(0, 55)}`);

// let the conversation settle before reading it
await sleep(1500);

// ---- scan window ---------------------------------------------------------
// Start AT the day the last scan covered, not after it. A report for the 25th
// can be sent late on the 25th, after that day's check already ran - skipping
// straight to the 26th would never look at it, and nothing would say so.
// Repeating the last day costs nothing: anything already filed hashes the same
// and comes back SKIP.
const TODAY = new Date().toISOString().slice(0, 10);
const win = scanWindow(LABEL, TODAY);
console.log(win.firstEver
  ? '  window: first check for this chat - scanning everything on screen'
  : `  window: ${win.from} .. ${win.to}   (${win.from} repeated by design)`);

// ---- scan the history BACKWARDS, by date ---------------------------------
// Reading whatever happens to be on screen is not a scan. WhatsApp renders a
// window of the conversation and unmounts the rest - the group view held 13
// bubbles in a 1283px scroll area, so most of a day was simply not there to
// be found. Anything missed that way is invisible: the chat still looks
// checked, and the marker advances.
//
// So walk UP from the newest message until the messages on screen are older
// than the window start - trace back to the start of the day. Each image is
// downloaded the moment its bubble is mounted, because the list is
// virtualised: a bubble collected here and fetched later may already be gone.

/** Every loaded image bubble, with the WhatsApp metadata that sits above it. */
async function visibleItems() {
  return await ev(`(() => {
    const main = document.querySelector('#main'); if (!main) return [];
    const imgs = Array.from(main.querySelectorAll('img')).filter(i => {
      const r = i.getBoundingClientRect();
      return r.width > 60 && r.height > 60 && !/^sticker/i.test(i.alt || '');
    });
    const out = [];
    for (const i of imgs) {
      let node = i, meta = '';
      // Climb to #main, NOT a fixed 8 levels. A group bubble nests deeper than
      // a DM one: in a group the sender line adds a wrapper, so an 8-hop walk
      // runs out before it reaches the attribute. That is why every group
      // image was recorded with an empty sender while DMs were fine.
      while (node && node !== main) {
        const t = node.getAttribute && node.getAttribute('data-pre-plain-text');
        if (t) { meta = t.replace(/^\\[|\\]:\\s*$/g, '').trim(); break; }
        node = node.parentElement;
      }
      const alt = (i.alt || '').replace(/\\s+/g, ' ').trim();
      out.push({ alt, meta, isFull: (i.src || '').startsWith('blob:') });
    }
    return out;
  })()`);
}

/** The oldest message date currently rendered, as YYYY-MM-DD, or null. */
async function oldestVisibleDate() {
  return await ev(`(() => {
    const main = document.querySelector('[data-testid="conversation-panel-messages"]') || document.querySelector('#main');
    if (!main) return null;
    let oldest = null;
    for (const b of main.querySelectorAll('[data-pre-plain-text]')) {
      const t = b.getAttribute('data-pre-plain-text') || '';
      const m = /,\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})/.exec(t);
      if (!m) continue;
      const [d, mo, y] = m[1].split('/').map(Number);
      const iso = y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      if (!oldest || iso < oldest) oldest = iso;
    }
    return oldest;
  })()`);
}

/** The message SEND date, from WhatsApp's own metadata - never the caption. */
function metaDate(meta) {
  const m = /,\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(meta || '');
  return m ? fromWhatsAppDate(m[1]) : null;
}

/** Download one already-located bubble by its alt text. */
async function downloadItem(it, seq) {
  const got = await ev(`(async () => {
    const main = document.querySelector('[data-testid="conversation-panel-messages"]') || document.querySelector('#main');
    const imgs = Array.from(main.querySelectorAll('img')).filter(i => {
      const r = i.getBoundingClientRect();
      return r.width > 60 && r.height > 60 && !/^sticker/i.test(i.alt || '');
    });
    const want = ${JSON.stringify(it.alt)};
    const cands = imgs.filter(i => ((i.alt||'').replace(/\\s+/g,' ').trim()) === want);
    const img = cands.find(i => (i.src||'').startsWith('blob:')) || cands[0];
    if (!img) return { error: 'not in DOM' };
    if (!(img.src||'').startsWith('blob:')) return { error: 'only thumbnail loaded' };
    try {
      const r = await fetch(img.src);
      const b = await r.blob();
      const bytes = new Uint8Array(await b.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { type: b.type, size: b.size, b64: btoa(bin) };
    } catch (e) { return { error: String(e).slice(0,100) }; }
  })()`);

  if (got.error) { console.log(`    [${seq}] SKIP  ${got.error}   ${it.alt.slice(0,34)}`); return { ...it, error: got.error }; }

  const ext = (got.type || '').includes('png') ? 'png' : 'jpg';
  const safe = it.alt.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 70) || ('image_' + seq);
  const file = path.join(OUT, `${String(seq).padStart(2, '0')}_${safe}.${ext}`);
  fs.writeFileSync(file, Buffer.from(got.b64, 'base64'));
  console.log(`    [${seq}] OK  ${(got.size/1024).toFixed(0).padStart(4)} KB  ${it.alt.slice(0,34)}`);
  return { ...it, file: path.basename(file), bytes: got.size, type: got.type };
}

const seenKeys = new Set();
const walked = [];          // images inside the window, whatever happened to them
const results = [];
let n = 0;
let older = 0;
let stalls = 0;
const MAX_ROUNDS = 150;     // backstop, not a target: ~135 000px of history

// Did the walk actually cover the whole window? Two ways to finish honestly:
// reaching a message older than the window, or running out of history to
// scroll. Hitting the round cap while still scrolling is NEITHER - the walk ran
// out of budget partway. That case must not advance the marker, or the rest of
// the window is skipped and nothing ever says so.
let covered = false;

if (LIST_ONLY) {
  for (const it of await visibleItems()) {
    console.log(`    ${it.isFull ? 'FULL' : 'thumb'}  ${it.meta.slice(0,28).padEnd(28)} ${it.alt.slice(0,42)}`);
  }
  ws.close(); process.exit(0);
}

console.log(win.firstEver
  ? '  walking the whole conversation (first check for this chat)'
  : `  walking back to ${win.from} ...`);

// Start from the NEWEST message. The list keeps whatever scroll position it
// was last left at, so a chat can open already scrolled to the top - and then
// every round "finds" only the oldest messages, none of which are in the
// window, and the walk ends reporting zero.
const toBottom = async () => await ev(`(() => {
  const m = document.querySelector('[data-testid="conversation-panel-messages"]') || document.querySelector('#main');
  if (!m) return false;
  m.scrollTop = m.scrollHeight;
  return true; })()`);
await toBottom();
await sleep(1800);
await toBottom();      // the first jump can trigger a lazy load that adds height
await sleep(1800);

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const vis = await visibleItems();
  let fresh = 0;

  for (const it of vis) {
    const key = it.alt + '|' + it.meta;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    // Keep only messages sent on/after the window start. The date is the SEND
    // date from WhatsApp's metadata - the question is which messages have not
    // been looked at yet.
    const iso = metaDate(it.meta);
    if (!win.firstEver && iso && iso < win.from) { older++; continue; }

    fresh++;
    walked.push(it);
    n++;
    results.push(await downloadItem(it, n));
  }

  const oldest = await oldestVisibleDate();
  // Stop only once messages from BEFORE the window are on screen - that is the
  // proof the whole window has been walked. Stopping at `oldest === win.from`
  // would quit on the first round, because the newest message is usually dated
  // today and the window starts today.
  if (!win.firstEver && oldest && oldest < win.from) { covered = true; break; }

  // Scroll the MESSAGE LIST. #main itself does not scroll - its own scrollTop
  // stays pinned at 0 - so scrolling #main moves nothing, every round looks
  // empty, and the walk quits immediately believing the chat is exhausted.
  const moved = await ev(`(() => {
    const m = document.querySelector('[data-testid="conversation-panel-messages"]') || document.querySelector('#main');
    if (!m) return false;
    const was = m.scrollTop;
    m.scrollTop = Math.max(0, m.scrollTop - 900);
    return m.scrollTop !== was; })()`);

  // A round with no new images is only a reason to stop once the list can no
  // longer move. Counting every empty round as a stall ended the walk after
  // three of them - about 2700px, less than one screenful - which is exactly
  // how a day's photos go unfound while the run still reports success.
  if (!moved) {
    if (fresh === 0 && ++stalls >= 3) { covered = true; break; }   // top of the history
    await sleep(1200);
  } else {
    stalls = 0;
    await sleep(900);
  }
}

const items = walked;
console.log(`  images: ${items.length}` + (older ? `   (${older} older than the window, not downloaded)` : ''));

// MERGE with what is already recorded rather than overwriting. The folder
// accumulates across runs, and this file is the only record of WHO sent each
// group image - overwriting it strips the sender from every file downloaded
// before this run, leaving them permanently unattributable.
const saidPath = path.join(OUT, '_whatsapp-said.json');
let prevItems = [];
try { prevItems = JSON.parse(fs.readFileSync(saidPath, 'utf8')).items || []; } catch { /* first run */ }
const byFile = new Map();
for (const it of prevItems) if (it.file) byFile.set(it.file, it);
for (const it of results) if (it.file) byFile.set(it.file, it);   // this run wins
fs.writeFileSync(saidPath,
  JSON.stringify({ chat: hdr, chatQuery: CHAT, window: win, items: [...byFile.values()] }, null, 2));

// Advance this chat's marker ONLY now, at the very end, after everything was
// read and written. If anything above threw, we exit before here and the
// marker stays put - so the next run re-covers the same days rather than
// silently skipping a chat that failed halfway.
//
// The same rule covers a walk that ran out of rounds: it did not finish, so it
// must not mark the chat as checked. Leaving the marker put costs one repeated
// scan next run; advancing it loses whatever sat beyond the cap, for good.
if (!covered) {
  console.log(`  !! walk hit the ${MAX_ROUNDS}-round cap before covering ${win.to}.`);
  console.log('     NOT marked as checked - the next run re-covers this chat.');
  logScan(LABEL, win, { seen: items.length, downloaded: results.length, older });
  ws.close();
  process.exit(0);
}

const prev = markChecked(LABEL, TODAY, { messagesSeen: items.length, downloaded: results.length });
logScan(LABEL, win, { seen: items.length, downloaded: results.length, older });
console.log(`  marked checked through ${TODAY}` + (prev ? `   (was ${prev})` : '   (first check)'));

ws.close();
process.exit(0);
