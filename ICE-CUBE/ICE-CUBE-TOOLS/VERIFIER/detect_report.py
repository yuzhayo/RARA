"""detect_report.py — is this image a Timemark report photo, or something else?

    from detect_report import score, verdict
    verdict(path) -> {"report": bool, "score": float, "reason": str}

WHY VISUAL, NOT OCR
-------------------
OCR failed on 12 of 36 known-real report photos, because the templates differ
per BA (some print "Jumat, 25 September 2026", some "09/26/2026"). Deciding
"is this a report" by reading the overlay is therefore unreliable.

But we do not need to READ the overlay to know one is there. Every Timemark
template puts a block of near-white text in the lower-left corner. That block
is measurable without understanding a single character.

MEASUREMENTS (taken from the 36 known images)
---------------------------------------------
  ll_dense_rows   fraction of rows in the lower-left quadrant that are >25% white
      real reports : 0.0025 .. 0.185
      a screenshot : 0.980
  ll_band_white   white fraction in a tighter lower-left band
      real reports : 0.030 .. 0.138
      a screenshot : 0.721

THE THRESHOLD IS DELIBERATELY CONSERVATIVE
------------------------------------------
Calibrated against ONE known negative (a screenshot of the sheet). A false
positive here would silently DROP a real report, which is the dangerous
direction - so only an extreme score rejects an image outright. Everything else
is reported as "unclear" and looked at by a human.

Nothing is ever silently discarded.
"""

import numpy as np
import cv2

# Above this, the image is a near-solid white field - a screenshot or document,
# not a photo with a text overlay. Chosen well clear of every real report seen.
REJECT_ABOVE = 0.60

# Below this, it looks like a normal photo with the overlay block.
ACCEPT_BELOW = 0.30


def load_gray(path):
    """cv2.imread cannot handle non-ASCII paths on Windows (emoji in captions)."""
    try:
        buf = np.fromfile(path, dtype=np.uint8)
        return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    except Exception:
        return None


def score(path):
    """Return the lower-left white-density score, or None if unreadable."""
    g = load_gray(path)
    if g is None:
        return None
    H, W = g.shape
    r = g[int(H * 0.45):H, 0:int(W * 0.62)]      # lower-left quadrant
    if r.size == 0:
        return None
    rowwhite = (r > 225).mean(axis=1)
    return float((rowwhite > 0.25).mean())


def verdict(path):
    s = score(path)
    if s is None:
        return {"report": False, "score": None, "reason": "unreadable image"}
    if s > REJECT_ABOVE:
        return {"report": False, "score": s,
                "reason": f"lower-left is {s:.0%} solid white - looks like a "
                          f"screenshot/document, not a photo"}
    if s < ACCEPT_BELOW:
        return {"report": True, "score": s, "reason": "photo with an overlay text block"}
    return {"report": None, "score": s,
            "reason": f"score {s:.2f} is between the two thresholds - "
                      f"needs a human look (never dropped silently)"}
