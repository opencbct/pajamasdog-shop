#!/usr/bin/env python3
"""Real-order proof for the site: read PAID Stripe checkout sessions (read-only) -> products/orders.json.
Public fields only: item name, city, country, date. Never names, e-mails or street addresses.
Run: python3 -I tools/orders_public.py   (key read from ~/.config/pajamasdog/stripe_live.env, never printed)"""
import base64, json, os, urllib.parse, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/pajamasdog/stripe_live.env')) if '=' in l)
KEY = env['STRIPE_SECRET_KEY'].strip().strip('"\'')
CAT = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
COUNTRY = {'US': 'USA', 'CA': 'Canada', 'GB': 'UK', 'AU': 'Australia', 'NZ': 'New Zealand', 'JP': 'Japan', 'DE': 'Germany',
           'FR': 'France', 'NL': 'Netherlands', 'IE': 'Ireland', 'SG': 'Singapore', 'KR': 'Korea'}

def get(path, **q):
    r = urllib.request.Request('https://api.stripe.com/v1/' + path + '?' + urllib.parse.urlencode(q, doseq=True),
                               headers={'Authorization': 'Basic ' + base64.b64encode((KEY + ':').encode()).decode()})
    return json.load(urllib.request.urlopen(r, timeout=30))

# our own test buys (founder in Niles etc.) are never shown as customer orders
SKIP = set(open(os.path.expanduser('~/.config/pajamasdog/own_orders.txt')).read().split()) if os.path.exists(os.path.expanduser('~/.config/pajamasdog/own_orders.txt')) else set()
paid, after = [], None
while True:
    q = {'limit': 100, 'status': 'complete'}
    if after: q['starting_after'] = after
    page = get('checkout/sessions', **q)
    for s in page['data']:
        if s.get('payment_status') != 'paid' or not s.get('livemode'): continue
        md = s.get('metadata') or {}
        if not any(k.startswith('item_') for k in md): continue          # shop orders only (not AI packs)
        if s['id'] in SKIP: continue
        first = md.get('item_0', '').split('|')[0]
        addr = ((s.get('shipping_details') or s.get('collected_information', {}).get('shipping_details') or {}).get('address')
                or (s.get('customer_details') or {}).get('address') or {})
        paid.append({'item': CAT.get(first, {}).get('name', 'a PajamasDog item'), 'city': (addr.get('city') or '').title(),
                     'country': COUNTRY.get(addr.get('country'), addr.get('country') or ''), 'at': s['created'], 'sid': s['id']})
    if not page.get('has_more'): break
    after = page['data'][-1]['id']
paid.sort(key=lambda o: -o['at'])
import datetime
for o in paid: o.pop('sid', None) if not os.environ.get('SHOW_IDS') else print(o['sid'], o['city'], o['item']); o['at'] = datetime.datetime.fromtimestamp(o['at'], datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
out = {'count': len(paid), 'recent': paid[:5]}
json.dump(out, open(os.path.join(ROOT, 'products/orders.json'), 'w'), ensure_ascii=False, indent=1)
print('paid shop orders:', len(paid))
