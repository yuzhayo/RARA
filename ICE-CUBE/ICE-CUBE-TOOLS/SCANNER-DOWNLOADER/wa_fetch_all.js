// wa_fetch_all.js — fetch image messages from every BA chat + the group.
//
//   node wa_fetch_all.js [--group-only] [--dm-only] [--list-only]
//
// Delegates each chat to wa_fetch.js, which opens AND downloads in one process
// and refuses if the conversation isn't the one it asked for.
//
// Writes to  <ICE-CUBE>\WA-DOWNLOAD\<LABEL>\
// Read-only on WhatsApp's side. Nothing is renamed, filed, or inserted.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WA_DOWNLOAD } from '../SHARED/paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Taken from paths.js, NOT `HERE/..`. This file lives in a subfolder now, so
// climbing one level lands in ICE-CUBE-TOOLS - staging would have been created
// beside the code instead of at the workspace root, and every fetch would have
// written somewhere nothing else looks.
const OUT_ROOT = WA_DOWNLOAD;
const PORT = '9223';

/**
 * WhatsApp must have a VISIBLE WINDOW, not just the background task.
 *
 * WhatsApp Desktop keeps a background process alive after the window closes
 * (`-RegisterForBGTaskServer ... -Embedding`). Its WebView2 keeps rendering
 * offscreen, so the CDP port still answers and the DOM still looks alive -
 * but the chat list is stale and truncated, and every DM open fails with an
 * empty header. That cost a whole failed run before it was spotted.
 */
function whatsappWindowState() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*WhatsApp*' } | ` +
      `Select-Object -First 1 -Property Id,@{n='HasWindow';e={$_.MainWindowHandle -ne 0}} | ConvertTo-Json -Compress`
    ], { encoding: 'utf8', timeout: 20000 });
    const j = JSON.parse(out.trim() || '{}');
    return { running: !!j.Id, hasWindow: !!j.HasWindow };
  } catch {
    return { running: false, hasWindow: false };
  }
}

function openWhatsApp() {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Start-Process 'shell:appsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App'`
    ], { encoding: 'utf8', timeout: 20000 });
    return true;
  } catch { return false; }
}

/**
 * Restore the WhatsApp window and bring it to the front.
 *
 * THIS IS THE ONE THAT MATTERS. A MINIMISED WebView2 stops rendering, so the
 * debug port keeps answering while the DOM freezes: the header goes empty, the
 * chat list rows lose their text, and every open fails. On 2026-09-28 the group
 * opened fine and then all eleven DMs failed exactly this way, because the
 * window had been minimised mid-run.
 *
 * `MainWindowHandle -ne 0` is true for a minimised window, which is why every
 * check that only looked at the handle said the window was fine. IsIconic is
 * the check that actually answers the question, and ShowWindow(SW_RESTORE) is
 * what un-freezes the renderer. AppActivate alone does not.
 */
function focusWhatsApp() {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Add-Type -Namespace W -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);'; ` +
      `$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*WhatsApp*' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1; ` +
      `if (-not $p) { 'none'; exit }; ` +
      `$h = $p.MainWindowHandle; ` +
      `if ([W.Win]::IsIconic($h)) { [W.Win]::ShowWindow($h, 9) | Out-Null; 'restored' } ` +
      `else { [W.Win]::SetForegroundWindow($h) | Out-Null; 'raised' }`
    ], { encoding: 'utf8', timeout: 25000 });
  } catch { /* best effort - the DOM check inside wa_fetch.js is the real gate */ }
}

const TARGETS = [
  { label: 'GROUP Jatim tok',    query: 'Jatim tok' },
  { label: 'PRISCA YUNITA',      query: '+62 822-4547-6939' },
  { label: 'SUMARI SAWI RATIH',  query: '+62 823-2379-9015' },
  { label: 'LAVITA',             query: '+62 852-3619-2050' },
  { label: 'RINDIANI',           query: '+62 889-8997-5099' },
  { label: 'RINZANA NUR',        query: '+62 878-9818-6141' },
  { label: 'DESY NUR HIDAYATI',  query: '+62 821-2000-0941' },
  { label: 'IFFARAH RAHMADANI',  query: '+62 895-2460-4509' },
  { label: 'DEWI FALASIVA',      query: '+62 815-5511-600' },
  { label: 'DESI MUCHORIA',      query: '+62 895-4029-70508' },
  { label: 'LINDAWATI',          query: '+62 856-3014-448' },
  { label: 'KEDIRI DEVI',        query: '+62 855-3694-9462' },
];

