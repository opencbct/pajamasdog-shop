// PajamasDog direct checkout — AWS Lambda (Node 20, no dependencies). NOT DEPLOYED.
// Routes (Lambda function URL):
//   POST /checkout  {items:[{id,qty,size}], wrap, gift:{to,from,msg}, country}  -> {url} (Stripe Checkout)
//   POST /pack      {}  -> {url}  30 extra AI pictures for $2.99 (형님 11-25)
//   GET  /pack-verify?s=<session id> -> {ok, credits}  (the AI server asks this before using a pack)
//   POST /webhook   Stripe event (checkout.session.completed)                -> places the CJ order
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CJ_API_KEY, SITE_URL (https://pajamasdog.com)
// Money: Stripe payouts go to the Bluevine account set in the Stripe dashboard (never in code).
import { sendTracking } from './tracking.mjs';
import { cjSweep } from './sweep.mjs';
import { orderMails, helpRequest } from './notify.mjs';
import { approve } from './approve.mjs';
import { giftData, giftLinkFor } from './gift.mjs';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
const CATALOG = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
// 11-26: digital gift reveal options (same file the site reads). No physical wrapping: suppliers can't pack per order.
const GIFT = JSON.parse(readFileSync(new URL('./giftwrap.json', import.meta.url)));
function giftOf(g) {
  if (!g || !g.on) return null;
  const pick = (list, k) => GIFT[list].find(o => o.k === k) || GIFT[list][0];
  const o = { box: pick('box', g.box), ribbon: pick('ribbon', g.ribbon), inside: pick('inside', g.inside), card: pick('card', g.card) };
  const tier = Object.values(o).some(x => x.tier === 'premium') ? 'premium' : 'free';
  return { tier, price: GIFT.price[tier], keys: `${o.box.k}|${o.ribbon.k}|${o.inside.k}|${o.card.k}`,
    to: String(g.to || '').slice(0, 40), from: String(g.from || '').slice(0, 40), msg: String(g.msg || '').slice(0, 280) };
}
const SITE = process.env.SITE_URL || 'https://pajamasdog.com';
const SHIP_TO = ['US', 'CA']; // 11-26: US + Canada only until a return policy fits EU/UK/AU law
const COUNTRY_NAME = { US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia', NZ: 'New Zealand', JP: 'Japan',
  KR: 'Korea, Republic of', DE: 'Germany', FR: 'France', NL: 'Netherlands', IE: 'Ireland', SG: 'Singapore' };
const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---- 1. Create a Stripe Checkout session from SERVER prices only ----
async function createCheckout(req) {
  const items = (req.items || []).slice(0, 20);
  const gift = giftOf(req.gift);
  const form = new URLSearchParams();
  let n = 0;
  for (const it of items) {
    const p = CATALOG.items[it.id];
    if (!p) return json(400, { error: `Unknown item ${it.id}` });
    if (p.test && process.env.STAGE === 'live') return json(400, { error: 'Test item in live mode' });
    const size = p.sizes?.includes(it.size) ? it.size : '';
    const qty = Math.max(1, Math.min(5, parseInt(it.qty) || 1));
    // CJ variant = color (by index in p.colors) + size. Refuse when we can't map it, so we never charge for something we can't ship.
    const color = p.colors?.[parseInt(it.c) || 0] || '';
    const oneSize = !(p.sizes && p.sizes.length);
    const vkey = !p.variants ? '' : oneSize ? (p.variants[color] ? color : Object.keys(p.variants).find(k => k === color || k.startsWith(color + '-')))
                                          : Object.keys(p.variants).find(k => k.startsWith(color + '-') && k.split('-').includes(size));
    if (p.variants && ((!oneSize && !size) || !vkey)) return json(400, { error: `Please pick a size for ${p.name}` });
    const unit = (p.vprice && vkey && p.vprice[vkey]) || p.price;   // bigger sizes can cost more
    form.append(`line_items[${n}][price_data][currency]`, CATALOG.currency);
    form.append(`line_items[${n}][price_data][unit_amount]`, String(unit));
    form.append(`line_items[${n}][price_data][product_data][name]`, p.name + (size ? ` · ${size}` : ''));
    form.append(`line_items[${n}][quantity]`, String(qty));
    form.append(`metadata[item_${n}]`, `${it.id}|${size}|${qty}|${vkey || ''}`);
    n++;
  }
  if (!n) return json(400, { error: 'Cart is empty' });
  if (gift?.price) {
    form.append(`line_items[${n}][price_data][currency]`, CATALOG.currency);
    form.append(`line_items[${n}][price_data][unit_amount]`, String(gift.price));
    form.append(`line_items[${n}][price_data][product_data][name]`, 'Digital gift reveal · Premium (online unboxing link, nothing extra is shipped)');
    form.append(`line_items[${n}][quantity]`, '1');
  }
  form.append('mode', 'payment');
  form.append('success_url', `${SITE}/thanks.html?s={CHECKOUT_SESSION_ID}`);
  form.append('cancel_url', `${SITE}/studio.html`);
  // 형님 11-24: ship beyond the US. CJ cost to these is the same or lower than to the US (checked 11-24), so prices already cover it.
  SHIP_TO.forEach((c, i) => form.append(`shipping_address_collection[allowed_countries][${i}]`, c));
  form.append('custom_text[submit][message]', 'All sales are final. By paying you agree to our Shipping & Returns policy: https://pajamasdog.com/returns.html');
  form.append('phone_number_collection[enabled]', 'true'); // the carrier needs a phone number
  if (gift) {
    form.append('metadata[gift]', gift.tier);
    form.append('metadata[gift_look]', gift.keys);
    form.append('metadata[gift_to]', gift.to);
    form.append('metadata[gift_from]', gift.from);
    form.append('metadata[gift_msg]', gift.msg);
  }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const s = await r.json();
  return r.ok ? json(200, { url: s.url }) : json(502, { error: s.error?.message || 'Stripe error' });
}

// ---- 2. Verify the Stripe webhook signature ----
function verifyStripe(raw, header) {
  const parts = Object.fromEntries((header || '').split(',').map(kv => kv.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - parts.t) > 300) return false;
  const mac = Buffer.from(crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest('hex'));
  const sig = Buffer.from(parts.v1);
  return mac.length === sig.length && crypto.timingSafeEqual(mac, sig);
}

// ---- 3. Paid → place the order at CJ (they ship to the customer) ----
async function cjToken() {
  const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }) });
  return (await r.json()).data?.accessToken;
}
// ---- 1b. AI picture pack: no shipping, no CJ order ----
const PACK = { credits: 30, cents: 299, name: '30 more AI pictures — PajamasDog' };
const STRIPE = (path, form) => fetch(`https://api.stripe.com/v1/${path}`, { method: form ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form });
async function createPack() {
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('line_items[0][price_data][currency]', 'usd');
  form.append('line_items[0][price_data][unit_amount]', String(PACK.cents));
  form.append('line_items[0][price_data][product_data][name]', PACK.name);
  form.append('line_items[0][quantity]', '1');
  form.append('metadata[kind]', 'pack');
  form.append('success_url', `${SITE}/thanks.html?pack=1&s={CHECKOUT_SESSION_ID}`);
  form.append('cancel_url', `${SITE}/show.html`);
  form.append('custom_text[submit][message]', 'Digital AI pictures for use on pajamasdog.com. Non-refundable once used.');
  const r = await STRIPE('checkout/sessions', form); const s = await r.json();
  return r.ok ? json(200, { url: s.url }) : json(502, { error: s.error?.message || 'Stripe error' });
}
async function verifyPack(id) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id || '')) return json(400, { ok: false });
  const r = await STRIPE(`checkout/sessions/${id}`); const s = await r.json();
  const ok = r.ok && s.payment_status === 'paid' && s.metadata?.kind === 'pack';
  return json(200, { ok, credits: ok ? PACK.credits : 0 });
}

