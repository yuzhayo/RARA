#!/usr/bin/env node
/**
 * captions.js — pull NOMINAL and OUTLET out of report captions.
 *
 *   node captions.js            messages received since 2026-09-28
 *   node captions.js --all      ignore the date floor (for inspection only)
 *
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE
 * ---------------------------------------
 * Two things this project needs are NOT in the photo:
 *
 *   nominal  - handwritten on the receipt, so no reading of the image gets it
 *   outlet   - never written on the image at all
 *
 * They are only in the caption the BA types. So this reads captions, and the
 * photo pipeline stays exactly as it is. It is TRIGGERED by the pipeline and
 * never waited on: if this fails, the photos still get filed.
 *
 * WHAT IS TAKEN FROM WHERE
 * ------------------------
 *   date     <- the image's burned-in overlay, read by the agent. The caption
 *               date is NOT trusted: this BA's own captions contain "24/09/25"
 *               and "Tgl 23/09/25" for September 2026.
 *   name     <- the caption, confirmed against the sender's phone number. The
 *               phone is what decides if they disagree - same rule as the rest
 *               of the pipeline.
 *   nominal  <- the caption
 *   outlet   <- the caption
 *
 * A caption is only used if it carries ALL FOUR. Anything less is skipped, not
 * guessed at.
 *
 * STATE: ICE-CUBE-SEPT\captions.json. Delete it to rebuild from scratch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MONTH, WA_DOWNLOAD, CONFIG, ICE_ROOT } from '../SHARED/paths.js';

const OUT_PATH = path.join(MONTH, 'captions.json');

// Messages RECEIVED from this date. Reports before it are left alone entirely.
const FLOOR = '2026-09-28';
const ALL = process.argv.includes('--all');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

// ---------------------------------------------------------------------------
// the roster, derived - not hardcoded here
// ---------------------------------------------------------------------------

/**
 * Photo column -> BA folder. The order of `columns` in config.json IS the
 * roster order, and the sheet repeats that same order in the nominal block
 * (N..X) and the outlet block (Z..AJ). So both the folder and the two target
 * columns fall out of one list instead of three that could drift apart.
 */
