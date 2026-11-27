#!/usr/bin/env python3
"""11-27 형님: "바코드 커스텀 디자인 되니? 로고를 가운데 넣자"
Branded QR: rounded dots + PajamasDog logo in the middle (error correction H, so the logo hole still scans).
  python3 tools/brand_qr.py https://pajamas.dog img/qr/pajamas_dog.png
Every QR is test-read with OpenCV before it is saved; a QR that doesn't read is never written."""
import sys, os
import qrcode, cv2, numpy as np
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer, CircleModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1] if len(sys.argv) > 1 else 'https://pajamas.dog'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'img/qr/pajamas_dog.png')
INK, BG = (21, 19, 28), (255, 255, 255)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=24, border=3)
qr.add_data(url); qr.make(fit=True)
img = qr.make_image(image_factory=StyledPilImage, module_drawer=RoundedModuleDrawer(radius_ratio=1),
                    eye_drawer=RoundedModuleDrawer(radius_ratio=0.6),
                    color_mask=SolidFillColorMask(back_color=BG, front_color=INK)).convert('RGBA')
W = img.size[0]

# Logo badge in the middle: the dark classic logo on a rounded plate with a white ring (≈ 36% wide, ≈ 15% tall).
logo = Image.open(os.path.join(ROOT, 'img/logo2/classic.jpg')).convert('RGBA')
lw = int(W * 0.36); lh = int(lw * logo.size[1] / logo.size[0])
logo = logo.resize((lw, lh), Image.LANCZOS)
pad = int(W * 0.018)
plate = Image.new('RGBA', (lw + 2 * pad, lh + 2 * pad), (0, 0, 0, 0))
ImageDraw.Draw(plate).rounded_rectangle([0, 0, plate.size[0] - 1, plate.size[1] - 1], radius=int(lh * 0.32), fill=BG)
mask = Image.new('L', (lw, lh), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, lw - 1, lh - 1], radius=int(lh * 0.24), fill=255)
plate.paste(logo, (pad, pad), mask)
img.alpha_composite(plate, ((W - plate.size[0]) // 2, (W - plate.size[1]) // 2))

# Test-read it.
arr = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2BGR)
got, _, _ = cv2.QRCodeDetector().detectAndDecode(arr)
if got != url:
    sys.exit(f'QR did NOT read back (got {got!r}) — not saved')
os.makedirs(os.path.dirname(out), exist_ok=True)
img.convert('RGB').save(out, optimize=True)
print('ok', out, img.size, 'reads as', got)
