#!/usr/bin/env python3
"""Write p['pop'] = how many shops carry this item on CJ (CJ listedNum) into products/feed.json.
Honest social proof before we have our own sales. Run after cj_import/cj_merge."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(ROOT, 'server/catalog.json')))['items']
listed = {o['pid']: o.get('listed') or 0 for o in json.load(open(os.path.join(ROOT, 'tools/out/cj_items.json')))}
fp = os.path.join(ROOT, 'products/feed.json'); feed = json.load(open(fp)); n = 0
for p in feed:
    v = listed.get(cat.get(p['id'], {}).get('cj_pid'))
    if p.get('src') == 'pd' and v: p['pop'] = v; n += 1
json.dump(feed, open(fp, 'w'), ensure_ascii=False, indent=1)
print('pop set on', n)
