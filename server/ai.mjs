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
const PER_IP_PER_DAY = 8;             // soft limit per warm Lambda; Runway also caps 200 images/day

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.requestContext?.http?.method !== 'POST') return json(405, { error: 'POST only' });
  const ip = event.requestContext?.http?.sourceIp || 'x';
  if (limited(ip)) return json(429, { error: 'Free AI pictures used up for today. Come back tomorrow.' });

  let req; try { req = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body); } catch { return json(400, { error: 'Bad request' }); }
  const photo = String(req.photo || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > MAX_PHOTO) return json(400, { error: 'Please use a JPG or PNG photo.' });
  const p = await product(String(req.product || ''));
  if (!p || !p.img) return json(400, { error: 'Unknown product' });
  const pose = POSE[req.pose] ? req.pose : 'sit';

  // product photo as a data URI (our own site image)
  const pr = await fetch(`${SITE}/${p.img.replace(/^\//, '').split('?')[0]}`);
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