async function placeCjOrder(session) {
  const ship = session.collected_information?.shipping_details || session.shipping_details || {};
  const a = ship.address || {};
  const products = Object.entries(session.metadata || {}).filter(([k]) => k.startsWith('item_')).map(([, v]) => {
    const [id, , qty, vkey] = v.split('|'); const p = CATALOG.items[id] || {};
    return { vid: (vkey && p.variants?.[vkey]) || p.cj_vid, quantity: +qty };
  }).filter(p => p.vid);
  if (!products.length) return { skipped: 'no CJ variants mapped yet' };
  const token = await cjToken();
  const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2', {
    method: 'POST', headers: { 'content-type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify({ orderNumber: session.id, shippingCountryCode: a.country, shippingCountry: COUNTRY_NAME[a.country] || a.country, shippingProvince: a.state, shippingCity: a.city,
      shippingAddress: [a.line1, a.line2].filter(Boolean).join(' '), shippingZip: a.postal_code, shippingCustomerName: ship.name,
      shippingPhone: session.customer_details?.phone || '', email: session.customer_details?.email || '', remark: session.metadata?.gift ? 'Gift order: please do not include any price or invoice in the parcel.' : '',
      logisticName: 'CJPacket Ordinary', fromCountryCode: 'CN', products }) });
  return r.json();
}

