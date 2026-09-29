/**
 * paths.js — one place that works out where everything lives.
 *
 * Every path is derived from ONE setting: `monthFolder` in config.json. The
 * scripts are grouped into stage folders, and this file lives in SHARED\, so it
 * climbs ONE level to find ICE-CUBE-TOOLS rather than assuming it sits there.
 *
 *   C:\RARA\                       <- the profile sits beside the workspace,
 *     BROWSER-AUTOMATION\         not inside it
 *     ICE-CUBE\
 *       ICE-CUBE-SEPT\             the month folder  (monthFolder)
 *       ICE-CUBE-DOCS\             documentation
 *       WA-DOWNLOAD\               temp staging for fetched images
 *       ICE-CUBE-TOOLS\
 *         SHARED\                  this file, config, cdp, wa_common
 *         SCANNER-DOWNLOADER\      walk the chats, bring the images down
 *         VERIFIER\                what each image is; asks the agent
 *         INPUTTER\                write to the sheet, read it back
 *         run-pipeline.js          runs the stages in order
 *
 * Changing month = edit `monthFolder`. Nothing else needs touching.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS = path.dirname(SHARED);
export const ICE_ROOT = path.dirname(TOOLS);
export const DOCS = path.join(ICE_ROOT, 'ICE-CUBE-DOCS');
export const WA_DOWNLOAD = path.join(ICE_ROOT, 'WA-DOWNLOAD');
// A SIBLING of the workspace, deliberately: it is the browser's data, not the
// project's, and keeping it out of ICE-CUBE\ means moving the project never
// drags a 600 MB Chrome profile with it.
export const AUTOMATION_PROFILE = path.join(path.dirname(ICE_ROOT), 'BROWSER-AUTOMATION');

export const CONFIG_PATH = path.join(SHARED, 'config.json');
export const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

/** The month folder — the only thing that changes each month. */
export const MONTH = path.join(ICE_ROOT, CONFIG.monthFolder || 'ICE-CUBE-SEPT');

function must(p, what) {
  if (!fs.existsSync(p)) {
    throw new Error(
      `${what} not found at ${p}\n` +
      `Check "monthFolder" in ${CONFIG_PATH} (currently "${CONFIG.monthFolder}").`);
  }
  return p;
}

export { must };
