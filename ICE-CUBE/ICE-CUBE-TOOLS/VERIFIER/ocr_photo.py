"""ocr_photo.py - read the Timemark date burned into an ICE CUBE photo.

    from ocr_photo import read_photo
    r = read_photo(path)
    # -> {"ok":bool, "timemark":bool, "date":"2026-09-25", "raw":"25 September 2026", ...}

    # or from the CLI:
    python ocr_photo.py <image> [<image> ...]

WHY THE PREPROCESSING IS WHAT IT IS
-----------------------------------
Measured on a known image whose overlay reads "Jumat, 25 September 2026":

    full frame, 2x, grayscale                 -> "5 September 2026"   WRONG
    full frame, 2x, + UnsharpMask             -> "25 September 2026"  correct
    full frame, 3x                           -> no date (image too large for the engine)
    tight crop of the date band, upscaled     -> no date (crop misses the text)
    binarised / thresholded                   -> no date

So: downscale nothing, upscale exactly 2x, grayscale, then sharpen. The sharpening
is what rescues the leading digit - the overlay is antialiased over a photo and the
engine drops thin glyph strokes without it.

The overlay position varies between BAs, so a fixed crop is NOT safe.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageOps, ImageFilter

PS1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_image.ps1")

MONTHS = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11,
    "desember": 12,
}

# Markers the Timestamp Camera app stamps. OCR mangles these, so match loosely.
TIMEMARK_MARKERS = re.compile(
    r"timemark|time\s*mark|kode\s*foto|foto\s*100|100%\s*akurat", re.I
)


def preprocess(path):
    """Full frame -> grayscale -> 2x LANCZOS -> unsharp mask. Returns a temp PNG."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    img = ImageOps.grayscale(img)
    img = img.resize((w * 2, h * 2), Image.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=3))
    fd, out = tempfile.mkstemp(suffix=".png", prefix="ocrpp_")
    os.close(fd)
    img.save(out)
    return out


def _run_engine(path):
    r = subprocess.run(
        ["powershell", "-NoProfile", "-File", PS1, path],
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        timeout=180,
    )
    out = (r.stdout or "") + (r.stderr or "")
    for line in reversed(out.strip().splitlines()):
        try:
            return json.loads(line)
        except Exception:
            continue
    return {"ok": False, "error": out[:300]}


def _parse_date(text):
    """Pull a date out of OCR text. Returns (iso, raw) or (None, None).

    No trailing word-boundary after the year: magnified crops often pick up a
    stray glyph from the overlay chrome, giving "02 September 20263". Requiring
    \\b there throws away an otherwise perfect read.
    """
    if not text:
        return None, None
    mon = "|".join(MONTHS.keys())
    m = re.search(rf"\b(\d{{1,2}})\s+({mon})\s+(\d{{4}})", text, re.I)
    if m:
        day, name, year = int(m.group(1)), m.group(2).lower(), int(m.group(3))
        return f"{year:04d}-{MONTHS[name]:02d}-{day:02d}", m.group(0)
    m2 = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if m2:
        d, mo, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}", m2.group(0)
    return None, None


MONTH_PREFIXES = ("jan", "feb", "mar", "apr", "mei", "may", "jun", "jul",
                  "agu", "aug", "sep", "okt", "oct", "nov", "des", "dec")

WORDS_PS1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_words.ps1")


def _run_words_engine(path):
    r = subprocess.run(
        ["powershell", "-NoProfile", "-File", WORDS_PS1, path],
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        timeout=180,
    )
    out = (r.stdout or "") + (r.stderr or "")
    for line in reversed(out.strip().splitlines()):
        try:
            return json.loads(line)
        except Exception:
            continue
    return {}


