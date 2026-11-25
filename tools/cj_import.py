#!/usr/bin/env python3
"""Pull curated pet products from CJ Dropshipping -> tools/out/cj_items.json.

Slow on purpose (CJ blocks fast calls). Picks the most-listed (proven) items per category,
skips cheap junk, reads variants (color/size), size charts and US shipping, and prices at
(cost + shipping) x 2.3, ending .99, minimum $14.99 (형님 2026-11-24).
Run: python3 -I tools/cj_import.py [--per 20]
"""
import json, math, os, re, sys, time, html, urllib.request, urllib.error

API = 'https://developers.cjdropshipping.com/api2.0/v1'
TOKEN = (lambda d: d.get('accessToken') or d.get('data', {}).get('accessToken', ''))(
    json.load(open(os.path.expanduser('~/.config/pajamasdog/cj_token.json'))))
OUT = os.path.join(os.path.dirname(__file__), 'out'); os.makedirs(OUT, exist_ok=True)
MARKUP, MIN_PRICE, MIN_COST, MIN_LISTED = 2.3, 14.99, 2.5, 10
# the product name must mention one of these, so a lint roller never lands in "hair clips"
MUST = {'hairclip': ('hair', 'clip', 'headband', 'barrette', 'bow'), 'tie': ('tie', 'bow'), 'necklace': ('necklace', 'pendant', 'tag'),
        'hat': ('hat', 'cap', 'beanie', 'headwear'), 'glasses': ('glasses', 'goggle', 'sunglass'), 'collar': ('collar',),
        'leash': ('leash', 'lead'), 'harness': ('harness', 'vest'), 'bowl': ('bowl', 'feeder', 'fountain', 'dispenser'),
        'toy': ('toy', 'plush', 'ball', 'chew'), 'bed': ('bed', 'nest', 'cushion', 'sofa'), 'blanket': ('blanket', 'quilt', 'mat'),
        'socks': ('sock', 'shoe', 'boot'), 'scarf': ('scarf', 'bandana', 'bib'), 'carrier': ('carrier', 'bag', 'backpack')}
price_of = lambda c: round(max(MIN_PRICE, math.ceil(c * MARKUP) - 0.01), 2)
PER = int(sys.argv[sys.argv.index('--per') + 1]) if '--per' in sys.argv else 20

# CJ category id -> (our cat, our tag)
CATS = {
  '2410110349341618600': ('pajamas', 'pajamas'), '2410110348271614500': ('pajamas', 'tops'),
  '2410110348401611500': ('pajamas', 'sweater'), '2410110348531624100': ('pajamas', 'hoodie'),
  '2410110349061619800': ('pajamas', 'coat'),    '2410110349201623700': ('pajamas', 'jumpsuit'),
  '2410110348131619300': ('pajamas', 'dress'),   '2410110350161600700': ('pajamas', 'set'),
  '2410110350311612500': ('pajamas', 'coat'),    '2410110350451606900': ('acc', 'socks'),
  '2410110350591620800': ('acc', 'scarf'),       '2410110351231616600': ('acc', 'hairclip'),
  '2410110351401621300': ('acc', 'tie'),         '2410110351521627800': ('acc', 'necklace'),
  '2410110352051607900': ('acc', 'hat'),         '2410110352191611200': ('acc', 'glasses'),
  '2410110352331629800': ('acc', 'collar'),      '2410110352471611400': ('acc', 'leash'),
  '2410110352591600400': ('acc', 'harness'),     '2410110341061612000': ('home', 'bowl'),
  '2410110341451628800': ('home', 'bowl'),       '2410110340531618900': ('home', 'toy'),
  '2410110358051626100': ('home', 'bed'),        '2410110358191601900': ('home', 'blanket'),
  '2410110342571606700': ('acc', 'carrier'),
}

last = [0.0]
def call(path, body=None, tries=4):
    for t in range(tries):
        wait = 1.4 - (time.time() - last[0])
        if wait > 0: time.sleep(wait)
        last[0] = time.time()
        req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
              headers={'CJ-Access-Token': TOKEN, 'content-type': 'application/json'}, method='POST' if body else 'GET')
        try:
            with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read() or b'{}')
            if d.get('success') or d.get('code') == 200: return d.get('data')
            print('  cj:', d.get('message'), file=sys.stderr)
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            print('  retry', path[:40], e, file=sys.stderr)
        time.sleep(5 * (t + 1))
    return None

lo = lambda s: float(str(s).split('--')[0].strip() or 0) if s not in (None, '') else 0.0

def clean_name(n):
    n = re.sub(r'\b(new|hot|sale|wholesale|cross[- ]border|amazon|explosive|factory|autumn and winter|spring and summer|four[- ]legged|ins style)\b', '', n, flags=re.I)
    n = re.sub(r'\s+', ' ', n).strip(' ,-')
    words = n.split(); n = ' '.join(words[:7])
    return n[:1].upper() + n[1:]

