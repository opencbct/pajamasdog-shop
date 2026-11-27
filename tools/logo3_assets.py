#!/usr/bin/env python3
"""11-27 형님: new "pajamas.Dog" logo. Animation → header + footer; still PNG → product cards and everything else.
Sources (iCloud Coding/Logo/pajamasDog): 'pajamasdog_classic_transparent (1).webp' (animated, 253 frames),
'pajamas.dog.png' (still), favicon.ico + pajamasdog_favicon_skyblue.png."""
import os, shutil
from PIL import Image, ImageSequence
SRC = os.path.expanduser('~/Library/Mobile Documents/com~apple~CloudDocs/Coding/Logo/pajamasDog')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = os.path.join(ROOT, 'img/logo2')

# 1. Animated header/footer logo: crop to the union of all frames' content, 440 px wide, transparent, looping.
anim = Image.open(os.path.join(SRC, 'pajamasdog_classic_transparent (1).webp'))
frames, durs, box = [], [], None
for f in ImageSequence.Iterator(anim):
    fr = f.convert('RGBA'); frames.append(fr); durs.append(f.info.get('duration', 40) or 40)
    b = fr.getbbox()
    if b: box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
W = 440
out = []
for fr in frames:
    c = fr.crop(box); out.append(c.resize((W, round(W * c.height / c.width)), Image.LANCZOS))
out[0].save(os.path.join(L, 'anim3.webp'), save_all=True, append_images=out[1:], duration=durs, loop=0, quality=80, method=6)
out[-1].save(os.path.join(L, 'anim3_still.webp'), quality=90)    # reduced-motion / poster
print('anim3.webp', out[0].size, len(out), 'frames', os.path.getsize(os.path.join(L, 'anim3.webp')) // 1024, 'KB')

# 2. Still logo (white "pajamas" letters → for dark backgrounds): cropped, 900 px + small tab for product cards.
st = Image.open(os.path.join(SRC, 'pajamas.dog.png')).convert('RGBA'); st = st.crop(st.getbbox())
st.resize((900, round(900 * st.height / st.width)), Image.LANCZOS).save(os.path.join(L, 'logo3.png'), optimize=True)
st.resize((round(60 * st.width / st.height), 60), Image.LANCZOS).save(os.path.join(L, 'tab3.png'), optimize=True)
# 3. E-mail logo: same still on our dark plate (white letters need dark), JPG for Outlook.
em = st.resize((560, round(560 * st.height / st.width)), Image.LANCZOS)
plate = Image.new('RGB', (em.width + 80, em.height + 60), (21, 19, 28)); plate.paste(em, (40, 30), em)
plate.save(os.path.join(L, 'logo3_mail.jpg'), quality=90)
print('logo3.png / tab3.png / logo3_mail.jpg', st.size)

# 4. Favicon set from his files.
shutil.copy(os.path.join(SRC, 'favicon.ico'), os.path.join(ROOT, 'favicon.ico'))
fav = Image.open(os.path.join(SRC, 'pajamasdog_favicon_skyblue.png')).convert('RGBA')
for name, s in (('icon-512.png', 512), ('icon-192.png', 192), ('icon-32.png', 32)):
    fav.resize((s, s), Image.LANCZOS).save(os.path.join(ROOT, 'img', name), optimize=True)
bg = Image.new('RGBA', (180, 180), (21, 19, 28, 255)); bg.alpha_composite(fav.resize((180, 180), Image.LANCZOS))
bg.convert('RGB').save(os.path.join(ROOT, 'img/apple-touch-icon.png'), optimize=True)
print('favicons done')
