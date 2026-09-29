"""wa_common.py — shared constants and helpers for the WhatsApp pipeline.

Kept separate so importing a helper does not execute another script's main body.

Paths are derived from ONE setting: `monthFolder` in config.json. Nothing here
hard-codes the month, so changing month is a one-line edit in config.json.

This file lives in the SHARED folder, so it climbs ONE level to find
ICE-CUBE-TOOLS rather than assuming it sits there.
"""

import io
import json
import os

import numpy as np
import cv2

SHARED = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(SHARED)
ICE_ROOT = os.path.dirname(TOOLS)

with io.open(os.path.join(SHARED, "config.json"), encoding="utf-8") as fh:
    CONFIG = json.load(fh)

#: the month folder — photos, BA subfolders, ledger, manual dates
SEPT = os.path.join(ICE_ROOT, CONFIG.get("monthFolder", "ICE-CUBE-SEPT"))
#: temp staging for images fetched from WhatsApp
ROOT = os.path.join(ICE_ROOT, "WA-DOWNLOAD")
#: flat copies for manual nota entry
NOTA = os.path.join(SEPT, "ICE-CUBE-NOTA")

# label (as used for the temp download folder) -> BA folder in the month folder
MAP = {
    "PRISCA YUNITA":     "SBY PRISCA YUNITA 822-4547-6939",
    "SUMARI SAWI RATIH": "SBY SUMARI SAWI RATIH 823-2379-9015",
    "LAVITA":            "SBY LAVITA 852-3619-2050",
    "RINDIANI":          "SBY RINDIANI 889-8997-5099",
    "RINZANA NUR":       "SBY RINZANA NUR 878-9818-6141",
    "DESY NUR HIDAYATI": "SBY DESY NUR HIDAYATI 821-2000-0941",
    "IFFARAH RAHMADANI": "MALANG IFFARAH RAHMADANI 895-2460-4509",
    "DEWI FALASIVA":     "MALANG DEWI FALASIVA 815-5511-600",
    "DESI MUCHORIA":     "MOJOKERTO DESI MUCHORIA 895-4029-70508",
    "LINDAWATI":         "SIDOARJO LINDAWATI 856-3014-448",
    "KEDIRI DEVI":       "KEDIRI DEVI 855-3694-9462",
}

KEEP = 8          # top-left DCT block for the perceptual hash
HASH_BITS = KEEP * KEEP


def load_gray(path):
    """cv2.imread cannot open non-ASCII paths on Windows (emoji in captions)."""
    try:
        buf = np.fromfile(path, dtype=np.uint8)
        return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    except Exception:
        return None


def phash(path):
    """16x16 DCT, top-left 8x8 above the median -> 64-bit perceptual hash."""
    img = load_gray(path)
    if img is None:
        return None
    img = cv2.resize(img, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(img))
    block = dct[:KEEP, :KEEP].flatten()
    med = np.median(block[1:])          # ignore the DC term
    return (block > med).astype(np.uint8)


def ham(a, b):
    return int(np.count_nonzero(a != b))


def folder_state(label):
    """Existing hashes and occupied DD-MM date slots for that BA's folder."""
    folder = MAP.get(label)
    d = os.path.join(SEPT, folder) if folder else None
    hashes, dates = [], set()
    if d and os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            dates.add(f[:5])
            h = phash(os.path.join(d, f))
            if h is not None:
                hashes.append({"file": f, "hash": h})
    return hashes, dates
