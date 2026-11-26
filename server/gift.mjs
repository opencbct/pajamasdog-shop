// 11-26: digital gift reveal. The buyer gets a link → pajamasdog.com/gift.html?g=<token>.
// The token is the Stripe session id + a signature, so links can't be guessed or edited.
// The reveal shows only what the buyer chose (box, ribbon, inside, card, to/from/message) and the item(s) — never address, e-mail or price.
import crypto from 'node:crypto';
import { stripe } from './notify.mjs';

const SITE = process.env.SITE_URL || 'https://pajamasdog.com';
const key = () => crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '').update('pd-gift-v1').digest();
const sig = s => crypto.createHmac('sha256', key()).update(s).digest('base64url').slice(0, 22);
const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

export const giftToken = sessionId => `${sessionId}.${sig(sessionId)}`;
export const giftLink = sessionId => `${SITE}/gift.html?g=${encodeURIComponent(giftToken(sessionId))}`;

async function paidGiftSession(id) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id || '')) return null;
  const s = await stripe(`checkout/sessions/${id}`);
  return s?.payment_status === 'paid' && s.metadata?.gift ? s : null;
}

// GET /gift?g=token → what the reveal page shows
export async function giftData(token) {
  const [id, t] = String(token || '').split('.');
  const good = id && t && t.length === 22 && crypto.timingSafeEqual(Buffer.from(sig(id)), Buffer.from(t));
  if (!good) return json(404, { error: 'This gift link is not valid.' });
  const s = await paidGiftSession(id);
  if (!s) return json(404, { error: 'This gift is not ready yet.' });
  const [box, ribbon, inside, card] = String(s.metadata.gift_look || '').split('|');
  const items = Object.entries(s.metadata).filter(([k]) => k.startsWith('item_')).map(([, v]) => v.split('|')[0]);
  return json(200, { tier: s.metadata.gift, box, ribbon, inside, card, to: s.metadata.gift_to || '', from: s.metadata.gift_from || '', msg: s.metadata.gift_msg || '', items });
}

// GET /gift-link?s=session → the buyer's thank-you page asks for its share link
export async function giftLinkFor(id) {
  const s = await paidGiftSession(id);
  return s ? json(200, { link: giftLink(id), to: s.metadata.gift_to || '' }) : json(404, { error: 'no gift' });
}
