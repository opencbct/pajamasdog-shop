#!/usr/bin/env python3
"""11-27 형님: "좋네.. 근데 작네" — the logo inside a QR can't grow past ~46% or it stops scanning,
so this card puts a BIG logo on top and the QR (small logo in the middle) under it. High-res for print.
  python3 tools/brand_qr_card.py https://pajamas.dog img/qr/pajamas_dog_card.png"""
import os, subprocess, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1] if len(sys.argv) > 1 else 'https://pajamas.dog'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'img/qr/pajamas_dog_card.png')
tmp = out + '.qr.png'
subprocess.run([sys.executable, os.path.join(ROOT, 'tools/brand_qr.py'), url, tmp], check=True, env={**os.environ, 'LOGO': '0.46'})

W = 1600; qr = Image.open(tmp).convert('RGBA').resize((1300, 1300), Image.NEAREST); os.remove(tmp)
logo = Image.open(os.path.join(ROOT, 'img/logo2/ink.png')).convert('RGBA')
lw = 1300; lh = int(lw * logo.size[1] / logo.size[0]); logo = logo.resize((lw, lh), Image.LANCZOS)
H = 120 + lh + 60 + qr.size[1] + 120
card = Image.new('RGBA', (W, H), (255, 255, 255, 255))
card.alpha_composite(logo, ((W - lw) // 2, 120))
card.alpha_composite(qr, ((W - qr.size[0]) // 2, 120 + lh + 60))
card.convert('RGB').save(out, optimize=True)
print('ok', out, card.size)
