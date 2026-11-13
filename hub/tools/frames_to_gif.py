#!/usr/bin/env python3
"""Assembles the PNG frames written by page_gif.mjs into one looping GIF (needs Pillow).
usage: frames_to_gif.py <frames dir> <out.gif>   (the dir holds frames.json: [{"file": "0001.png", "ms": 120}, ...])"""
import json, sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
frames = json.loads((src / 'frames.json').read_text())
images = [Image.open(src / f['file']).convert('RGB').quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
images[0].save(out, save_all=True, append_images=images[1:], duration=[f['ms'] for f in frames], loop=0, optimize=True, disposal=1)
print(f'{out} {out.stat().st_size // 1024} KB, {len(images)} frames, {sum(f["ms"] for f in frames) / 1000:.1f} s')
