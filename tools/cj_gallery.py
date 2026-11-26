#!/usr/bin/env python3
"""11-26: extra photos per item (other angles / details) for the product-page thumbnail row.
Asks CJ for each item's productImage list, keeps up to 6 extra pictures (skips the main one),
saves small webp files to img/cj/g/<id>_<n>.webp and writes products/gallery.json = {id: [paths]}.
Re-run safe: skips items already done."""
import json, os, io, time, urllib.request
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
FEED = {p['id']: p for p in json.load(open(os.path.join(ROOT, 'products/feed.json')))}
OUT = os.path.join(ROOT, 'img/cj/g'); os.makedirs(OUT, exist_ok=True)
JSON_OUT = os.path.join(ROOT, 'products/gallery.json')
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/pajamasdog/cj.env')) if '=' in l)

def post(url, body):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json'}), timeout=30))
TOKEN = post('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {'apiKey': env['CJ_API_KEY']})['data']['accessToken']

def get(url):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'CJ-Access-Token': TOKEN}), timeout=30))
        except Exception: time.sleep(3 + i * 3)
    return {}

def save(url, dst):
    if os.path.exists(dst): return True
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
        im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((720, 720), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=76, method=5); return True
    except Exception as e:
        print('  img fail', e); return False

out = json.load(open(JSON_OUT)) if os.path.exists(JSON_OUT) else {}
items = [(k, v) for k, v in CAT.items() if k.startswith('cj-') and v.get('cj_pid') and k in FEED]
print('items:', len(items))
for n, (pid, it) in enumerate(items):
    if pid in out: continue
    d = (get(f"https://developers.cjdropshipping.com/api2.0/v1/product/query?pid={it['cj_pid']}").get('data') or {})
    imgs = d.get('productImageSet') or d.get('productImage') or []
    if isinstance(imgs, str):
        try: imgs = json.loads(imgs)
        except Exception: imgs = [imgs]
    main = (FEED[pid].get('img_src') or '').split('?')[0]
    seen, paths = set(), []
    for u in imgs:
        u = str(u).split('?')[0]
        if not u.startswith('http') or u == main or u in seen: continue
        seen.add(u)
        dst = os.path.join(OUT, f'{pid}_{len(paths)}.webp')
        if save(u, dst): paths.append(f'img/cj/g/{pid}_{len(paths)}.webp')
        if len(paths) >= 6: break
    out[pid] = paths
    if n % 25 == 0:
        print(n, pid, len(paths)); json.dump(out, open(JSON_OUT, 'w'))
    time.sleep(1.1)
json.dump(out, open(JSON_OUT, 'w'))
print('done', sum(1 for v in out.values() if v), 'items with extra photos')
