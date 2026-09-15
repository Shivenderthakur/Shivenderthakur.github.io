#!/usr/bin/env python3
"""Put high-quality replacement pictures from assets/tmp/ under their official names.

Name each download after its ID or slug in docs/ASSETS.md (C09.pdf, E07.jpg,
tequity-hackathon-2025.png), then:

  python3 tools/assets/place.py --list              every ID, file and required shape
  python3 tools/assets/place.py                     dry run: what would be written
  python3 tools/assets/place.py --apply             write, move sources to assets/tmp/done/
  python3 tools/assets/place.py --apply --fit pad   border pictures whose shape differs
  python3 tools/assets/place.py --apply --fit crop  centre-crop them instead

Outputs keep the official file names, and thumbnails keep the shape index.html and
js/island.js were written for, so no code changes are needed. Needs Pillow; PDFs need
pdftoppm (poppler-utils). Not part of the site.
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

# Keep in step with docs/ASSETS.md.
IDS = {
    "P01": "shivender",
    "P02": "og-card",
    "R01": "press/robonari-marudhar-aaina-2024",
    "R02": "press/robonari-dainik-nirala-2024",
    "R03": "press/robonari-sach-media-2024",
    "R04": "press/robonari-jagruk-times-2024",
    "R05": "press/mount-abu-navjyoti-2025",
    "E01": "events/robonari-on-stage-bheenmal-2024",
    "E02": "events/attendance-system-poster-2023",
    "E03": "events/kinelink-gesture-demo-2025",
    "E04": "events/kinelink-interface-2025",
    "E05": "events/prometeo-2025-iit-jodhpur",
    "E06": "events/ai-on-edge-mbm-faculty-workshop",
    "E07": "events/tequity-hackathon-2025",
    "E08": "events/roboai-hub-team",
    "E09": "events/indiasoft-expo-badge-2026",
    "E10": "events/at-work",
    "B01": "bench/workstation",
    "B02": "bench/raspberry-pi",
    "B03": "bench/motor-driver-bench",
    "C01": "certs/nptel-deep-learning-iit-ropar-2025",
    "C02": "certs/cadd-autofina-robotics-360h-2023",
    "C03": "certs/roboai-hub-180-day-internship-2024",
    "C04": "certs/ccna-enterprise-networking-2023",
    "C05": "certs/ccna-switching-routing-2023",
    "C06": "certs/straightarc-cyber-security-2024",
    "C07": "certs/pm-shri-kv-mount-abu-2025",
    "C08": "certs/academor-2023",
    "C09": "certs/linkedin-linux-cli-2025",
    "C10": "certs/linkedin-ecmascript-2025",
    "C11": "certs/devtown-python-ai-2023",
    "C12": "certs/roboai-hub-robotics-internship-2025",
    "C13": "certs/itk-ai-internship-2023",
    "C14": "certs/cisco-intro-to-networks-2023",
    "C15": "certs/cisco-networking-essentials-2022",
    "C16": "certs/academor-flutura-ml-internship-2023",
    "C17": "certs/academor-kshitij-ml-course-2023",
    "C18": "certs/aws-community-builders-devtown-python-ai",
    "E11": "events/taabar-mela-stall",
    "E12": "events/taabar-mela-arm-demo",
    "E13": "events/servo-arm-acrylic-build",
    "E14": "events/servo-arm-acrylic-assembly",
    "E15": "events/mount-abu-camp-classroom-2025",
    "E16": "events/mount-abu-camp-smartboard-2025",
    "E17": "events/mount-abu-camp-ml-lesson",
    "E18": "events/swavalamban-kaushal-mela-2025",
}
THUMB_WIDTH = {"certs": 560}   # other folders keep their current thumbnail width
MAX_PIXELS = 4_200_000         # cap for -full images; nothing is ever enlarged
TOLERANCE = 0.02               # shape difference accepted without --fit
INPUTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".pdf"}
LANCZOS = Image.Resampling.LANCZOS


def size_of(path):
    with Image.open(path) as im:
        return im.size


def target(root, key):
    folder, _, name = key.rpartition("/")
    base = root / "assets" / folder
    if not folder:
        path = base / f"{name}.jpg"
        w, h = size_of(path)
        return {"name": name, "single": path, "size": (w, h), "ratio": w / h}
    thumb, full = base / f"{name}.webp", base / f"{name}-full.webp"
    w, h = size_of(thumb)
    fw, fh = size_of(full)
    return {"name": name, "thumb": thumb, "full": full, "ratio": w / h,
            "thumb_w": THUMB_WIDTH.get(folder, w), "full_pixels": fw * fh}


def load(path):
    if path.suffix.lower() == ".pdf":
        if not shutil.which("pdftoppm"):
            raise ValueError("PDFs need pdftoppm (sudo apt install poppler-utils), or export page 1 as PNG")
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "page"
            subprocess.run(["pdftoppm", "-r", "300", "-png", "-f", "1", "-l", "1", "-singlefile", str(path), str(out)],
                           check=True, capture_output=True)
            im = Image.open(out.with_suffix(".png"))
            im.load()
    else:
        im = Image.open(path)
        im.load()
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, mask=im.getchannel("A"))
        return flat
    return im.convert("RGB")


def edge_colour(im):
    s = im.resize((24, 24))
    px = [s.getpixel((x, y)) for x in range(24) for y in range(24) if x in (0, 23) or y in (0, 23)]
    return tuple(sum(c[k] for c in px) // len(px) for k in range(3))


def fit(im, ratio, mode):
    """Returns (picture in the required shape or None, note)."""
    w, h = im.size
    r = w / h
    if abs(r - ratio) / ratio <= TOLERANCE:
        return im, "shape ok"
    if mode == "crop":
        if r > ratio:
            nw = round(h * ratio)
            x = (w - nw) // 2
            return im.crop((x, 0, x + nw, h)), f"centre-cropped from {r:.3f} to {ratio:.3f}"
        nh = round(w / ratio)
        y = (h - nh) // 2
        return im.crop((0, y, w, y + nh)), f"centre-cropped from {r:.3f} to {ratio:.3f}"
    if mode == "pad":
        colour = edge_colour(im)
        if r > ratio:
            canvas = Image.new("RGB", (w, round(w / ratio)), colour)
            canvas.paste(im, (0, (canvas.height - h) // 2))
        else:
            canvas = Image.new("RGB", (round(h * ratio), h), colour)
            canvas.paste(im, ((canvas.width - w) // 2, 0))
        return canvas, f"padded from {r:.3f} to {ratio:.3f}"
    return None, f"shape {r:.3f} differs from the required {ratio:.3f}; crop it, use --fit pad or --fit crop"


def cap(im):
    w, h = im.size
    if w * h <= MAX_PIXELS:
        return im
    s = (MAX_PIXELS / (w * h)) ** 0.5
    return im.resize((round(w * s), round(h * s)), LANCZOS)


def save(im, path):
    if path.suffix == ".webp":
        im.save(path, "WEBP", quality=80 if path.stem.endswith("-full") else 82, method=6)
    else:
        im.save(path, "JPEG", quality=86, optimize=True, progressive=True, subsampling=0)


def main():
    ap = argparse.ArgumentParser(description="Place replacement pictures from assets/tmp/ under their official names.")
    ap.add_argument("--apply", action="store_true", help="write the files (default is a dry run)")
    ap.add_argument("--fit", choices=["none", "pad", "crop"], default="none",
                    help="what to do when a picture's shape differs from the one the code expects")
    ap.add_argument("--list", action="store_true", help="print every ID, file and required shape")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2],
                    help="repository root (to try it on a copy)")
    a = ap.parse_args()
    root = a.root.resolve()
    targets = {i: target(root, key) for i, key in IDS.items()}
    rel = lambda p: p.relative_to(root)

    if a.list:
        print(f"{'ID':<4} {'shape w/h':>9}  {'thumbnail':<18} file")
        for i, t in targets.items():
            if "single" in t:
                print(f"{i:<4} {t['ratio']:>9.3f}  {'%dx%d exactly' % t['size']:<18} {rel(t['single'])}")
            else:
                print(f"{i:<4} {t['ratio']:>9.3f}  {'%d wide' % t['thumb_w']:<18} {rel(t['thumb'])} + -full.webp")
        return

    tmp = root / "assets" / "tmp"
    if not tmp.is_dir():
        sys.exit(f"{rel(tmp)} does not exist; create it and put the downloads there")
    by_name = {t["name"]: i for i, t in targets.items()}
    found, problems = {}, 0
    for p in sorted(tmp.iterdir()):
        if p.is_dir() or p.name.startswith("."):
            continue
        if p.suffix.lower() not in INPUTS:
            print(f"skip    {p.name}: unsupported type (JPG, PNG, WebP, TIFF, BMP or PDF)")
            problems += 1
            continue
        stem = p.stem.lower().removesuffix("-full")
        i = stem.upper() if stem.upper() in IDS else by_name.get(stem)
        if not i:
            print(f"skip    {p.name}: name matches no ID or slug (see --list)")
            problems += 1
            continue
        found.setdefault(i, []).append(p)

    placed = 0
    verb = "placed " if a.apply else "would  "
    for i in sorted(found):
        files, t = found[i], targets[i]
        if len(files) > 1:
            print(f"skip    {i}: several files ({', '.join(f.name for f in files)}); keep one")
            problems += 1
            continue
        src = files[0]
        try:
            im = load(src)
        except Exception as e:
            print(f"skip    {i} {src.name}: {e}")
            problems += 1
            continue
        shaped, note = fit(im, t["ratio"], a.fit)
        if shaped is None:
            print(f"skip    {i} {src.name}: {note}")
            problems += 1
            continue

        if "single" in t:
            w, h = t["size"]
            warn = "; warning: smaller than required, will be enlarged" if shaped.width < w else ""
            print(f"{verb} {i} {src.name} {im.width}x{im.height}, {note}{warn}\n"
                  f"          -> {rel(t['single'])} {w}x{h}")
            if a.apply:
                save(shaped.resize((w, h), LANCZOS), t["single"])
        else:
            full = cap(im)
            tw = min(t["thumb_w"], shaped.width)
            th = max(1, round(tw / t["ratio"]))
            warn = "; warning: fewer pixels than the current full image" if im.width * im.height < t["full_pixels"] else ""
            print(f"{verb} {i} {src.name} {im.width}x{im.height}, {note}{warn}\n"
                  f"          -> {rel(t['full'])} {full.width}x{full.height}\n"
                  f"          -> {rel(t['thumb'])} {tw}x{th}")
            if a.apply:
                save(full, t["full"])
                save(shaped.resize((tw, th), LANCZOS), t["thumb"])
        if a.apply:
            done = tmp / "done"
            done.mkdir(exist_ok=True)
            shutil.move(str(src), str(done / src.name))
        placed += 1

    if not found and not problems:
        print("assets/tmp/ has nothing to place")
        return
    print(f"\n{placed} {'placed' if a.apply else 'ready'}, {problems} skipped"
          + ("" if a.apply else "; dry run, add --apply to write"))


if __name__ == "__main__":
    main()
