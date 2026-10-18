#!/usr/bin/env python3
"""Build the pet's browser bundle from the DeepSeek Chibi sprite pack.

The Harness serves a client plugin as JavaScript only — a plugin package cannot
fetch its own PNG files over HTTP — so the sprites travel inside `client.js` as
data URIs. This script:

  1. reads the ten `<state>/animation.json` manifests,
  2. resizes each 512x560 frame to a display-sized frame and packs the six
     poses of one state into a 3x2 atlas (the layout the pack specifies),
  3. encodes each atlas as WebP with alpha,
  4. writes `client.js` = `src/pet-client.js` with its `/*@__SPRITES@*/` marker
     replaced by the generated table.

`src/pet-client.js` stays the editable source of truth: the marker survives, so
the script is idempotent and can be re-run after every edit.

Usage:
    python3 tools/build_sprites.py --pack /path/to/deepseek-chibi
    python3 tools/build_sprites.py --zip  /path/to/deepseek-chibi-all-10-animations.zip

Requires Python 3 and Pillow (`pip install Pillow`).
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guidance only
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "pet-client.js"
TARGET = ROOT / "client.js"
MARKER = "/*@__SPRITES@*/ null"
IDENTITY = "/*@__MODULE_ID@*/ 'dsh-chibi-pet'"

COLUMNS = 3
ROWS = 2
FRAME_WIDTH = 512
FRAME_HEIGHT = 560


def resolve_pack(args: argparse.Namespace) -> tuple[Path, tempfile.TemporaryDirectory | None]:
    """Return the directory holding `collection.json` (extracting the zip if asked)."""
    if args.pack:
        pack = Path(args.pack).expanduser().resolve()
        if not (pack / "collection.json").is_file():
            sys.exit(f"not a sprite pack (no collection.json): {pack}")
        return pack, None

    zip_path = Path(args.zip).expanduser().resolve()
    if not zipfile.is_zipfile(zip_path):
        sys.exit(f"not a zip archive: {zip_path}")
    scratch = tempfile.TemporaryDirectory(prefix="dsh-pet-pack-")
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(scratch.name)
    for candidate in sorted(Path(scratch.name).rglob("collection.json")):
        return candidate.parent, scratch
    sys.exit(f"no collection.json inside {zip_path}")


def build_state(pack: Path, state: str, frame_width: int, quality: int) -> dict:
    """Resize, pack and encode one state; return its generated table entry."""
    folder = pack / state
    manifest = json.loads((folder / "animation.json").read_text(encoding="utf-8"))
    frames = manifest["frames"]
    if len(frames) != COLUMNS * ROWS:
        sys.exit(f"{state}: expected {COLUMNS * ROWS} frames, found {len(frames)}")

    scale = frame_width / FRAME_WIDTH
    width = round(FRAME_WIDTH * scale)
    height = round(FRAME_HEIGHT * scale)

    atlas = Image.new("RGBA", (width * COLUMNS, height * ROWS), (0, 0, 0, 0))
    order = {frame["id"]: index for index, frame in enumerate(frames)}
    for index, frame in enumerate(frames):
        image = Image.open(folder / frame["file"]).convert("RGBA")
        if image.size != (FRAME_WIDTH, FRAME_HEIGHT):
            sys.exit(f"{state}: unexpected frame size {image.size}")
        resized = image.resize((width, height), Image.LANCZOS)
        atlas.paste(resized, ((index % COLUMNS) * width, (index // COLUMNS) * height))

    buffer = io.BytesIO()
    atlas.save(buffer, format="WEBP", quality=quality, method=6, alpha_quality=90)
    encoded = buffer.getvalue()

    playback = manifest["playback"]
    unknown = [step["frame"] for step in playback["sequence"] if step["frame"] not in order]
    if unknown:
        sys.exit(f"{state}: playback references unknown frames: {unknown}")
    # Atlas index + duration per timed step; repeated poses are intentional.
    sequence = [[order[step["frame"]], int(step["durationMs"])] for step in playback["sequence"]]
    # `working` ships baseFrameDurationMs/loopDurationMs instead of durationMs.
    duration = playback.get("durationMs")
    if duration is None:
        duration = sum(step[1] for step in sequence)

    return {
        "file": "data:image/webp;base64," + base64.b64encode(encoded).decode("ascii"),
        "loop": bool(playback["loop"]),
        "durationMs": int(duration),
        "sequence": sequence,
        "poses": len(frames),
        "atlas": [width * COLUMNS, height * ROWS],
        "bytes": len(encoded),
    }


def render_table(collection: dict, states: dict, frame_width: int) -> str:
    """Emit the sprite table as a compact JS object literal."""
    lines = ["{"]
    lines.append(
        f"  frameWidth: {frame_width}, frameHeight: {round(FRAME_HEIGHT * frame_width / FRAME_WIDTH)},"
        f" columns: {COLUMNS}, rows: {ROWS}, displayWidth: {round(frame_width / 2)},"
    )
    lines.append("  states: {")
    for state in [entry["id"] for entry in collection["states"]]:
        entry = states[state]
        sequence = ",".join(f"[{index},{duration}]" for index, duration in entry["sequence"])
        lines.append(
            f"    {json.dumps(state)}: {{ src: {json.dumps(entry['file'])}, "
            f"loop: {'true' if entry['loop'] else 'false'}, "
            f"durationMs: {entry['durationMs']}, sequence: [{sequence}] }},"
        )
    lines.append("  },")
    lines.append("}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pack", help="extracted deepseek-chibi directory")
    source.add_argument("--zip", help="deepseek-chibi-all-10-animations.zip")
    parser.add_argument("--frame-width", type=int, default=224, help="source frame width baked into the atlas (default 224)")
    parser.add_argument("--quality", type=int, default=86, help="WebP quality (default 86)")
    args = parser.parse_args()

    pack, scratch = resolve_pack(args)
    try:
        collection = json.loads((pack / "collection.json").read_text(encoding="utf-8"))
        template = SOURCE.read_text(encoding="utf-8")
        if MARKER not in template:
            sys.exit(f"marker {MARKER!r} not found in {SOURCE}")

        # The browser module id must equal the package name, or the Host's
        # client-module graph cannot resolve the row. Stamp it from the manifest
        # so the two can never drift.
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        name = package["name"]
        if IDENTITY not in template:
            sys.exit(f"marker {IDENTITY!r} not found in {SOURCE}")
        template = template.replace(IDENTITY, f"/*@__MODULE_ID@*/ {json.dumps(name)}", 1)

        states = {}
        total = 0
        for entry in collection["states"]:
            states[entry["id"]] = build_state(pack, entry["id"], args.frame_width, args.quality)
            total += states[entry["id"]]["bytes"]

        bundle = template.replace(MARKER, render_table(collection, states, args.frame_width), 1)
        TARGET.write_text(bundle, encoding="utf-8")

        print(f"pack      {pack}")
        print(f"module    {name}")
        print(f"states    {len(states)} ({', '.join(states)})")
        print(f"atlases   {total / 1024:.0f} KiB encoded, {TARGET.stat().st_size / 1024:.0f} KiB bundle")
        print(f"written   {TARGET.relative_to(ROOT)}")
    finally:
        if scratch is not None:
            shutil.rmtree(scratch.name, ignore_errors=True)


if __name__ == "__main__":
    main()
