#!/usr/bin/env python3
"""Pick, per product, the logo badge that stands out best on that product photo's top-left corner.
Writes p['badge'] = '07' etc. into products/feed.json. Run after adding products."""
import json, glob, os, io, urllib.request, hashlib, colorsys
from PIL import Image, ImageStat
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lum = lambda c: (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255
def contrast(a, b):
    la, lb = lum(a) + .05, lum(b) + .05
    return max(la, lb) / min(la, lb)
badges = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'img/badge_*.png'))):
    im = Image.open(f).convert('RGBA'); px = [p for p in im.get_flattened_data() if p[3] > 128] if hasattr(im,'get_flattened_data') else [p for p in im.getdata() if p[3] > 128]
    # use the darkest-quartile and the average: a logo reads if its main ink contrasts
    avg = tuple(sum(p[i] for p in px)/len(px) for i in range(3))
    badges[os.path.basename(f)[6:8]] = avg
def corner(path):
    if path.startswith('http'):
        data = urllib.request.urlopen(urllib.request.Request(path, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read(); im = Image.open(io.BytesIO(data))
    else:
        im = Image.open(os.path.join(ROOT, path.split('?')[0]))
    im = im.convert('RGB'); w, h = im.size
    side = min(w, h); im = im.crop(((w-side)//2, (h-side)//2, (w+side)//2, (h+side)//2))   # cards show a centered square
    reg = im.crop((0, 0, int(side*.8), int(side*.22)))
    st = ImageStat.Stat(reg); return tuple(st.mean), sum(st.stddev)/3
feed_path = os.path.join(ROOT, 'products/feed.json'); feed = json.load(open(feed_path))
for p in feed:
    if not p.get('img'): continue
    try: bg, busy = corner(p['img'])
    except Exception as e: print('skip', p['id'], e); continue
    scored = sorted(((contrast(bg, c), k) for k, c in badges.items()), reverse=True)
    best = scored[0][0]; top = [k for s, k in scored if s >= min(2.6, best * .8)]   # every logo readable on this background
    p['badge'] = top[int(hashlib.md5(p['id'].encode()).hexdigest(), 16) % len(top)]
    print(f"{p['id'][:22]:22} bg L={lum(bg):.2f} busy={busy:4.0f} -> {p['badge']} (contrast {best:.1f})")
json.dump(feed, open(feed_path, 'w'), indent=1, ensure_ascii=False)
