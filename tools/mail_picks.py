#!/usr/bin/env python3
"""11-27 형님: "영수증 같은 잠깐의 찬스에도 상품광고가 같이 가는 게 좋다."
Top items per category for the 'You might also like' row in customer e-mails → server/mail_picks.json.
E-mail needs JPG (Outlook can't show webp), so only items with the CJ jpg (img_src). Re-run after feed changes, then redeploy."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
feed = json.load(open(os.path.join(ROOT, 'products/feed.json')))
BROKEN = {'cj-08363264', 'cj-B23DE92B', 'cj-039001CF'}
out = {}
for cat in ('pajamas', 'acc'):
    xs = [p for p in feed if p['src'] == 'pd' and p['cat'] == cat and p.get('img_src') and p['id'] not in BROKEN]
    xs.sort(key=lambda p: -(p.get('pop') or 0))
    out[cat] = [{'id': p['id'], 'name': p['name'], 'price': p['price'], 'img': p['img_src']} for p in xs[:24]]
json.dump(out, open(os.path.join(ROOT, 'server/mail_picks.json'), 'w'), indent=1, ensure_ascii=False)
print({k: len(v) for k, v in out.items()})
