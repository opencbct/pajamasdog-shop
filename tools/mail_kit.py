#!/usr/bin/env python3
"""11-28 형님: "개 줄 하나에도 이렇게 디테일하네 — 우리도 이렇게 만들어서 계속 메일 보내."
Ruffwear-style story e-mail: brand band, one moving hero (GIF), one offer, then big photo blocks
(one category each, "Explore X →"), one last button, small print, CAN-SPAM footer.
Run: python3 tools/mail_kit.py [issue]  → tools/out/mail_<issue>.html  (nothing is sent here)."""
import html, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://pajamasdog.com'
FEED = {p['id']: p for p in json.load(open(os.path.join(ROOT, 'products/feed.json')))}
ADDRESS = 'OPENCBCT LLC · 2454 E. Dempster St, Suite LL4, Des Plaines, IL 60016'
UNSUB = 'mailto:info@opencbct.com?subject=unsubscribe'

# One issue = one story. Blocks: (category key for ?cat=, label, product id whose photo leads the block)
ISSUES = {
 'winter-kit': {
   'subject': 'Complete your pup\'s winter kit 🐾',
   'preheader': 'Coats, sweaters and boots for the cold — plus 10% off your first order.',
   'band': 'winter kit / 2026',
   'hero': f'{SITE}/img/mail/hero_runway.gif', 'hero_alt': 'A Yorkie walking the PajamasDog runway in pajamas',
   'kicker': '10% off your first order',
   'title': 'Complete Your Pup\'s Winter Kit',
   'body': 'Cold walks, cozy nights. Pick a warm coat, a soft sweater and boots that keep paws dry — '
           'and use code <b>WELCOME10</b> for 10% off your first order.',
   'cta': ('Gear Up', f'{SITE}/#shop'),
   'blocks': [('coat', 'Explore Coats', 'cj-66403584'), ('sweater', 'Explore Sweaters', 'cj-49382400'),
              ('socks', 'Explore Boots', 'cj-31638400'), ('cats', 'For Cats: Breakaway Collars', 'cj-77242112')],
   'last': ('Shop Winter Looks', f'{SITE}/#shop'),
   'fine': '*WELCOME10: 10% off, first order only, one use per customer, at pajamasdog.com. '
           'Cannot be combined with partner codes. Prices in USD. Free shipping to the US and Canada.',
 },
}

BG, INK, GOLD, PINK = '#2a2433', '#f2eef8', '#ffd36b', '#ff3d7f'
esc = html.escape

def photo(pid):
    p = FEED[pid]
    src = p.get('img_src') or p['img']
    return src if src.startswith('http') else f'{SITE}/{src}'

def build(key):
    m = ISSUES[key]
    blocks = ''.join(f'''
<tr><td style="padding:0"><a href="{SITE}/?cat={k}#shop"><img src="{esc(photo(pid))}" width="600" alt="{esc(label)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="padding:22px 40px 34px;background:{BG}"><a href="{SITE}/?cat={k}#shop" style="color:{GOLD};font-size:24px;font-weight:600;text-decoration:none">{esc(label)} &rarr;</a></td></tr>'''
                     for k, label, pid in m['blocks'])
    btn = lambda t, u: f'''<a href="{u}" style="display:block;background:{PINK};color:#fff;text-align:center;border-radius:999px;padding:16px;font-size:17px;font-weight:600;text-decoration:none">{esc(t)}</a>'''
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><title>{esc(m["subject"])}</title></head>
<body style="margin:0;background:#15131c;font-family:-apple-system,Helvetica,Arial,sans-serif;color:{INK}">
<div style="display:none;max-height:0;overflow:hidden">{esc(m["preheader"])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15131c"><tr><td align="center" style="padding:24px 0">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:{BG}">
<tr><td style="padding:26px 40px"><table role="presentation" width="100%"><tr>
  <td><a href="{SITE}"><img src="{SITE}/img/logo2/logo3.png?v=1" height="44" alt="PajamasDog" style="display:block;border:0"></a></td>
  <td align="right" style="font-family:Menlo,monospace;font-size:13px;color:{GOLD}">{esc(m["band"])}</td></tr></table></td></tr>
<tr><td style="padding:0"><a href="{m["cta"][1]}"><img src="{m["hero"]}" width="600" alt="{esc(m["hero_alt"])}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="padding:34px 40px 10px">
  <div style="color:{GOLD};font-size:22px;font-weight:600">{esc(m["kicker"])}</div>
  <div style="color:{GOLD};font-size:32px;font-weight:700;line-height:1.15;margin-top:2px">{esc(m["title"])}</div>
  <p style="color:{GOLD};opacity:.9;font-size:18px;line-height:1.5;margin:16px 0 0">{m["body"]}</p></td></tr>
<tr><td style="padding:22px 40px 40px">{btn(*m["cta"])}</td></tr>
{blocks}
<tr><td style="padding:10px 40px 40px">{btn(*m["last"])}</td></tr>
<tr><td style="padding:26px 40px;background:#221d2a;color:#cfc6dc;font-size:13px;font-style:italic;line-height:1.6" align="center">{esc(m["fine"])}</td></tr>
<tr><td style="padding:30px 40px;background:#15131c;color:#bdb4cc;font-size:13px;line-height:1.7" align="center">
  <a href="{SITE}/#shop" style="color:#fff;text-decoration:none;margin:0 14px">Shop</a>
  <a href="{SITE}/show.html" style="color:#fff;text-decoration:none;margin:0 14px">AI Fashion Show</a>
  <a href="{SITE}/help.html" style="color:#fff;text-decoration:none;margin:0 14px">Help</a><br><br>
  You get this because you asked for our 10% code on pajamasdog.com.<br>{esc(ADDRESS)}<br>
  <a href="{UNSUB}" style="color:#fff">Unsubscribe</a> · <a href="{SITE}/privacy.html" style="color:#fff">Privacy</a></td></tr>
</table></td></tr></table></body></html>'''

if __name__ == '__main__':
    key = sys.argv[1] if len(sys.argv) > 1 else 'winter-kit'
    out = os.path.join(ROOT, 'tools/out', f'mail_{key}.html'); os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write(build(key)); print(out, '|', ISSUES[key]['subject'])