async function cjStatusOf(orderNumber) {
  const tok = await cjToken();
  const j = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/list?pageNum=1&pageSize=50', { headers: { 'CJ-Access-Token': tok } }).then(r => r.json());
  return (j.data?.list || []).find(o => o.orderNum === orderNumber)?.orderStatus || '';
}

export const handler = async (event) => {
  // 11-26: scheduled run (EventBridge) → tracking e-mails. Function URL requests never carry source 'aws.events'.
  if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
    const tok = await cjToken();
    const r = await sendTracking(tok); console.log('tracking', JSON.stringify(r));
    const w = await cjSweep(tok); console.log('sweep', JSON.stringify(w)); return { ok: true, sent: r.length };
  }
  const path = event.rawPath || event.path || '';
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
  // CORS (preflight + allow-origin) is handled by the Lambda Function URL config, not here.
  try {
    if (path.endsWith('/checkout')) return await createCheckout(JSON.parse(raw || '{}'));
    if (path.endsWith('/pack')) return await createPack();
    if (path.endsWith('/pack-verify')) return await verifyPack(new URLSearchParams(event.rawQueryString || '').get('s'));
    if (path.endsWith('/approve')) return await approve(event, cjToken);
    if (path.endsWith('/gift')) return await giftData(new URLSearchParams(event.rawQueryString || '').get('g'));
    if (path.endsWith('/gift-link')) return await giftLinkFor(new URLSearchParams(event.rawQueryString || '').get('s'));
    if (path.endsWith('/help')) {
      // Buyer's cancel / problem form. Sends e-mails only; refunds stay with 형님 in Stripe.
      const r = await helpRequest(JSON.parse(raw || '{}'), cjStatusOf);
      return json(r.status, r.ok ? { ok: true, message: r.message } : { error: r.error });
    }
    if (path.endsWith('/webhook')) {
      if (!verifyStripe(raw, event.headers?.['stripe-signature'])) return json(400, { error: 'bad signature' });
      const ev = JSON.parse(raw);
      // Only paid sessions become CJ orders. CJ order number = Stripe session id, so a retried webhook can't double-order.
      // The CJ order is created unpaid: 형님 pays it in CJ (wallet) until we trust the flow.
      if (ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'paid' && ev.data.object.metadata?.kind !== 'pack') { const r = await placeCjOrder(ev.data.object); console.log('CJ order', JSON.stringify(r));
        try { await orderMails(ev.data.object, r); } catch (e) { console.error('order mail', e); } }
      return json(200, { ok: true });
    }
    return json(404, { error: 'not found' });
  } catch (e) { console.error(e); return json(500, { error: 'server error' }); }
};
