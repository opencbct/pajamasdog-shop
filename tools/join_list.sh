#!/bin/bash
# 11-27: export the welcome-pop-up e-mail list (server logs "JOIN {...}" lines) → CSV on stdout. Default: last 365 days.
DAYS=${1:-365}
aws logs filter-log-events --log-group-name /aws/lambda/pajamasdog-checkout --filter-pattern '"JOIN"' \
  --start-time $(( ($(date +%s) - DAYS*86400) * 1000 )) --query 'events[].message' --output json |
python3 -c "import json,sys,re
seen={}
for m in json.load(sys.stdin):
    x=re.search(r'JOIN (\{.*\})',m)
    if x: j=json.loads(x.group(1)); seen.setdefault(j['email'],j)
print('email,joined,page')
for e,j in seen.items(): print(f\"{e},{j['at']},{j.get('from','')}\")"