def size_chart(desc):
    """Best effort: rows like 'S 30 47 31' after a header with Back/Chest/Bust/Neck."""
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', desc or '')))
    m = re.search(r'(back length|length|bust|chest)[^.]{0,200}', t, re.I)
    if not m: return None
    head = t[m.start(): m.start() + 160].lower()
    order = [k for k, _ in sorted(((k, head.find(w)) for k, w in (('back', 'length'), ('chest', 'bust'), ('chest2', 'chest'), ('neck', 'neck')) if head.find(w) >= 0), key=lambda x: x[1])]
    order = ['chest' if k == 'chest2' else k for k in order]
    seen = []; [seen.append(k) for k in order if k not in seen]
    rows = re.findall(r'\b(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL)\s+(\d+(?:\.\d+)?)\s*(?:cm)?\s+(\d+(?:\.\d+)?)\s*(?:cm)?(?:\s+(\d+(?:\.\d+)?))?', t[m.start():])
    if len(rows) < 2 or not seen: return None
    out = []
    for z, a, b, c in rows:
        vals = dict(zip(seen, [float(a), float(b)] + ([float(c)] if c else [])))
        if 'chest' not in vals: return None
        out.append([z, vals.get('chest'), vals.get('neck'), vals.get('back')])
    return {'by': 'chest', 'rows': out}

def ship_cost(vid):
    d = call('/logistic/freightCalculate', {'startCountryCode': 'CN', 'endCountryCode': 'US', 'products': [{'quantity': 1, 'vid': vid}]})
    opts = [o for o in (d or []) if o.get('logisticPrice') is not None]
    pref = [o for o in opts if 'CJPacket' in (o.get('logisticName') or '')] or opts
    if not pref: return None
    o = min(pref, key=lambda o: float(o['logisticPrice']))
    return float(o['logisticPrice']), o.get('logisticName'), o.get('logisticAging')

items = []
def add(p, cat, tag):
    det = call(f"/product/query?pid={p['pid']}")
    if not det: return
    vars_ = det.get('variants') or []
    if not vars_: return
    top = max(vars_, key=lambda v: float(v.get('variantSellPrice') or 0))
    sc = ship_cost(top['vid'])
    if not sc: return
    cost = float(top.get('variantSellPrice') or 0) + sc[0]
    price = price_of(cost)
    variants, colors, sizes, vprice = {}, [], [], {}
    for v in vars_:
        key = (v.get('variantKey') or '').strip() or 'Default'
        parts = [x.strip() for x in key.split('-') if x.strip()]
        if len(parts) >= 2: col, size = parts[0], parts[1]
        elif parts and re.fullmatch(r'(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL|\d+(\.\d+)?(cm|CM)?)', parts[0]): col, size = 'Default', parts[0]
        else: col, size = (parts[0] if parts else 'Default'), ''
        k = f'{col}-{size}' if size else col
        variants[k] = v['vid']; vprice[k] = price_of(float(v.get('variantSellPrice') or 0) + sc[0])
        if col not in colors: colors.append(col)
        if size and size not in sizes: sizes.append(size)
    imgs = det.get('productImageSet') or [det.get('productImage')]
    items.append({
        'pid': p['pid'], 'cat': cat, 'tag': tag, 'cj_name': det.get('productNameEn'), 'name': clean_name(det.get('productNameEn') or ''),
        'listed': p.get('listedNum'), 'cost': round(cost, 2), 'ship': sc, 'price': min(vprice.values()) if vprice else price, 'vprice': vprice,
        'img': imgs[0] if imgs else '', 'imgs': imgs[:6], 'colors': colors, 'sizes': sizes, 'variants': variants,
        'chart': size_chart(det.get('description')) if cat == 'pajamas' else None,
        'weight_g': det.get('productWeight'),
    })
    json.dump(items, open(os.path.join(OUT, 'cj_items.json'), 'w'), indent=1, ensure_ascii=False)

# --pids FILE: import exactly these products ([[pid, cat, tag], ...]) and ADD them to cj_items.json (형님 11-25: funny costumes)
if '--pids' in sys.argv:
    items = json.load(open(os.path.join(OUT, 'cj_items.json')))
    have = {x['pid'] for x in items}
    for pid, cat, tag in json.load(open(sys.argv[sys.argv.index('--pids') + 1])):
        if pid in have: continue
        add({'pid': pid, 'listedNum': 0}, cat, tag)
else:
    for cid, (cat, tag) in CATS.items():
        cands = []
        for page in (1, 2):
            d = call(f'/product/list?categoryId={cid}&pageNum={page}&pageSize=100')
            if not d: break
            cands += d.get('list') or []
            if len(cands) >= (d.get('total') or 0): break
        good = [p for p in cands if not p.get('isTestProduct') and lo(p.get('sellPrice')) >= MIN_COST and (p.get('listedNum') or 0) >= MIN_LISTED]
        good.sort(key=lambda p: -(p.get('listedNum') or 0))
        print(f'{tag:10} {len(cands):4} found, {len(good):3} good', file=sys.stderr)
        must = MUST.get(tag)
        good = [p for p in good if not must or any(w in (p.get('productNameEn') or '').lower() for w in must)]
        good = [p for p in good if not re.search(r'\b\d+\s*pcs\b|wholesale|bulk', (p.get('productNameEn') or ''), re.I)]
        for p in good[:PER]:
            add(p, cat, tag)
print(len(items), 'items ->', os.path.join(OUT, 'cj_items.json'), file=sys.stderr)