const argv = process.argv.slice(2);
const only = argv.includes('--group-only') ? 'group'
           : argv.includes('--dm-only') ? 'dm' : null;
const listOnly = argv.includes('--list-only');

const run = (...args) => {
  try {
    // 20 minutes per chat. A chat is no longer just read off the screen: the
    // walk scrolls back to the start of the window, so a busy conversation
    // takes far longer than the one-screenview read this timeout was set for.
    // A re-scan of several days is the slow case, not the normal one.
    return execFileSync('node', [path.join(HERE, 'wa_fetch.js'), ...args],
      { encoding: 'utf8', timeout: 1200000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + `\n[exited ${e.status}]`;
  }
};

fs.mkdirSync(OUT_ROOT, { recursive: true });
console.log('output:', OUT_ROOT);

// Refuse to start on a closed WhatsApp window. See whatsappWindowState() above.
let wa = whatsappWindowState();
if (!wa.running) {
  console.log('WhatsApp is not running at all. Start it, then re-run.');
  process.exit(1);
}
if (!wa.hasWindow) {
  console.log('WhatsApp is running but its WINDOW IS CLOSED.');
  console.log('  The background task keeps the debug port answering, but the DOM is');
  console.log('  stale and every chat open fails. Opening the window...');
  openWhatsApp();
  execFileSync('node', ['-e', 'setTimeout(()=>{},0)']);   // yield
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 1500']);
    wa = whatsappWindowState();
    if (wa.hasWindow) break;
  }
  if (!wa.hasWindow) {
    console.log('  still no window. Open WhatsApp manually, then re-run.');
    process.exit(1);
  }
  console.log('  window open now.');
}
console.log();

const summary = [];
for (const t of TARGETS) {
  const isGroup = t.label.startsWith('GROUP');
  if (only === 'group' && !isGroup) continue;
  if (only === 'dm' && isGroup) continue;

  console.log('='.repeat(60));
  console.log(t.label, `(${t.query})`);

  // Restore + foreground the window before every chat. A MINIMISED WebView2
  // stops rendering while its debug port keeps answering, and the window can be
  // minimised mid-run - on 2026-09-28 the group succeeded and all eleven DMs
  // then failed on an empty header for exactly this reason.
  focusWhatsApp();
  execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 2200'],
    { encoding: 'utf8', timeout: 15000 });

  const outDir = path.join(OUT_ROOT, t.label.replace(/[\\/:*?"<>|]/g, '_'));
  const out = run(t.query, outDir, PORT, '--label', t.label, ...(listOnly ? ['--list-only'] : []));

  const failed = /!! could not open/.test(out);
  const ok = out.split('\n').filter(l => /\bOK\b/.test(l)).length;
  const listed = out.match(/images: (\d+)/);

  // On failure, print EVERYTHING the child said. It prints the first rows of
  // the chat list on each failed attempt - the evidence that shows whether the
  // click landed on the wrong row - and a filter narrow enough to be tidy was
  // throwing exactly that away, so every failure in the log arrived without its
  // own explanation. A failure earns the noise.
  const lines = out.split('\n');
  const interesting = /attempt|open:|images:|OK|SKIP|!!|rows:|paneRows|walk|window|capped|marker|not marked/;
  (failed ? lines : lines.filter((l) => interesting.test(l)))
    .forEach((l) => console.log(l.startsWith('  ') ? l : '  ' + l));

  summary.push({ label: t.label, opened: !failed, inView: listed ? Number(listed[1]) : 0,
                 downloaded: ok, dir: outDir });
}

console.log();
console.log('='.repeat(60));
console.log('SUMMARY');
for (const s of summary) {
  console.log(`  ${s.label.padEnd(22)} ${s.opened ? `${s.inView} in view -> ${s.downloaded} downloaded` : 'COULD NOT OPEN'}`);
}
// No _summary.json. Nothing read it, so it was only ever a file that appeared
// and never got looked at. The table above is the record, and the pipeline
// captures this whole stdout into its own log.
