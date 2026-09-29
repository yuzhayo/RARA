---
name: out-photo-banned
description: "OUT-PHOTOS: 12 replaced approaches — do not fall back, do not re-propose"
updated: 2026-09-29
---

# OUT-PHOTOS banned approaches

Each was tried, was wrong, and is recorded so it is not re-invented after a
compaction:

1. **Reading the visible chat and calling it a scan.** WhatsApp unmounts what is
   scrolled away. The scan must WALK the history back to the window start.
2. **Using the caption for identity.** Hand-typed. Identity = DM folder, or the
   sender number WhatsApp records.
3. **Scrolling `#main`.** It does not scroll. Use
   `[data-testid="conversation-panel-messages"]`.
4. **Advancing the scan marker after a partial walk.** A partial scan is not a
   scan; the marker stays put.
5. **Treating "no timestamp overlay" as "unreadable date".** Opposites: the
   first is not a report, the second needs a human.
6. **Filing a photo whose date is outside the current month.** Cell comes from
   the day alone → silently wrong row.
7. **Relying on the caller to set `PYTHONIOENCODING`.** Scripts force UTF-8 on
   their own streams.
8. **Deleting `_manual-dates.json` / `_not-reports.json` to "clean up".** Paid
   readings; deleting re-buys the same agent calls. `_not-reports.json` stops
   ordinary chat photos being re-examined every run.
9. **Trusting `MainWindowHandle -ne 0` as proof the window works.** True for a
   MINIMISED window whose WebView2 stopped rendering. `IsIconic` is the check;
   `ShowWindow(SW_RESTORE)` the cure, before EVERY chat.
10. **Deriving a list from the plan only before the agent runs.** Phase 4
    REPLACES the plan. Rebuild every derived list after each re-plan.
11. **Filtering a child process's output down to what looks tidy.** On failure,
    print everything the child said.
12. **Calling the agent without pinning the model.** Image phases need a model
    that sees. `claude -p --model <agentModel>`, pinned `deepseek-v4-flash` —
    never ambient default.