def _locate_date_region(words, scale):
    """Find the bounding box of the most date-like word cluster.

    `words` carry boxes in the SCALED image; divide by `scale` to get original
    coordinates. Returns (x0,y0,x1,y1) in original coords, or None.
    """
    if not words:
        return None

    def looks_like_date(w):
        t = (w.get("t") or "").lower()
        if re.fullmatch(r"\d{1,2}", t):            # day
            return 2
        if re.fullmatch(r"20\d{2}", t):            # year
            return 3
        if re.fullmatch(r"20\d", t):               # mangled year
            return 2
        for p in MONTH_PREFIXES:                   # month, full or mangled
            if t.startswith(p) or (len(t) >= 4 and p in t):
                return 3
        return 0

    scored = [(looks_like_date(w), w) for w in words]
    anchors = [w for s, w in scored if s >= 3]
    if not anchors:
        anchors = [w for s, w in scored if s >= 2]
    if not anchors:
        return None

    # cluster anchors that sit on roughly the same line
    best = None
    for a in anchors:
        ay = a["y"] + a["h"] / 2
        band = [w for s, w in scored if s > 0 and abs((w["y"] + w["h"] / 2) - ay) < max(a["h"], 40)]
        if not band:
            continue
        x0 = min(w["x"] for w in band)
        x1 = max(w["x"] + w["w"] for w in band)
        y0 = min(w["y"] for w in band)
        y1 = max(w["y"] + w["h"] for w in band)
        area = (x1 - x0) * (y1 - y0)
        if best is None or area > best[0]:
            best = (area, x0, y0, x1, y1)
    if not best:
        return None

    _, x0, y0, x1, y1 = best
    # pad, then convert scaled -> original coords
    pad_x, pad_y = 40, 25
    return (int((x0 - pad_x) / scale), int((y0 - pad_y) / scale),
            int((x1 + pad_x) / scale), int((y1 + pad_y) / scale))


def read_photo(path, magnify=10):
    """OCR one photo, two-pass. Returns a dict; never raises for ordinary failures.

    Pass 1 reads the whole frame WITH word boxes to locate the date region.
    Pass 2 crops the ORIGINAL at that region and magnifies hard, which is what
    makes small low-contrast overlay text legible. Single-pass alone reads some
    dates wrong rather than not at all - the failure mode that misfiles silently.
    """
    res = {"path": path, "ok": False, "timemark": False, "date": None, "raw": None,
           "method": None, "text": "", "error": None}
    tmp_full = tmp_crop = None
    try:
        if not os.path.exists(path):
            res["error"] = "file not found"
            return res

        src = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        W, H = src.size

        # ---- pass 1: locate ----
        tmp_full = preprocess(path)
        words_result = _run_words_engine(tmp_full)
        words = words_result.get("words", []) if words_result else []
        region = _locate_date_region(words, scale=2)

        # ---- pass 2: magnify the region ----
        if region:
            x0, y0, x1, y1 = region
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(W, x1), min(H, y1)
            if x1 - x0 > 20 and y1 - y0 > 10:
                crop = src.crop((x0, y0, x1, y1))
                cw, ch = crop.size
                big = ImageOps.grayscale(crop).resize((cw * magnify, ch * magnify), Image.LANCZOS)
                fd, tmp_crop = tempfile.mkstemp(suffix=".png", prefix="ocrcrop_")
                os.close(fd)
                big.save(tmp_crop)
                r2 = _run_engine(tmp_crop)
                if r2.get("ok"):
                    iso, raw = _parse_date(r2.get("text") or "")
                    if iso:
                        res.update(ok=True, date=iso, raw=raw, method="two-pass",
                                   text=r2.get("text") or "")
                        res["timemark"] = True
                        return res

        # ---- fallback: full-frame single pass ----
        engine = _run_engine(tmp_full)
        if not engine.get("ok"):
            res["error"] = engine.get("error") or "engine failed"
            return res
        text = engine.get("text") or ""
        res["text"] = text
        res["ok"] = True
        iso, raw = _parse_date(text)
        res["date"], res["raw"] = iso, raw
        res["method"] = "single-pass" if iso else None
        res["timemark"] = bool(TIMEMARK_MARKERS.search(text)) or iso is not None
    except Exception as e:
        res["error"] = str(e)[:200]
    finally:
        for t in (tmp_full, tmp_crop):
            if t and os.path.exists(t):
                try:
                    os.remove(t)
                except OSError:
                    pass
    return res


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    for p in args:
        r = read_photo(p)
        print(json.dumps(r, ensure_ascii=False))
