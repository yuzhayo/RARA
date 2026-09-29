"""wa_plan.py — turn the downloaded WhatsApp images into an actionable plan.

    python wa_plan.py [--out plan.json]

Does NOT move, copy, rename or insert anything. It only works out what SHOULD
happen, so it can be reviewed first.

For each downloaded image it decides:

  1. Is it a report photo?              detect_report (visual, not OCR)
  2. What date does it carry?           OCR first; if that fails it is marked
                                        NEEDS-READ and a human reads the image.
                                        OCR is a convenience, NOT the authority.
  3. What should happen to it?          hash first, then date:
                                          hash matches an existing file -> SKIP
                                          same date, different image    -> SUFFIX
                                          date not present             -> ADD

The rules come from the operator:
  - a BA may send several reports in one day, each carrying a DIFFERENT date
  - an identical image means the BA sent it twice -> skip
  - the same date with a different image -> suffix -(1), -(2), ...
  - an unreadable date is never guessed; it is escalated for a human
"""

import io, os, re, sys, json, glob
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
# Two folders are needed: this one (detect_report, ocr_photo) and SHARED
# (wa_common). The stages live in their own folders, so neither is on the path
# by default.
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "SHARED"))
from detect_report import verdict as report_verdict
from ocr_photo import read_photo
from wa_common import phash, ham, MAP, ROOT as WA_ROOT, SEPT, folder_state

# Windows consoles default to cp1252 and raise UnicodeEncodeError on the emoji
# BAs put in captions and filenames - which kills the run partway through a
# folder. Force UTF-8 on our own streams instead of depending on whoever
# launched us to have set PYTHONIOENCODING.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

MONTHS = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11,
    "desember": 12, "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6,
    "jul": 7, "ago": 8, "agu": 8, "aug": 8, "sep": 9, "sept": 9,
    "okt": 10, "oct": 10, "nov": 11, "des": 12, "dec": 12,
}
DATE_LONG = re.compile(r"\b(\d{1,2})\s+(" + "|".join(MONTHS) + r")\s+(\d{4})\b", re.I)
DATE_NUM = re.compile(r"\b(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})\b")
HASH_MATCH_MAX = 12      # <=12 bits different out of 256 = same photo

# The month these folders are for. Derived from the folder name, which already
# carries it ("ICE-CUBE-SEPT"), so it stays a consequence of `monthFolder`
# rather than a second setting that can drift out of step with it.
MONTH_CODE = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MEI": 5, "MAY": 5, "JUN": 6,
    "JUL": 7, "AGU": 8, "AGS": 8, "AUG": 8, "SEP": 9, "SEPT": 9, "OKT": 10,
    "OCT": 10, "NOV": 11, "DES": 12, "DEC": 12,
}


def expected_month():
    """The month number the month folder is for, or None if not recognisable."""
    tag = os.path.basename(SEPT).upper().split("-")[-1]
    return MONTH_CODE.get(tag)


# Dates read BY HAND when OCR failed. Guessing is never allowed, and OCR is only
# a convenience - the human reading is the authority.
# Per-month state, alongside .ledger.json - not with the code.
MANUAL_PATH = os.path.join(SEPT, "_manual-dates.json")
try:
    MANUAL = {k: v for k, v in json.load(io.open(MANUAL_PATH, encoding="utf-8")).items()
              if not k.startswith("_")}
except Exception:
    MANUAL = {}

# Images the agent has already examined and found to carry NO timestamp overlay
# at all - ordinary chat photos, not reports. The visual filter cannot rule
# these out (a holiday snap has just as little white in its lower-left as a
# report does), so without this record every later run spends another agent
# call reaching the same verdict on the same images.
NOT_REPORTS_PATH = os.path.join(SEPT, "_not-reports.json")
try:
    NOT_REPORTS = set(json.load(io.open(NOT_REPORTS_PATH, encoding="utf-8")).get("files", []))
except Exception:
    NOT_REPORTS = set()


def ocr_date(path):
    """Best-effort. Returns (iso, raw, note). Never guesses an ambiguous date."""
    r = read_photo(path)
    text = r.get("text") or ""
    m = DATE_LONG.search(text)
    if m:
        d, mon, y = int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3))
        if 1 <= d <= 31:
            return f"{y:04d}-{mon:02d}-{d:02d}", m.group(0), "long-form"
    m = DATE_NUM.search(text)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a > 12 and b <= 12:
            return f"{y:04d}-{b:02d}-{a:02d}", m.group(0), "numeric DD/MM"
        if b > 12 and a <= 12:
            return f"{y:04d}-{a:02d}-{b:02d}", m.group(0), "numeric MM/DD"
        return None, m.group(0), f"ambiguous numeric {m.group(0)}"
    return None, None, None




