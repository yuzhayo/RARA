"""wa_apply.py — carry out the plan: file the confirmed photos, copy to nota.

    python wa_apply.py [--plan plan.json] [--dry-run]

Only touches entries the plan marked ADD (or SUFFIX). Everything else - skips,
rejects, unclear - is left alone.

For each accepted photo it:
  1. copies it into the BA's folder as  DD-MM.jpeg
  2. copies it into ICE-CUBE-NOTA as  <NAME> DD-MM <number>.jpeg

It does NOT insert into the spreadsheet. That is a separate, later step, run
only once the folders are correct.

Originals in the temp download folder are never moved or deleted.
"""

import io, os, re, sys, json, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from wa_common import MAP, ROOT as WA_ROOT, SEPT, NOTA

# Same reason as wa_plan.py: cp1252 stdout cannot print an emoji filename.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass



def split_folder(folder):
    """'SBY LAVITA 852-3619-2050' -> ('LAVITA', '852-3619-2050')"""
    m = re.match(r"^(.*?)\s+(\d[\d-]*)$", folder or "")
    if not m:
        return (folder or "").strip(), None
    name = m.group(1).strip()
    # drop the city prefix for the nota filename: "SBY LAVITA" -> "LAVITA"
    parts = name.split()
    if len(parts) > 1 and parts[0] in ("SBY", "MALANG", "MOJOKERTO", "SIDOARJO", "KEDIRI"):
        parts = parts[1:]
    return " ".join(parts), m.group(2)


def main():
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    plan_path = argv[argv.index("--plan") + 1] if "--plan" in argv \
        else os.path.join(WA_ROOT, "_plan.json")

    plan = json.load(io.open(plan_path, encoding="utf-8"))
    todo = [p for p in plan if p["action"] in ("add", "suffix")]

    print(f"plan : {plan_path}")
    print(f"to file: {len(todo)}   (skips/rejects untouched)")
    if dry:
        print("DRY RUN - nothing is copied\n")
    else:
        os.makedirs(NOTA, exist_ok=True)
        print()

    if not todo:
        print("nothing to do")
        return

    done = []
    for p in todo:
        label, fn, target = p["ba"], p["file"], p["target"]
        folder = MAP.get(label)
        if not folder:
            print(f"  SKIP  {label}: no folder mapping")
            continue

        # `src` is where the image actually sits. For a DM that is the BA's own
        # staging folder; for a group post it is the group folder, and the BA
        # it belongs to is only known from the sender WhatsApp recorded.
        src_key = p.get("src", label)
        src = os.path.join(WA_ROOT, src_key, fn)
        if not os.path.exists(src):
            print(f"  MISS  {src_key}/{fn}")
            continue

        dst_dir = os.path.join(SEPT, folder)
        dst = os.path.join(dst_dir, target)
        if os.path.exists(dst):
            print(f"  EXISTS {folder}/{target} - not overwriting")
            continue

        name, number = split_folder(folder)
        nota_name = f"{name} {target[:5]} {number}.jpeg" if number else f"{name} {target}"
        nota_dst = os.path.join(NOTA, nota_name)

        print(f"  FILE  {folder}/{target}")
        print(f"        nota -> {nota_name}")
        if not dry:
            shutil.copy2(src, dst)
            shutil.copy2(src, nota_dst)

        done.append({"ba": label, "file": fn, "date": p.get("date"),
                     "filed": os.path.join(folder, target), "nota": nota_name})

    print()
    print(f"{'would file' if dry else 'filed'}: {len(done)}")
    if not dry and done:
        out = os.path.join(WA_ROOT, "_applied.json")
        json.dump(done, io.open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("record ->", out)
        print()
        print("next: insert into the spreadsheet")
        print("  cd ICE-CUBE-SEPT && node run-all.js --dry-run")
        print("  cd ICE-CUBE-SEPT && node run-all.js")


if __name__ == "__main__":
    main()
