// PajamasDog direct checkout — AWS Lambda (Node 20, no dependencies). NOT DEPLOYED.
// Routes (Lambda function URL):
//   POST /checkout  {items:[{id,qty,size}], wrap, gift:{to,from,msg}, country}  -> {url} (Stripe Checkout)
//   POST /webhook   Stripe event (checkout.session.completed)                -> places the CJ order
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CJ_API_KEY, SITE_URL (https://pajamasdog.com)
// Money: Stripe payouts go to the Bluevine account set in the Stripe dashboard (never in code).
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
const CATALOG = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
const SITE = process.env.SITE_URL || 'https://pajamasdog.com';
const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---- 1. Create a Stripe Checkout session from SERVER prices only ----
async function createCheckout(req) {
  const items = (req.items || []).slice(0, 20);
  const wrap = CATALOG.wraps[req.wrap] ? req.wrap : 'none';
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
    const vkey = p.variants ? Object.keys(p.variants).find(k => k.startsWith(color + '-') && k.split('-').includes(size)) : '';
    if (p.variants && (!size || !vkey)) return json(400, { error: `Please pick a size for ${p.name}` });
    form.append(`line_items[${n}][price_data][currency]`, CATALOG.currency);
    form.append(`line_items[${n}][price_data][unit_amount]`, String(p.price));
    form.append(`line_items[${n}][price_data][product_data][name]`, p.name + (size ? ` · ${size}` : ''));
    form.append(`line_items[${n}][quantity]`, String(qty));
    form.append(`metadata[item_${n}]`, `${it.id}|${size}|${qty}|${vkey || ''}`);
    n++;
  }
  if (!n) return json(400, { error: 'Cart is empty' });
  if (CATALOG.wraps[wrap].price) {
    form.append(`line_items[${n}][price_data][currency]`, CATALOG.currency);
    form.append(`line_items[${n}][price_data][unit_amount]`, String(CATALOG.wraps[wrap].price));
    form.append(`line_items[${n}][price_data][product_data][name]`, `Gift wrap · ${CATALOG.wraps[wrap].name}`);
    form.append(`line_items[${n}][quantity]`, '1');
  }
  const g = req.gift || {};
  form.append('mode', 'payment');
  form.append('success_url', `${SITE}/thanks.html?s={CHECKOUT_SESSION_ID}`);
  form.append('cancel_url', `${SITE}/studio.html`);
  form.append('shipping_address_collection[allowed_countries][0]', 'US');
  form.append('custom_text[submit][message]', 'All sales are final. By paying you agree to our Shipping & Returns policy: https://pajamasdog.com/returns.html');
  form.append('phone_number_collection[enabled]', 'true'); // the carrier needs a phone number
  form.append('metadata[wrap]', wrap);
  form.append('metadata[gift_to]', String(g.to || '').slice(0, 60));
  form.append('metadata[gift_from]', String(g.from || '').slice(0, 60));
  form.append('metadata[gift_msg]', String(g.msg || '').slice(0, 300));
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
    body: JSON.stringify({ orderNumber: session.id, shippingCountryCode: a.country, shippingCountry: a.country === 'US' ? 'United States' : a.country, shippingProvince: a.state, shippingCity: a.city,
      shippingAddress: [a.line1, a.line2].filter(Boolean).join(' '), shippingZip: a.postal_code, shippingCustomerName: ship.name,
      shippingPhone: session.customer_details?.phone || '', email: session.customer_details?.email || '', remark: `Gift: ${session.metadata?.wrap || 'none'} ${session.metadata?.gift_msg || ''}`.slice(0, 200),
      logisticName: 'CJPacket Ordinary', fromCountryCode: 'CN', products }) });
  return r.json();
}

export const handler = async (event) => {
  const path = event.rawPath || event.path || '';
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
  // CORS (preflight + allow-origin) is handled by the Lambda Function URL config, not here.
  try {
    if (path.endsWith('/checkout')) return await createCheckout(JSON.parse(raw || '{}'));
    if (path.endsWith('/webhook')) {
      if (!verifyStripe(raw, event.headers?.['stripe-signature'])) return json(400, { error: 'bad signature' });
      const ev = JSON.parse(raw);
      // Only paid sessions become CJ orders. CJ order number = Stripe session id, so a retried webhook can't double-order.
      // The CJ order is created unpaid: 형님 pays it in CJ (wallet) until we trust the flow.
      if (ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'paid') { const r = await placeCjOrder(ev.data.object); console.log('CJ order', JSON.stringify(r)); }
      return json(200, { ok: true });
    }
    return json(404, { error: 'not found' });
  } catch (e) { console.error(e); return json(500, { error: 'server error' }); }
};