GROUP = "GROUP Jatim tok"


def number_index():
    """WhatsApp number -> BA label, read from the roster folders themselves.

    The folder names carry the number ('MALANG DEWI FALASIVA 815-5511-600'),
    so the roster needs no second copy that could drift out of step.
    """
    idx = {}
    for label, folder in MAP.items():
        m = re.search(r"(\d[\d-]{5,})\s*$", folder)
        if m:
            idx[re.sub(r"\D", "", m.group(1))] = label
    return idx


def sender_of(meta):
    """Who WhatsApp itself says sent this - never the caption.

    A caption is typed by hand and has already been seen carrying a date the
    image did not. The sender field is WhatsApp's own record.
    """
    m = re.search(r"\]\s*(.+?):\s*$", (meta or "").strip())
    return m.group(1).strip() if m else ""


def sender_label(meta, idx):
    """BA label for a message's sender, or None if it is not a roster BA."""
    digits = re.sub(r"\D", "", sender_of(meta))
    if digits.startswith("62") and len(digits) > 10:
        digits = digits[2:]
    return idx.get(digits)


def consider(label, fn, path, existing, have_dates, plan, src=None):
    """Decide one image: REJECT / UNCLEAR / SKIP / ADD / SUFFIX / NEEDS-READ."""
    if f"{label}/{fn}" in NOT_REPORTS:
        print(f"  REJECT   {fn[:44]}  (no timestamp overlay - settled by the agent earlier)")
        plan.append({"ba": label, "file": fn, "action": "reject", "src": src or label,
                     "reason": "no timestamp overlay (verified by the agent on an earlier run)"})
        return

    rv = report_verdict(path)
    if rv["report"] is False:
        print(f"  REJECT   {fn[:44]}  ({rv['reason']})")
        plan.append({"ba": label, "file": fn, "action": "reject", "src": src or label,
                     "reason": rv["reason"]})
        return
    if rv["report"] is None:
        print(f"  UNCLEAR  {fn[:44]}  score={rv['score']:.2f}")
        plan.append({"ba": label, "file": fn, "action": "unclear", "src": src or label,
                     "reason": rv["reason"]})
        return

    iso, raw, note = ocr_date(path)
    man = MANUAL.get(f"{label}/{fn}")
    if man and man.get("date"):
        iso, raw, note = man["date"], man.get("saw", ""), "read by hand"
    h = phash(path)
    best = min(((ham(h, e["hash"]), e["file"]) for e in existing), default=(999, None))

    if best[0] <= HASH_MATCH_MAX:
        action, detail = "skip", f"identical to {best[1]}"
    elif iso is None:
        action, detail = "needs-read", (note or "OCR could not read a date")
    elif expected_month() and int(iso[5:7]) != expected_month():
        # A date from another month. The file name is only DD-MM, and the cell
        # is worked out from the DAY alone - so a 13 August photo would be
        # filed as 13-08.jpeg and land in the row for 13 SEPTEMBER. Silently
        # wrong, and nothing downstream would reveal it. Never filed; reported.
        action, detail = "out-of-month", f"{iso} is not in this month's folder"
        plan.append({"ba": label, "file": fn, "action": action, "date": iso, "src": src or label,
                     "nearest": best[1], "distance": best[0], "ocr": raw, "note": note})
        print(f"  OUT-OF-MONTH {fn[:37]:<42} {detail}")
        return
    else:
        dd, mm = iso[8:10], iso[5:7]
        name = f"{dd}-{mm}.jpeg"
        if name[:5] in have_dates:
            n = 1
            while f"{name[:5]}-({n}).jpeg" in have_dates or any(
                    x["action"] == "add" and x.get("target", "").startswith(name[:5]) for x in plan):
                n += 1
            name = f"{name[:5]}-({n}).jpeg"
            action, detail = "suffix", f"{iso} already present"
        else:
            action, detail = "add", iso
        plan.append({"ba": label, "file": fn, "action": action, "date": iso, "src": src or label,
                     "target": name, "nearest": best[1], "distance": best[0],
                     "ocr": raw, "note": note})
        print(f"  {action.upper():<9} {fn[:40]:<42} -> {name}   {detail}")
        return

    plan.append({"ba": label, "file": fn, "action": action, "date": iso, "src": src or label,
                 "nearest": best[1], "distance": best[0], "note": note})
    print(f"  {action.upper():<9} {fn[:40]:<42} {detail}")


_STATES = {}


def state_of(label):
    """folder_state(label), computed once per run.

    folder_state re-hashes every image in the folder, and both the DM pass and
    the group pass need the same numbers - calling it in each would double the
    work for identical data.
    """
    if label not in _STATES:
        _STATES[label] = folder_state(label)
    return _STATES[label]


