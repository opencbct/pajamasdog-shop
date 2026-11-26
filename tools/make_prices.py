#!/usr/bin/env python3
"""Per-size/color prices for the site, from server/catalog.json (the prices Stripe charges).
Writes products/prices.json = {id: {"c": [colors], "one": bool, "v": {variant key: cents}}} for items whose price varies.
Run after any catalog change: python3 tools/make_prices.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
out = {k: {'c': p.get('colors') or [], 'one': not p.get('sizes'), 'v': p['vprice']}
       for k, p in cat.items() if p.get('vprice') and len(set(p['vprice'].values())) > 1}
json.dump(out, open(os.path.join(ROOT, 'products/prices.json'), 'w'), separators=(',', ':'))
print('items with size/color prices:', len(out))
