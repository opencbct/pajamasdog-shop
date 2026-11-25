// PajamasDog AI try-on (AWS Lambda, Node 20, Function URL).
// POST {photo: "data:image/jpeg;base64,...", product: "pd-01", pose: "sit"}
//   -> {image: "<base64 png>", mime, code}
// The pet photo is sent to Runway only to make the picture; we do not store it.
// Env: RUNWAY_API_KEY, SITE_URL (https://pajamasdog.com)
import crypto from 'node:crypto';

const SITE = process.env.SITE_URL || 'https://pajamasdog.com';
const RW = 'https://api.dev.runwayml.com/v1';
const RW_HEAD = () => ({ authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06', 'content-type': 'application/json' });
const MODEL = 'nano_banana_2.1';      // 4 credits ($0.04) per 1K image
const RATIO = '768:1376';             // 9:16 portrait, good for phones and Shorts
const MAX_PHOTO = 4_500_000;          // data URL length (~3.3 MB jpeg)
const PER_IP_PER_DAY = 20;            // soft limit per warm Lambda; Runway also caps 200 images/day

const POSE = {
  sit:   'sitting calmly, facing the camera',
  stand: 'standing on all four legs, facing the camera',
  lie:   'lying down on its belly, front paws forward',
  walk:  'walking toward the camera mid-step',
  sleep: 'curled up asleep, eyes closed',
};

let FEED = null, FEED_AT = 0;
async function product(id){
  if(!FEED || Date.now() - FEED_AT > 10*60*1000){
    const r = await fetch(`${SITE}/products/feed.json`); const d = await r.json();
    FEED = new Map((Array.isArray(d) ? d : d.items || []).map(p => [p.id, p])); FEED_AT = Date.now();
  }
  return FEED.get(id);
}

const hits = new Map();   // ip -> [timestamps]
function limited(ip){
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 86_400_000);
  a.push(now); hits.set(ip, a); return a.length > PER_IP_PER_DAY;
}

const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const CHECKOUT = process.env.CHECKOUT_URL || 'https://6l5lt5zx2k7jra6ynbmmd32usm0nhbay.lambda-url.us-east-1.on.aws';
const PACKS = new Map();   // session id -> {ok, credits, used}  (per warm Lambda; the page also counts)
async function packOk(id, n){
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return false;
  let p = PACKS.get(id);
  if (!p) { try { const r = await (await fetch(`${CHECKOUT}/pack-verify?s=${encodeURIComponent(id)}`)).json(); p = { ok: !!r.ok, credits: r.credits || 0, used: 0 }; } catch { return false; } PACKS.set(id, p); }
  if (!p.ok || p.used + n > p.credits) return false;
  p.used += n; return true;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.requestContext?.http?.method !== 'POST') return json(405, { error: 'POST only' });
  const ip = event.requestContext?.http?.sourceIp || 'x';
  let req; try { req = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body); } catch { return json(400, { error: 'Bad request' }); }
  // Paid picture pack (30 for $2.99) skips the free daily limit, up to its 30 pictures.
  const n = Array.isArray(req.items) ? 1 : 1;
  if (!(await packOk(String(req.pack || ''), n)) && limited(ip)) return json(429, { error: 'Free AI pictures used up for today. Get 30 more for $2.99, or come back tomorrow.' });
  const photo = String(req.photo || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > MAX_PHOTO) return json(400, { error: 'Please use a JPG or PNG photo.' });
  // Full look (11-25): {items:[ids], collage:"data:image/jpeg..."} -> the pet wears / is shown with every item at once.
  if (Array.isArray(req.items) && req.items.length) return fullLook(req, photo);
  const p = await product(String(req.product || ''));
  if (!p || !p.img) return json(400, { error: 'Unknown product' });
  const pose = POSE[req.pose] ? req.pose : 'sit';

  // product photo as a data URI (our own site image)
  const pr = await fetch(/^https?:/.test(p.img) ? p.img : `${SITE}/${p.img.replace(/^\//, '').split('?')[0]}`);
  if (!pr.ok) return json(502, { error: 'Product photo missing' });
  const ptype = (pr.headers.get('content-type') || 'image/webp').split(';')[0];
  const outfit = `data:${ptype};base64,${Buffer.from(await pr.arrayBuffer()).toString('base64')}`;

  const code = `U-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex')}`;
  const promptText =
    `Photo of every pet from @pet wearing the exact garment from @outfit (${p.name}): same fabric, same colors, ` +
    `same print and pattern scale, same trims, piping and buttons. The garment fits each pet naturally, front legs through the sleeves. ` +
    `Each pet is ${POSE[pose]}. Keep every pet's face, fur color, markings, accessories and the background exactly as in @pet. ` +
    `Photorealistic, natural light, no text, no logos added.`;

  const start = await fetch(`${RW}/text_to_image`, { method: 'POST', headers: RW_HEAD(), body: JSON.stringify({
    model: MODEL, ratio: RATIO, promptText, outputCount: 1,
    referenceImages: [{ uri: photo, tag: 'pet' }, { uri: outfit, tag: 'outfit' }],
  }) });
  const st = await start.json();
  if (!start.ok || !st.id) { console.log('runway start', start.status, JSON.stringify(st).slice(0, 400)); return json(502, { error: 'AI is busy. Try again.' }); }

  for (let i = 0; i < 40; i++) {           // ~80 s max
    await sleep(2000);
    const t = await (await fetch(`${RW}/tasks/${st.id}`, { headers: RW_HEAD() })).json();
    if (t.status === 'SUCCEEDED') {
      const img = await fetch(t.output[0]);
      const mime = (img.headers.get('content-type') || 'image/png').split(';')[0];
      console.log('tryon ok', code, p.id, pose);
      return json(200, { code, mime, image: Buffer.from(await img.arrayBuffer()).toString('base64') });
    }
    if (t.status === 'FAILED' || t.status === 'CANCELLED') { console.log('runway failed', t.failureCode || '', t.failure || ''); return json(422, { error: 'Could not dress this photo. Try a clearer photo of your pet.' }); }
  }
  return json(504, { error: 'Taking too long. Try again.' });
};

