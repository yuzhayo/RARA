/**
 * cdp_browser.js — CDP transport for the ICE CUBE automation profile.
 *
 * THE DESIGN, AND WHY
 * -------------------
 * Chrome 136+ blocks --remote-debugging-port on the DEFAULT profile path. The
 * workaround used before — a junction pointing at the REAL profile — wiped the
 * user's Google sign-in. That approach is BANNED (see the HARD RULE in
 * ~/.claude/CLAUDE.md).
 *
 * Instead there is a DEDICATED automation profile, kept BESIDE the workspace so
 * a 600 MB Chrome profile never travels with the project. Its path is DERIVED
 * from this file's own location (see paths.js) and never written down:
 *
 *     <RARA>\BROWSER-AUTOMATION
 *
 * Because it is a non-default path, the classic --remote-debugging-port works
 * and asks for NO permission prompt. The user's real Chrome profiles are not
 * involved at all.
 *
 *   !! THIS PROFILE'S SIGN-IN IS NOT PATH-BOUND - measured, not assumed.
 *
 *      It was copied from Downloads to C:\RARA, moved to a different level, and
 *      finally RENAMED to BROWSER-AUTOMATION. After all three the sheet still
 *      opened with no login prompt, and Chrome never cleared the identity from
 *      Local State or Preferences. The old warning here - "a moved or copied
 *      profile arrives SIGNED OUT" - was a reasonable guess that turned out to
 *      be wrong for this profile, and it made every move look more dangerous
 *      than it was.
 *
 *      What remains absolutely true is the DIFFERENT thing: running a
 *      SIGNED-IN REAL profile through a junction destroyed cookies and account
 *      identity on profiles the user needed for work. That is the dangerous
 *      failure, and it is why the junction is banned. Losing this profile's
 *      sign-in costs one sign-in; that one cost the user their working accounts.
 *
 * Connection model: ONE WebSocket held open for an entire batch. That is what
 * the insert flow needs anyway — the Google Picker dismisses the moment the CDP
 * session drops.
 */

import fs from 'node:fs';
import path from 'node:path';
import { AUTOMATION_PROFILE } from './paths.js';

/**
 * Re-exported so anything importing it from here keeps working.
 *
 * It used to be hardcoded to an absolute path. When the whole workspace was
 * copied to another drive, that literal kept pointing at the OLD copy - the
 * tools would have driven the wrong profile, and nothing would have said so.
 */
export { AUTOMATION_PROFILE };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The command to start the automation Chrome. Printed in errors so it's to hand. */
export function launchCommand(port = 9333) {
  return `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ` +
    `--user-data-dir="${AUTOMATION_PROFILE}" --profile-directory=Default ` +
    `--remote-debugging-port=${port} --no-first-run --no-default-browser-check`;
}

export class Browser {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();
    this.events = [];
    this.contexts = [];
    this.onEvent = null;
  }

  /**
   * Connect to the automation Chrome. Does NOT prompt — the classic debugging
   * server has no permission gate.
   */
  static async connect(port = 9333, { timeoutMs = 15000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let list = null;
    for (;;) {
      try {
        list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        break;
      } catch {
        if (Date.now() > deadline) {
          throw new Error(
            `No debug port on ${port}. Is the automation Chrome running?\n\n` +
            `  ${launchCommand(port)}\n\n` +
            `(Profile: ${AUTOMATION_PROFILE} - do NOT move or copy this folder.)`);
        }
        await sleep(500);
      }
    }
    const page = (list || []).find((t) => t.type === 'page');
    if (!page) throw new Error('no page targets on the automation Chrome');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('websocket failed')), { once: true });
    });
    const b = new Browser(ws);
    ws.addEventListener('message', (e) => b._onMessage(JSON.parse(e.data)));
    return b;
  }

  _onMessage(m) {
    if (m.method === 'Runtime.executionContextCreated') this.contexts.push(m.params.context);
    if (m.method) {
      this.events.push(m.method);
      if (this.onEvent) this.onEvent(m);
      return;
    }
    if (m.id && this.pending.has(m.id)) {
      const { resolve, reject } = this.pending.get(m.id);
      this.pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout: ' + method)); }
      }, timeoutMs);
    });
  }

  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/**
 * Session — the attached page. Exposes eval/send/click/pickerFrames/chooser the
 * same shape insert.js already uses. Reuse ONE for a whole batch.
 */
export class Session {
  constructor(browser) {
    this.browser = browser;
    this.contexts = browser.contexts;
    this.events = browser.events;
    this._chooser = null;
    this.info = { title: '', url: '' };
  }

  static async open(browser, urlSubstring) {
    const s = new Session(browser);

    // file-chooser events arrive on the page websocket
    const prev = browser.onEvent;
    browser.onEvent = (m) => {
      if (prev) prev(m);
      if (m.method === 'Page.fileChooserOpened') s._chooser = m.params.backendNodeId;
    };

    await s.send('Runtime.enable').catch(() => {});
    await s.send('Page.enable').catch(() => {});
    await s.send('Page.bringToFront').catch(() => {});
    await s.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await s.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
    await sleep(500);

    // land on the sheet if we are somewhere else
    const url = await s.eval('location.href').catch(() => '');
    if (urlSubstring && !url.includes(urlSubstring)) {
      const id = urlSubstring.split('/').pop();
      await s.send('Page.navigate', { url: `https://docs.google.com/spreadsheets/d/${id}/edit` });
      await sleep(8000);
    }
    s.info = {
      title: await s.eval('document.title').catch(() => ''),
      url: await s.eval('location.href').catch(() => ''),
    };
    return s;
  }

  send(method, params = {}, timeoutMs = 30000) { return this.browser.send(method, params, timeoutMs); }

  async eval(expression, contextId) {
    const p = { expression, returnByValue: true, awaitPromise: true };
    if (contextId) p.contextId = contextId;
    const r = await this.send('Runtime.evaluate', p);
    if (r.exceptionDetails) {
      throw new Error(`${r.exceptionDetails.text} :: ${(r.result && r.result.description) || ''}`);
    }
    return r.result && r.result.value;
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(140);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(110);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  /** backendNodeId of a file chooser opened since the last reset(), if any. */
  get chooser() { return this._chooser; }

  /** Picker iframes that have a usable execution context. */
  async pickerFrames() {
    const ft = await this.send('Page.getFrameTree');
    const frames = [];
    (function walk(n) {
      frames.push({ id: n.frame.id, url: n.frame.url || '' });
      (n.childFrames || []).forEach(walk);
    })(ft.frameTree);
    return frames
      .filter((f) => f.url.includes('/picker/'))
      .map((f) => {
        const cs = this.browser.contexts.filter((c) => c.auxData && c.auxData.frameId === f.id);
        const main = cs.find((c) => c.auxData && c.auxData.isDefault) || cs[0];
        return { frameId: f.id, ctxId: main ? main.id : null };
      })
      .filter((p) => p.ctxId);
  }

  /** Reset per-image state without dropping the connection. */
  reset() { this._chooser = null; this.browser.events.length = 0; }

  async detach() { /* classic transport: closing the browser ws is enough */ }
}
