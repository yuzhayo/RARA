// scan-state.js — remember how far each chat has been checked.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Reports do not arrive on a schedule. A BA may send a report for the 25th
// LATE ON THE 25th, after that day's check already ran. If the next check
// started from the 26th, that message would never be looked at again - and
// nothing would say so.
//
// THE RULE
// --------
// The next scan starts AT the day the last scan covered, not after it:
//
//     checked on the 25th   ->  covered through 2026-09-25
//     next check on the 27th ->  scan 25, 26, 27      (25 is repeated)
//
// Repeating the last day costs nothing: anything already filed hashes to the
// same file and comes back SKIP. What it buys is that nothing slips through.
//
// PER CHAT, NOT GLOBAL: one chat can fail to open while others succeed. A
// global marker would drag every chat forward on one failure and lose whatever
// was in the one that broke.
//
// The date compared here is the message SEND date (from data-pre-plain-text),
// because the question is "which messages have I not looked at yet". The
// burned-in overlay date is a different thing - it names the file, it does not
// decide what gets scanned.

import fs from 'node:fs';
import path from 'node:path';
import { MONTH } from '../SHARED/paths.js';

export const STATE_PATH = path.join(MONTH, '_scan-state.json');

export function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}

export function writeState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), 'utf8');
}

/** "2026-09-25" -> "25/09/2026" (the format WhatsApp prints) */
export function toWhatsAppDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "25/09/2026" -> "2026-09-25" */
export function fromWhatsAppDate(dmy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((dmy || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Which message dates this scan should look at, given what was covered before.
 * Returns { from, to } as ISO dates. `from` is INCLUSIVE and repeats the last
 * covered day.
 */
export function scanWindow(label, todayIso) {
  const st = readState();
  const prev = st[label] && st[label].checkedThrough;
  return { from: prev || null, to: todayIso, firstEver: !prev };
}

/** Advance a chat's marker. Call ONLY after that chat scanned successfully. */
export function markChecked(label, todayIso, detail = {}) {
  const st = readState();
  const before = (st[label] && st[label].checkedThrough) || null;
  st[label] = {
    checkedThrough: todayIso,
    previous: before,
    lastRunAt: new Date().toISOString().slice(0, 19),
    ...detail,
  };
  writeState(st);
  return before;
}

/**
 * Append one line per chat per run to logs\scan-history.log, so the question
 * "when was this chat last checked, and through which date?" has an answer
 * without digging through a full pipeline log.
 */
export function logScan(label, win, summary) {
  const dir = path.join(MONTH, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const line = [
    new Date().toISOString().slice(0, 19),
    label.padEnd(24).slice(0, 24),
    (win.firstEver ? 'first check -> ' + win.to : `${win.from} .. ${win.to}`).padEnd(26),
    String(summary.seen).padStart(3) + ' seen',
    String(summary.downloaded).padStart(3) + ' new',
    summary.older ? `${summary.older} older skipped` : '',
  ].join('  ');
  fs.appendFileSync(path.join(dir, 'scan-history.log'), line + '\n', 'utf8');
}
