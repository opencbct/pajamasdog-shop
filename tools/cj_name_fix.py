#!/usr/bin/env python3
"""11-26: hand-fixed English names for CJ items whose machine names read badly. Applied to products/feed.json
and server/catalog.json after cj_merge.py. Key = last 8 chars of the CJ pid (our id is 'cj-' + that)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = {
 '04701952': 'Plush Fleece Winter Pajamas', '51628700': 'All-Season Onesie', '87688960': 'Warm Winter Coat',
 'DD83786B': 'Mustard Knit Sweater', '528BB9E9': 'Red Christmas Knit Sweater', '77430784': 'Quilted Winter Jacket',
 '29004544': 'Sky Blue Knit Sweater', '48523CEE': 'Matching Owner & Pet Tee', 'A60234EA': 'Fleece-lined Street Sweater',
 '039001CF': 'Terry Knit Sweater', '39643648': 'Fleece-lined Street Hoodie', '68618496': 'Angel Wing Winter Sweater',
 '24693760': 'Matching Owner & Pet Sweater', 'B01D9A06': 'Matching Owner & Pet Hoodie', '35114752': 'Faux Leather Winter Jacket',
 '74555904': 'Velvet-lined Sweater', '29083822': 'Matching Striped Hoodie (Owner & Pet)', '86503936': 'Thick Warm Hoodie',
 '26757632': 'Camo Puffer Jacket', '65923072': 'Little Black Dress', '02076160': 'Snowflake Dress',
 '74253312': 'Christmas Cape', '53090048': 'Maid Dress Set with Hat', '25513216': 'Light Summer Dress',
 'EFADE5B7': 'Wool Winter Dress', '07382528': 'Polka Dot Period Dress', 'F5CA04FE': 'Waterproof Winter Boots',
 '0F951C69': 'Waterproof Booties', 'F196C7BC': 'Durable Hiking Boots', '04EA21D9': 'Wedding Tuxedo Bandana',
 '86629888': 'Birthday Cake Bib', 'A1F013E6': 'Scorpion Costume Hat', '82499328': 'Pineapple Hat',
 'B4316F11': 'Cozy Knit Hat', 'CD1A5836': 'Banana Hat', '58217474': 'Retractable Leash',
 '98205184': 'LED Light-up Harness Vest', '23951360': 'Harness & Leash Set', '69293824': 'Heavy-duty Harness Vest',
 '31602800': 'Raised Neck-guard Bowl', '99130113': 'Non-slip Pet Blanket', '23062016': 'Ceramic Slow Feeder',
 '06883840': 'Stainless Slow Feeder Bowl', '15571456': 'Cartoon Food & Water Bowl', '69040896': 'Automatic Food & Water Feeder',
 '91604000': 'Warm Winter Nest Bed', '51624900': 'Plush Hammock Nest', '61261824': 'Foldable Camping Bed',
 '51610000': 'Waterproof Plush Cushion', '87969025': 'Car Seat Belt Leash', '89140736': 'Car Carrier Bag',
 '41600900': 'Clear Bubble Backpack', '61608700': 'Simple Crossbody Carrier', '01600600': 'Foldable Carrier Bag',
 '00004352': 'Skull Halloween Sweater', '27769856': 'Knitted Pumpkin Sweater',
 '874C3C43': 'Denim High-top Sneakers', 'ED200D73': 'Canvas Denim Sneakers', '82750B4D': 'Breathable Denim Sneakers',
 '31638400': 'Full-leg Rain Boots with Suspenders', '59964162': 'Paw Print Pool Float', '01559552': 'Balloon Rain Boots (4-pack)',
 '77242112': 'Breakaway Cat Collar with Tracker Holder', '01601300': 'Reflective Breakaway Cat Collar · Tracker Pocket', '81603300': 'Soft Silicone Tracker Cat Collar',
}
fp, cp = os.path.join(ROOT, 'products/feed.json'), os.path.join(ROOT, 'server/catalog.json')
feed, cat = json.load(open(fp)), json.load(open(cp))
n = 0
for p in feed:
    k = p['id'][3:] if p['id'].startswith('cj-') else None
    if k in NAMES:
        p['name'] = NAMES[k]; n += 1
        if p['id'] in cat['items']: cat['items'][p['id']]['name'] = NAMES[k]
json.dump(feed, open(fp, 'w'), indent=1, ensure_ascii=False)
json.dump(cat, open(cp, 'w'), indent=1, ensure_ascii=False)
print('renamed', n)
