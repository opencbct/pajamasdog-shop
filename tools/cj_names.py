#!/usr/bin/env python3
"""Turn raw CJ product names into short, premium shop names (rule based).
Keeps the describing words (material, look, season), drops filler, ends with the right noun."""
import re

NOUN = {'pajamas': 'Pajamas', 'tops': 'Tee', 'sweater': 'Sweater', 'hoodie': 'Hoodie', 'coat': 'Coat',
        'jumpsuit': 'Onesie', 'dress': 'Dress', 'set': 'Set', 'socks': 'Boots', 'scarf': 'Bandana',
        'hairclip': 'Hair Clip', 'tie': 'Bow Tie', 'necklace': 'Collar Charm', 'hat': 'Hat', 'glasses': 'Sunglasses',
        'collar': 'Collar', 'leash': 'Leash', 'harness': 'Harness', 'bowl': 'Bowl', 'toy': 'Toy',
        'bed': 'Bed', 'blanket': 'Blanket', 'carrier': 'Carrier'}
# nouns already in the name that are good endings
NOUNS = r'\b(costume|pajamas?|sweater|hoodie|coat|jacket|vest|parka|onesie|overalls|jumpsuit|dress|skirt|tutu|tee|t-shirt|shirt|set|boots?|shoes|socks|scarf|bandana|clip|headband|bow tie|bow|necklace|pendant|collar|hat|beanie|cap|sunglasses|goggles|glasses|leash|harness|bowl|feeder|fountain|stand|toy|bed|nest|cushion|blanket|quilt|mat|carrier|backpack|bag|towel|robe|bathrobe|raincoat|cape|cloak)\b'
DROP = r"\b(new|hot|sale|fashion|personality|cute|lovely|pet|pets|pet's|dog|dogs|cat|cats|puppy|puppies|kitten|kitty|clothes|clothing|apparel|products?|supplies|accessories|for|and|the|of|with|to|in|a|an|small|medium|large|big|sized|size|breeds?|teddy|bichon|pomeranian|chihuahua|corgi|french|bulldog|golden|retriever|border|collie|schnauzer|yorkie|four-legged|four|legged|two-legged|style|universal|decoration|jewelry|winter|autumn|spring|summer|out|go|going|korea|korean|ins|digital|favs|ring|funny|cosplay|photo|personalized|assisted|keep|day|year|new|high|\d+)\b"
KEEP_SEASON = r'\b(christmas|winter|halloween|valentine)\b'

def nice(raw, tag):
    s = re.sub(r'[,/|()\[\]]+', ' ', raw or '')
    season = re.search(KEEP_SEASON, s, re.I)
    noun_m = None
    for m in re.finditer(NOUNS, s, re.I): noun_m = m          # last product noun wins
    noun = noun_m.group(0).title() if noun_m else NOUN.get(tag, '')
    noun = {'Bow': 'Bow Tie', 'Skirt': 'Dress', 'Tutu': 'Tutu Dress', 'Shirt': 'Tee', 'T-Shirt': 'Tee', 'Pajama': 'Pajamas',
            'Glasses': 'Sunglasses', 'Shoes': 'Boots', 'Boot': 'Boots', 'Overalls': 'Onesie', 'Jumpsuit': 'Onesie',
            'Cap': 'Hat', 'Costume': 'Costume', 'Stand': 'Bowl Stand', 'Mat': 'Blanket', 'Bag': 'Carrier', 'Pendant': 'Collar Charm',
            'Towel': 'Towel Robe' if tag in ('set', 'pajamas') else 'Bandana', 'Necklace': 'Collar Charm'}.get(noun, noun)
    words = re.sub(DROP, ' ', re.sub(NOUNS, ' ', s, flags=re.I), flags=re.I)
    words = [w for w in re.split(r'[\s\-]+', words) if len(w) > 2 and w.isalpha()]
    seen, out = set(), []
    for w in words:
        k = w.lower()
        if k in seen: continue
        seen.add(k); out.append(w.capitalize())
    out = out[:3]
    if season and season.group(0).title() not in out: out.insert(0, season.group(0).title())
    name = ' '.join(out[:3] + [noun]).strip()
    name = re.sub(r'\bCotton-padded\b', 'Padded', name, flags=re.I)
    return name or (raw or '')[:40]

if __name__ == '__main__':
    import json, sys, os
    L = json.load(open(os.path.join(os.path.dirname(__file__), 'out/cj_items.json')))
    for x in L[: int(sys.argv[1]) if len(sys.argv) > 1 else 40]:
        print(f"{x['tag'][:8]:8} {nice(x['cj_name'], x['tag'])[:44]:44} | {x['cj_name'][:60]}")
