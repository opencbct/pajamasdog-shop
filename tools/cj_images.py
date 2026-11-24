#!/usr/bin/env python3
"""Download each CJ product photo once, save a small fast copy (max 720px webp) to img/cj/<id>.webp,
and point the feed at it. The AI try-on server also reads these (same picture, our own site)."""
import json, os, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
feed_path = os.path.join(ROOT, 'products/feed.json'); feed = json.load(open(feed_path))
OUT = os.path.join(ROOT, 'img/cj'); os.makedirs(OUT, exist_ok=True)

def one(p):
    if not str(p.get('img', '')).startswith('http') or not p['id'].startswith('cj-'): return p['id'], None
    dst = os.path.join(OUT, p['id'] + '.webp')
    if not os.path.exists(dst):
        try:
            data = urllib.request.urlopen(urllib.request.Request(p['img'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
            im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((720, 720), Image.LANCZOS)
            im.save(dst, 'WEBP', quality=80, method=5)
        except Exception as e:
            return p['id'], f'fail {e}'
    return p['id'], f'img/cj/{p["id"]}.webp'

with ThreadPoolExecutor(6) as ex: res = dict(ex.map(one, feed))
ok = 0
for p in feed:
    r = res.get(p['id'])
    if r and r.startswith('img/'): p['img_src'] = p['img']; p['img'] = r; ok += 1
    elif r: print(p['id'], r)
json.dump(feed, open(feed_path, 'w'), indent=1, ensure_ascii=False)
print('local images:', ok)
