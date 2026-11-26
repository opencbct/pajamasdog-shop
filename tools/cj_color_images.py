#!/usr/bin/env python3
"""11-26: one picture per colour. For each of our CJ items with 2+ colours, ask CJ for its variants,
take the variant image of each colour, save a small webp to img/cj/c/<id>_<colourIndex>.webp,
and write products/colorimgs.json = {id: [path or null, ...]} (same order as the item's colours).
product.html swaps the big picture when a colour is tapped. Re-run safe: skips files that exist."""
import json, os, io, time, urllib.request
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
OUT = os.path.join(ROOT, 'img/cj/c'); os.makedirs(OUT, exist_ok=True)
JSON_OUT = os.path.join(ROOT, 'products/colorimgs.json')
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/pajamasdog/cj.env')) if '=' in l)

def post(url, body):
    r = urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=30))
TOKEN = post('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {'apiKey': env['CJ_API_KEY']})['data']['accessToken']

def get(url):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'CJ-Access-Token': TOKEN}), timeout=30))
        except Exception as e:
            time.sleep(3 + i * 3)
    return {}

def save(url, dst):
    if os.path.exists(dst): return True
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
        im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((720, 720), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=78, method=5); return True
    except Exception as e:
        print('  img fail', e); return False

out = json.load(open(JSON_OUT)) if os.path.exists(JSON_OUT) else {}
items = [(k, v) for k, v in CAT.items() if k.startswith('cj-') and v.get('cj_pid') and len(v.get('colors') or []) > 1]
print('items with colours:', len(items))
for n, (pid, it) in enumerate(items):
    if pid in out: continue
    j = get(f"https://developers.cjdropshipping.com/api2.0/v1/product/query?pid={it['cj_pid']}")
    vs = (j.get('data') or {}).get('variants') or []
    paths = []
    for ci, color in enumerate(it['colors']):
        img = next((v.get('variantImage') for v in vs if v.get('variantImage') and (
            (v.get('variantKey') or '') == color or (v.get('variantKey') or '').startswith(color + '-'))), None)
        dst = os.path.join(OUT, f'{pid}_{ci}.webp')
        paths.append(f'img/cj/c/{pid}_{ci}.webp' if img and save(img, dst) else None)
    # all colours sharing one picture = no point swapping
    out[pid] = paths if len({p and os.path.getsize(os.path.join(ROOT, p)) for p in paths}) > 1 else []
    if n % 20 == 0:
        print(n, pid, sum(1 for p in paths if p), '/', len(paths)); json.dump(out, open(JSON_OUT, 'w'))
    time.sleep(1.1)  # CJ free tier: about 1 request per second
json.dump(out, open(JSON_OUT, 'w'))
print('done', sum(1 for v in out.values() if v), 'items with colour pictures')