def main():
    argv = sys.argv[1:]
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None

    plan = []
    for label in MAP:
        d = os.path.join(WA_ROOT, label)
        if not os.path.isdir(d):
            continue
        files = sorted(f for f in os.listdir(d) if f.lower().endswith((".jpg", ".png")))
        if not files:
            continue
        existing, have_dates = state_of(label)
        print(f"\n=== {label}  ({len(existing)} existing, {len(have_dates)} dates) ===")
        for fn in files:
            consider(label, fn, os.path.join(d, fn), existing, have_dates, plan)

    # --- the group ---------------------------------------------------------
    # BAs post to the group as well as DM, and a group post that was never
    # also sent as a DM used to sit in the staging folder forever: this pass
    # did not exist, so nothing ever read it.
    #
    # The group is one pile with no per-person structure, so WHO sent what has
    # to come from WhatsApp's own message metadata. The caption is never used.
    gdir = os.path.join(WA_ROOT, GROUP)
    if os.path.isdir(gdir):
        metas = {}
        try:
            said = json.load(io.open(os.path.join(gdir, "_whatsapp-said.json"), encoding="utf-8"))
            for it in said.get("items", []):
                metas[it.get("file")] = it.get("meta") or ""
        except Exception:
            pass

        idx = number_index()
        files = sorted(f for f in os.listdir(gdir) if f.lower().endswith((".jpg", ".png")))

        # Hashes of everything already filed, across every BA. An image with no
        # identifiable sender cannot be FILED anywhere - but it may already BE
        # filed, and this turns a stale leftover into a clean SKIP instead of an
        # unanswerable question.
        every = []
        for lab in MAP:
            ex, _ = state_of(lab)
            for e in ex:
                every.append((lab, e["file"], e["hash"]))

        if files:
            print(f"\n=== {GROUP}  ({len(files)} image(s)) ===")
            for fn in files:
                meta = metas.get(fn, "")
                label = sender_label(meta, idx) if meta else None

                if label is None:
                    path = os.path.join(gdir, fn)
                    who = sender_of(meta) or "(no sender recorded)"

                    # The not-a-report record has to be consulted HERE too. These
                    # images never reach consider(), because an unknown sender
                    # stops them first - so without this check a settled verdict
                    # would be re-decided, and re-reported, on every run.
                    if f"{GROUP}/{fn}" in NOT_REPORTS:
                        print(f"  REJECT    {fn[:40]:<42} (no timestamp overlay - settled earlier)")
                        plan.append({"ba": GROUP, "file": fn, "action": "reject", "src": GROUP,
                                     "reason": "no timestamp overlay (verified on an earlier run)"})
                        continue

                    rv = report_verdict(path)
                    if rv["report"] is False:
                        print(f"  REJECT    {fn[:40]:<42} {rv['reason']}")
                        plan.append({"ba": GROUP, "file": fn, "action": "reject",
                                     "src": GROUP, "reason": rv["reason"]})
                        continue

                    h = phash(path)
                    best = min(((ham(h, hh), lab, fil) for lab, fil, hh in every),
                               default=(999, None, None))
                    if best[0] <= HASH_MATCH_MAX:
                        print(f"  SKIP      {fn[:40]:<42} already filed as {best[1]}/{best[2]}")
                        plan.append({"ba": best[1], "file": fn, "action": "skip", "src": GROUP,
                                     "nearest": best[2], "distance": best[0]})
                        continue

                    # NOT "needs-read". needs-read means the DATE could not be
                    # read, and the review phase answers that by having the
                    # agent look at the image - which cannot tell us WHO sent
                    # it. Filing it under needs-read made the gate stop, and
                    # that blocked every other photo behind one unstamped
                    # leftover. This is reported, loudly, but does not gate.
                    print(f"  UNATTRIBUTED {fn[:37]:<42} sender {who} is not a roster BA")
                    plan.append({"ba": GROUP, "file": fn, "action": "unattributed",
                                 "src": GROUP, "sender": sender_of(meta), "meta": meta,
                                 "note": f"sender '{who}' does not match a roster number"})
                    continue

                existing, have_dates = state_of(label)
                print(f"  -- sent by {label}")
                consider(label, fn, os.path.join(gdir, fn), existing, have_dates, plan, src=GROUP)

    counts = {}
    for p in plan:
        counts[p["action"]] = counts.get(p["action"], 0) + 1
    print("\n" + "=" * 70)
    print("plan:", counts)

    if out_path:
        json.dump(plan, io.open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("written:", out_path)


if __name__ == "__main__":
    main()
