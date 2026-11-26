#!/usr/bin/env python3
"""11-26 형님: put the WHOLE Shipping & Returns policy in small print at the bottom of customer e-mails.
Reads returns.html (the single source of truth) and writes server/policy_mail.json = {html, text}.
Re-run whenever returns.html changes, then redeploy the checkout server."""
import html, json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'returns.html')).read()
main = re.search(r'<main[^>]*>(.*?)</main>', src, re.S).group(1)
main = re.sub(r'<table.*?</table>', '', main, flags=re.S)                       # measuring table: link only
main = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', main, flags=re.S)

blocks, out_html, out_text = re.findall(r'<(h1|h2|h3|p|li)[^>]*>(.*?)</\1>', main, re.S), [], []
def clean(s):
    s = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', r'\2', s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()
for tag, inner in blocks:
    t = clean(inner)
    if not t: continue
    if tag in ('h1', 'h2', 'h3'):
        out_html.append(f'<b style="color:#999">{html.escape(t)}</b>'); out_text.append('\n' + t.upper())
    elif tag == 'li':
        out_html.append('&bull; ' + html.escape(t)); out_text.append('- ' + t)
    else:
        out_html.append(html.escape(t)); out_text.append(t)
body = '<br>'.join(out_html) + '<br>Size guide: <a href="https://pajamasdog.com/returns.html" style="color:#aaa">pajamasdog.com/returns.html</a>'
json.dump({'html': body, 'text': '\n'.join(out_text) + '\nFull policy: https://pajamasdog.com/returns.html'},
          open(os.path.join(ROOT, 'server/policy_mail.json'), 'w'), ensure_ascii=False, indent=1)
print('blocks', len(out_html), 'chars', len(body))
