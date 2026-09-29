---
name: never-touch-chrome-profile-auth
description: "NEVER run the user's real Chrome profile under a different user-data-dir, and NEVER force-kill Chrome — both destroy Google sign-in"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 017b041c-78d9-4174-be4d-6e44f1db515e
---

**Two hard rules. No exceptions, no exceptions for convenience:**

1. **Never run Chrome with `--user-data-dir` pointing at anything other than the
   user's default profile path while using their real profile.** No junctions, no
   symlinks, no path aliases, no copies.
2. **Never `Stop-Process -Force` / `taskkill /F` on Chrome.** Graceful close only,
   and wait until the process count is actually 0.

**Why:** On 2026-09-26 I ran the user's real Chrome through a junction
(`C:\ChromeRealProfile`) to work around Chrome 136+ ignoring
`--remote-debugging-port` on the default profile path. Chrome tolerated it
briefly, then **discarded the profile's cookies** (Profile 2: 3982 -> 22;
Profile 7: 148 -> 3, losing all four `SID`/`HSID`/`SSID`/`SAPISID`) and **wiped
the profile's account identity** from both `Preferences` (`account_info`) and
`Local State` (`profile.info_cache.*.gaia_id`, `user_name`, `gaia_name`). Chrome
then cleared the sign-in again on every startup. I also force-killed Chrome
repeatedly, which the user had already warned me about earlier the same night
("profile 80 was not dead, I was re-signing it before you closed it").

Net result: the user lost Google sign-in on profiles they needed for work, had
to spend a sign-in recovering, and it was entirely preventable. The user was
justifiably angry.

**How to apply:**
- Need a debug port? Use Chrome's own opt-in — `chrome://inspect/#remote-debugging`
  — which does **not** change the user-data-dir. Ask the user to click it.
- Never "solve" a Chrome limitation by relocating the profile. If the only
  workaround available is running their profile from a different path, **stop
  and tell the user the tooling cannot safely do this.**
- Before touching ANY file under `...\Chrome\User Data\`, copy it first and say
  where the copy is.
- Closing Chrome: `CloseMainWindow()` then poll until the count is 0. If it will
  not close, report that — do not escalate to a force-kill.

Related: [[ice-cube-photo-tool]]