// Where each kind of item goes on the pet / in the picture.
const PLACE = [
  [/pajama|onesie|jumpsuit|hoodie|sweater|coat|robe|shirt|dress|clothes|vest/i, 'worn on its body as the main outfit'],
  [/hat|cap|beanie|headband|hood/i, 'on its head'],
  [/boot|shoe|sock|paw/i, 'on all four paws'],
  [/glass|goggle/i, 'on its eyes'],
  [/scarf|bandana|bow ?tie|tie|necklace|collar/i, 'around its neck'],
  [/harness/i, 'fitted on its chest'],
  [/leash/i, 'clipped to its collar, the leash lying on the floor'],
  [/bowl|feeder/i, 'on the floor in front of it, filled with food'],
  [/blanket|bed|mat/i, 'under it, the pet sitting on it'],
  [/carrier|bag/i, 'next to it on the floor'],
];
const MOVE = {
  walk:  'walking toward the camera like a runway model, mid-step',
  spin:  'turning around in a happy spin, fur flying',
  jump:  'jumping up with all four paws off the ground',
  dance: 'dancing on its hind legs with front paws up',
  strut: 'posing proudly like a star, head held high',
};
const placeOf = name => (PLACE.find(([re]) => re.test(name)) || [null, 'next to it'])[1];

async function fullLook(req, photo){
  const ids = [...new Set(req.items.map(String))].slice(0, 6);
  const items = [];
  for (const id of ids) { const p = await product(id); if (p && p.src === 'pd') items.push(p); }
  if (!items.length) return json(400, { error: 'Pick at least one item.' });
  const collage = String(req.collage || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(collage) || collage.length > MAX_PHOTO) return json(400, { error: 'Look picture missing.' });
  const code = `L-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex')}`;
  const list = items.map((p, i) => `${i + 1}) ${p.name} - ${placeOf(p.name)}`).join('; ');
  const promptText =
    `Cute, cozy, playful photo of every pet from @pet dressed in the numbered items shown in @items, all at once: ${list}. Each pet is ${MOVE[req.move] || MOVE.walk}. ` +
    `Copy each item exactly from @items: same colors, prints, fabric and shape. Everything fits naturally. ` +
    `The pet wears ONLY the listed item${items.length > 1 ? 's' : ''}: no other clothes, hats, scarves, collars or accessories than these. ` +
    `Keep every pet's face, breed, fur color and markings exactly as in @pet. Bright, happy, photorealistic, soft natural light, no text, no numbers, no logos added.`;
  const start = await fetch(`${RW}/text_to_image`, { method: 'POST', headers: RW_HEAD(), body: JSON.stringify({
    model: MODEL, ratio: RATIO, promptText, outputCount: 1,
    referenceImages: [{ uri: photo, tag: 'pet' }, { uri: collage, tag: 'items' }],
  }) });
  const st = await start.json();
  if (!start.ok || !st.id) { console.log('runway look start', start.status, JSON.stringify(st).slice(0, 400)); return json(502, { error: 'AI is busy. Try again.' }); }
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const t = await (await fetch(`${RW}/tasks/${st.id}`, { headers: RW_HEAD() })).json();
    if (t.status === 'SUCCEEDED') {
      const img = await fetch(t.output[0]);
      const mime = (img.headers.get('content-type') || 'image/png').split(';')[0];
      console.log('look ok', code, items.map(p => p.id).join(','));
      return json(200, { image: Buffer.from(await img.arrayBuffer()).toString('base64'), mime, code, items: items.map(p => p.id) });
    }
    if (t.status === 'FAILED') { console.log('runway look failed', JSON.stringify(t).slice(0, 400)); return json(502, { error: 'AI could not make this one. Try another photo.' }); }
  }
  return json(504, { error: 'AI took too long. Try again.' });
}
