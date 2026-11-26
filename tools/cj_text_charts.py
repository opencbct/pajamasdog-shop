#!/usr/bin/env python3
"""11-26: size charts that CJ wrote as TEXT in the product description (about 1 in 4 items).
Reads "Bust Back length Neck ... XS 30 17 22 S 35 22 25 ..." style tables, keeps only clean ones
(cm, numbers rise with size, every size of our item found), and writes sizes_extra.js:
  window.SIZES_EXTRA = {id: {by:'chest', rows:[[size, chest, neck, back], ...], src:'cj-text'}}
Items that already have a chart in sizes_data.js are skipped. Charts only in pictures are not read here."""
import json, os, re, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
FEED = {p['id']: p for p in json.load(open(os.path.join(ROOT, 'products/feed.json')))}
have = set(json.loads(re.search(r'window\.SIZES = (\{.*?\});', open(os.path.join(ROOT, 'sizes_data.js')).read(), re.S).group(1)).keys())
OUT = os.path.join(ROOT, 'sizes_extra.js')
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/pajamasdog/cj.env')) if '=' in l)

def post(url, body):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json'}), timeout=30))
TOKEN = post('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {'apiKey': env['CJ_API_KEY']})['data']['accessToken']
def get(url):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'CJ-Access-Token': TOKEN}), timeout=30))
        except Exception: time.sleep(3 + i * 3)
    return {}

SIZE = r'(XXXS|XXS|XS|XXXL|XXL|XL|[2-6]XL|S|M|L)'
norm = lambda z: {'XXL': '2XL', 'XXXL': '3XL'}.get(z.upper(), z.upper())
COLS = [('chest', r'bust|chest|girth'), ('neck', r'neck'), ('back', r'back|length'), ('kg', r'weight'), ('skip', r'height|waist|leg|sleeve|foot|size')]

def parse(text, sizes):
    if re.search(r'\binch', text, re.I) and not re.search(r'\bcm\b', text, re.I): return None
    for m in re.finditer(r'((?:(?:bust|chest|girth|neck(?: circumference| girth)?|back(?: length)?|length|weight|height|waist)\s*(?:\(cm\)|\(kg\)|/cm|cm|kg)?\s*){2,5})' + SIZE + r'\s+\d', text, re.I):
        head = m.group(1).lower()
        cols = []
        for w in re.findall(r'neck(?: circumference| girth)?|back(?: length)?|bust|chest|girth|length|weight|height|waist', head):
            k = next(k for k, rx in COLS if re.search(rx, w))
            if k == 'back' and cols and cols[-1] == 'back': continue
            cols.append(k)
        if 'chest' not in cols: continue
        body = text[m.start(2):m.start(2) + 600]
        rows = {}
        for r in re.finditer(SIZE + r'((?:\s+\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?){%d})(?!\s*\d)' % len(cols), body):
            nums = [float(x.split('-')[-1]) for x in re.findall(r'\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?', r.group(2).replace(' - ', '-'))]
            if len(nums) != len(cols): continue
            v = dict(zip(cols, nums)); rows.setdefault(norm(r.group(1)), v)
        want = [norm(z) for z in sizes]
        if not all(z in rows for z in want): continue
        chest = [rows[z]['chest'] for z in want]
        if any(b <= a for a, b in zip(chest, chest[1:])) or chest[0] < 15 or chest[-1] > 130: continue
        return [[z0, rows[norm(z0)]['chest'], rows[norm(z0)].get('neck'), rows[norm(z0)].get('back')] for z0 in sizes]
    return None

extra = {}
items = [(k, v) for k, v in CAT.items() if k not in have and v.get('cj_pid') and (v.get('sizes') or []) and FEED.get(k, {}).get('cat') == 'pajamas']
print('items to check:', len(items))
for n, (pid, it) in enumerate(items):
    d = get(f"https://developers.cjdropshipping.com/api2.0/v1/product/query?pid={it['cj_pid']}").get('data') or {}
    text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', d.get('description') or ''))
    rows = parse(text, it['sizes'])
    if rows: extra[pid] = {'by': 'chest', 'rows': rows, 'src': 'cj-text'}
    if n % 20 == 0: print(n, pid, 'ok' if rows else '-', len(extra))
    time.sleep(1.1)
open(OUT, 'w').write('// Size charts read from CJ description text (tools/cj_text_charts.py). Merged into window.SIZES by sizefinder.js.\n'
                     'window.SIZES_EXTRA = ' + json.dumps(extra, separators=(',', ':')) + ';\n')
print('done', len(extra), 'charts from text')