const colLetter = (n) => {           // 0 -> A, 13 -> N, 25 -> Z, 26 -> AA
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const roster = Object.entries(CONFIG.columns)
  .sort((a, b) => colLetterIndex(a[1]) - colLetterIndex(b[1]))
  .map(([name, photoCol], i) => ({
    key: name,                        // "MALANG DEWI FALASIVA"
    photo: photoCol,
    nominal: colLetter(13 + i),       // N is index 13
    outlet: colLetter(25 + i),        // Z is index 25
  }));
function colLetterIndex(letters) {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Real BA folders, so a ledger-style short name ("SBY LAVITA") still resolves. */
const realFolders = fs.readdirSync(MONTH, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);
const IGNORE = new Set((CONFIG.ignoreFolders || []).map((f) => f.toUpperCase()));

/** Trailing number in a folder name -> the roster entry it belongs to. */
const byPhone = new Map();
for (const r of roster) {
  const folder = realFolders.find(
    (f) => !IGNORE.has(f.toUpperCase()) && f.toUpperCase().startsWith(r.key.toUpperCase()));
  if (!folder) continue;
  const m = /(\d[\d-]{5,})\s*$/.exec(folder);
  if (m) byPhone.set(m[1].replace(/\D/g, ''), { ...r, folder });
}

// ---------------------------------------------------------------------------
// caption -> four fields
// ---------------------------------------------------------------------------

const MONTHS = { januari:1, februari:2, maret:3, april:4, mei:5, juni:6, juli:7,
                 agustus:8, september:9, oktober:10, november:11, desember:12,
                 jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, agu:8, ags:8, aug:8,
                 sep:9, sept:9, okt:10, oct:10, nov:11, des:12, dec:12 };

/**
 * The roster keys carry a city prefix ("SBY SUMARI SAWI RATIH", "MALANG DEWI
 * FALASIVA") that no BA writes in a caption - they write "Sumari Sawi Ratih".
 * Matching on the full key therefore failed on every caption. Drop a leading
 * city token before comparing. KEDIRI is NOT in this list: there it is part of
 * the name, not a prefix.
 */
const CITY = ['SBY', 'SURABAYA', 'MALANG', 'MOJOKERTO', 'SIDOARJO'];
const nameWords = (key) => {
  const w = key.toUpperCase().split(/\s+/);
  return (CITY.includes(w[0]) ? w.slice(1) : w).filter((x) => x.length > 2);
};

/** A field is identified by its SHAPE, never by its position. */
function classify(v) {
  const t = v.trim().replace(/^(nama|name|tanggal|tgl|date|nominal|nom|outlet|toko|store)\s*[:\-]\s*/i, '').trim();
  if (!t) return null;

  // date - any of the three forms seen in this BA's captions
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(t);
  if (dmy) {
    const [, d, mo, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return { field: 'date', value: `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`, raw: t };
    }
  }
  const long = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (long && MONTHS[long[2].toLowerCase()]) {
    const mo = MONTHS[long[2].toLowerCase()];
    return { field: 'date', value: `${long[3]}-${String(mo).padStart(2,'0')}-${long[1].padStart(2,'0')}`, raw: t };
  }

  // nominal - digits, optionally with thousand separators
  const num = /^(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]00)?$/i.exec(t.replace(/\s/g, ''));
  if (num) {
    const n = Number(num[1].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n > 0) return { field: 'nominal', value: n, raw: t };
  }

  // name - fuzzy against the roster, ignoring the city prefix
  const up = t.toUpperCase();
  const hit = roster.find((r) => {
    const words = nameWords(r.key);
    return words.length && words.every((w) => up.includes(w));
  });
  if (hit) return { field: 'name', value: hit.key, raw: t };

  return { field: 'outlet', value: t, raw: t };   // whatever is left
}

/** Split a caption into parts without ever cutting through a date. */
function parts(caption) {
  const text = caption || '';

  // Labelled form, often all on ONE line:
  //   "Nama : X Tanggal : Y Nominal : Z Outlet : W"
  // Here the label IS the separator, so split at the labels rather than at
  // punctuation. Trying newlines first missed this entirely.
  const labelled = text
    .split(/(?=(?:^|\s)(?:nama|name|tanggal|tgl|date|nominal|nom|outlet|toko|store)\s*[:\-])/i)
    .map((s) => s.trim()).filter(Boolean);
  if (labelled.length >= 4) return labelled;

  const byNewline = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (byNewline.length >= 4) return byNewline;

  for (const sep of [/\s+[/|]\s+/, /\s+-\s+/, /\s*[/|]\s+(?=\d{4,})/]) {
    const p = text.split(sep).map((s) => s.trim()).filter(Boolean);
    if (p.length >= 4) return p;
  }
  return byNewline;
}

function parseCaption(caption) {
  const p = parts(caption || '');
  if (p.length < 4) return null;
  const out = {};
  for (const piece of p) {
    const c = classify(piece);
    if (c && !out[c.field]) out[c.field] = c.value;
  }
  if (!out.name || !out.date || out.nominal === undefined || !out.outlet) return null;
  return out;
}

// ---------------------------------------------------------------------------
// the agent: the only thing that may say what date a photo carries
// ---------------------------------------------------------------------------

function askAgentDate(imagePath) {
  const prompt =
    `Look at the image at ${imagePath}. Read the Timestamp Camera overlay and ` +
    `reply with ONLY the date it shows, as YYYY-MM-DD. If there is no overlay ` +
    `or you cannot read it, reply exactly UNKNOWN. Nothing else.`;
  const quoted = prompt.replace(/"/g, '\\"');
  const r = spawnSync(`claude -p --model ${CONFIG.agentModel || 'deepseek-v4-flash'} "${quoted}"`, {
    encoding: 'utf8', timeout: 4 * 60 * 1000, shell: true, maxBuffer: 16 * 1024 * 1024,
  });
  const raw = ((r.stdout || '') + (r.stderr || '')).trim();
  if (/API Error|quota|rate.?limit|unauthor|invalid api key/i.test(raw)) return { error: 'agent unavailable' };
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}` } : { error: 'no date read' };
}

// ---------------------------------------------------------------------------

const entries = [];
const skipped = [];

for (const [label, folder] of fs.readdirSync(WA_DOWNLOAD, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('GROUP'))
  .map((e) => [e.name, path.join(WA_DOWNLOAD, e.name)])) {

  const said = readJson(path.join(folder, '_whatsapp-said.json'), null);
  if (!said || !Array.isArray(said.items)) continue;

  // This chat's roster entry, by the sender number on its own messages.
  const phone = (said.items.map((i) => i.meta).find(Boolean) || '')
    .replace(/^.*\]\s*/, '').replace(/:.*$/, '').trim().replace(/\D/g, '');
  const who = byPhone.get(phone.startsWith('62') && phone.length > 10 ? phone.slice(2) : phone);
  if (!who) continue;

  for (const it of said.items) {
    // "17:17, 23/09/2026] +62 ...:" -> 2026-09-23
    const md = /,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(it.meta || '');
    if (!md) continue;
    const received = `${md[3]}-${md[2].padStart(2,'0')}-${md[1].padStart(2,'0')}`;
    if (!ALL && received < FLOOR) continue;

    const parsed = parseCaption(it.alt);
    if (!parsed) { skipped.push({ who: who.key, file: it.file, why: 'caption lacks all four fields' }); continue; }

    // The caption name is a claim; the sender number is the fact.
    const nameAgrees = parsed.name === who.key;

    entries.push({
      ba: who.key,
      received,                       // when the message arrived
      captionDate: parsed.date,       // a claim - the overlay decides
      nominal: parsed.nominal,
      outlet: parsed.outlet,
      captionName: parsed.name,
      nameAgrees,
      // Where the photo actually sits: the staging folder, not the month
      // folder. Stored relative to ICE-CUBE so the JSON stays readable.
      src: path.join('WA-DOWNLOAD', label, it.file),
      cells: { nominal: who.nominal, outlet: who.outlet },
    });
  }
}

// ---------------------------------------------------------------------------
// LAST ONE WINS. A re-send is a correction of the earlier one that was wrong -
// the operator said so explicitly - so for the same BA and the same date only
// the most recently RECEIVED caption survives.
// ---------------------------------------------------------------------------

const byBaDate = new Map();
for (const e of entries.sort((a, b) => a.received.localeCompare(b.received))) {
  byBaDate.set(`${e.ba}|${e.captionDate}`, e);     // later overwrite earlier
}
const final = [...byBaDate.values()];

// ---------------------------------------------------------------------------
// the date comes from the image. One agent call each, and only for the
// survivors - a caption that was superseded is not worth paying for.
// ---------------------------------------------------------------------------

console.log(`messages since ${FLOOR} with all four fields: ${entries.length}`);
console.log(`after last-one-wins dedupe: ${final.length}\n`);

for (const e of final) {
  const img = path.join(ICE_ROOT, e.src);
  process.stdout.write(`  ${e.ba.padEnd(22)} ${e.captionDate}  ${String(e.nominal).padStart(7)}  ${e.outlet.slice(0,22).padEnd(22)} -> `);
  const r = askAgentDate(img);
  if (r.date) {
    e.date = r.date;
    e.dateSource = 'overlay';
    e.dateAgrees = r.date === e.captionDate;
    console.log(`${r.date}${e.dateAgrees ? '' : `  (caption said ${e.captionDate})`}`);
  } else {
    e.date = e.captionDate;
    e.dateSource = `caption only - ${r.error}`;
    e.dateAgrees = null;
    console.log(`caption only (${r.error})`);
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify({
  _note: 'NOMINAL and OUTLET read from report captions - neither is in the photo. ' +
         'The DATE is read from the image by the agent, because caption dates in this ' +
         'BA\'s own messages carry the wrong year. For the same BA and date the LAST ' +
         'RECEIVED caption wins: a re-send is a correction.',
  since: FLOOR,
  entries: final,
  skipped,
}, null, 2), 'utf8');

console.log(`\nwritten: ${OUT_PATH}`);
if (skipped.length) console.log(`skipped: ${skipped.length} (captions without all four fields)`);
