---
name: core-chrome-auth
description: "HARD RULE — never relocate a live signed-in Chrome profile, never force-kill Chrome"
updated: 2026-09-29
---

# Never touch Chrome profile auth

**Two hard rules. No exceptions, no exceptions for convenience:**

1. **Never run Chrome with `--user-data-dir` pointing at anything other than the
   profile's own path while it is signed in.** No junctions, no symlinks, no path
   aliases, no copies of a LIVE profile.
2. **Never `Stop-Process -Force` / `taskkill /F` on Chrome.** Graceful close only
   (`CloseMainWindow()`), then poll until the process count is actually 0.

**Why:** On 2026-09-26 the agent ran the user's real Chrome through a junction
(`C:\ChromeRealProfile`) to work around Chrome 136+ ignoring
`--remote-debugging-port` on the default profile path. Chrome tolerated it
briefly, then **discarded the profile's cookies** (Profile 2: 3982 -> 22;
Profile 7: 148 -> 3, losing all four `SID`/`HSID`/`SSID`/`SAPISID`) and **wiped
the profile's account identity** from both `Preferences` (`account_info`) and
`Local State` (`profile.info_cache.*.gaia_id`, `user_name`, `gaia_name`). Chrome
then cleared the sign-in again on every startup. Force-kills the same night made
it worse ("profile 80 was not dead, I was re-signing it before you closed it").

Net result: the user lost Google sign-in on profiles they needed for work, had
to spend a sign-in recovering, and it was entirely preventable.

**How to apply:**
- Need a debug port on the REAL profile? Use Chrome's own opt-in —
  `chrome://inspect/#remote-debugging` — which does **not** change the
  user-data-dir. Ask the user to click it.
- Never "solve" a Chrome limitation by relocating the profile. If the only
  workaround is running their profile from a different path, **stop and tell the
  user the tooling cannot safely do this.**
- Before touching ANY file under `...\Chrome\User Data\`, copy it first and say
  where the copy is.
- Closing Chrome: `CloseMainWindow()` then poll until the count is 0. If it will
  not close, report that — do not escalate to a force-kill.

**The automation profile is the different, safe case** (see
`DOMAIN/domain-boundaries.md`): copied, moved and renamed with sign-in intact,
measured 2026-09-29. Safe failure (one re-sign-in) vs dangerous failure
(destroyed live accounts) — never confuse them.
