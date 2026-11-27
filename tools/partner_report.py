#!/usr/bin/env python3
"""11-27 형님: monthly partner commission report (PayPal Business payouts are sent by 형님 by hand).
Counts paid orders tagged with a partner code (Stripe PaymentIntent metadata 'partner') that are at least 30 days old
and not refunded. Commission = 15% of what the buyer paid. Partners under $25 roll over.
  python3 tools/partner_report.py              → print the table
  python3 tools/partner_report.py --mail       → also e-mail it to orders@opencbct.com
Already-paid orders: list their PaymentIntent ids in ~/.config/pajamasdog/partner_paid.txt (one per line) after paying."""
import json, os, subprocess, sys, time, urllib.parse, urllib.request
from collections import defaultdict
RATE, MIN_PAYOUT, HOLD_DAYS = 0.15, 25.0, 30
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.config/pajamasdog/stripe_live.env')) if '=' in l and not l.startswith('#'))
KEY = env['STRIPE_SECRET_KEY']
PAID = os.path.expanduser('~/.config/pajamasdog/partner_paid.txt')
paid = set(open(PAID).read().split()) if os.path.exists(PAID) else set()

def get(path, **q):
    req = urllib.request.Request(f'https://api.stripe.com/v1/{path}?' + urllib.parse.urlencode(q, doseq=True), headers={'Authorization': f'Bearer {KEY}'})
    return json.load(urllib.request.urlopen(req))

rows, page = [], None
while True:
    q = {'query': "metadata['partner']:'*' AND status:'succeeded'", 'limit': 100, 'expand[]': 'data.latest_charge'}
    if page: q['page'] = page
    try: r = get('payment_intents/search', **q)
    except Exception as e: sys.exit(f'Stripe search failed ({e}). The key needs PaymentIntents read.')
    rows += r['data']
    if not r.get('has_more'): break
    page = r['next_page']

cut = time.time() - HOLD_DAYS * 86400
by = defaultdict(lambda: {'ready': 0.0, 'waiting': 0.0, 'orders': 0, 'ids': []})
for pi in rows:
    code = pi['metadata'].get('partner'); ch = pi.get('latest_charge') or {}
    if pi['id'] in paid or ch.get('refunded') or ch.get('amount_refunded'): continue
    amt = (pi.get('amount_received') or 0) / 100 * RATE
    b = by[code]; b['orders'] += 1
    if pi['created'] <= cut: b['ready'] += amt; b['ids'].append(pi['id'])
    else: b['waiting'] += amt

lines = [f"{'code':12} {'orders':>6} {'pay now':>9} {'waiting':>9}"]
for code, b in sorted(by.items()):
    now = b['ready'] if b['ready'] >= MIN_PAYOUT else 0
    lines.append(f"{code:12} {b['orders']:>6} {('$%.2f' % now):>9} {('$%.2f' % (b['waiting'] + b['ready'] - now)):>9}")
if len(lines) == 1: lines.append('(no partner orders yet)')
report = '\n'.join(lines)
print(report)
print('\nAfter paying, add the paid PaymentIntent ids to', PAID)
for code, b in by.items():
    if b['ready'] >= MIN_PAYOUT: print(code, ' '.join(b['ids']))

if '--mail' in sys.argv:
    body = json.dumps({'Simple': {'Subject': {'Data': '[PajamasDog] 파트너 월 정산표'}, 'Body': {'Text': {'Data': '파트너 커미션 (15%, 30일 지난 주문, $25 이상만 지급)\n\n' + report + '\n\nPayPal Business로 보내고, 보낸 주문 id를 partner_paid.txt에 적어 주세요.'}}}})
    subprocess.run(['aws', 'sesv2', 'send-email', '--from-email-address', 'PajamasDog <info@opencbct.com>', '--destination', 'ToAddresses=orders@opencbct.com', '--content', body], check=True, capture_output=True)
    print('mailed to orders@opencbct.com')
