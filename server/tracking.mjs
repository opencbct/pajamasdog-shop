// 11-26: tracking e-mail. Runs on a schedule (EventBridge → same Lambda).
// CJ order shipped (SHIPPED / DELIVERED) + has a track number → e-mail the buyer once.
// "Sent" is remembered on the Stripe PaymentIntent (metadata.tracking_sent = track number), so no database is needed
// and a new track number (re-ship) gets a new e-mail.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const FROM = 'PajamasDog <info@opencbct.com>';
const REPLY = 'info@opencbct.com';
const SHIPPED = new Set(['SHIPPED', 'DELIVERED']);
const ses = new SESv2Client({ region: 'us-east-1' });

const stripe = (path, form) => fetch(`https://api.stripe.com/v1/${path}`, { method: form ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form })
  .then(r => r.json());

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function trackingMail({ name, items, track, url, country }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const days = country === 'CA' ? '7–15' : '7–12';
  const list = items.map(i => `<tr><td style="padding:6px 0;font-size:15px;color:#333">${esc(i.name)}</td><td style="padding:6px 0;font-size:15px;color:#333;text-align:right">× ${i.qty}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f1;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:300">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px">
<tr><td style="padding:28px 28px 0"><img src="https://pajamasdog.com/img/logo2/stack.png?v=1" alt="PajamasDog" height="56" style="display:block;height:56px"></td></tr>
<tr><td style="padding:22px 28px 0;font-size:24px;color:#111">Your order is on its way 🐾</td></tr>
<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.6;color:#444">Hi ${esc(first)}, good news — your package just left our partner warehouse. Usual delivery is ${days} days.</td></tr>
<tr><td style="padding:18px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee">${list}</table></td></tr>
<tr><td style="padding:18px 28px 0;font-size:14px;color:#666">Tracking number<br><span style="font-size:17px;color:#111;letter-spacing:.5px">${esc(track)}</span></td></tr>
<tr><td style="padding:22px 28px 0" align="center"><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:16px;padding:14px 34px;border-radius:999px">Track my package</a></td></tr>
<tr><td style="padding:18px 28px 0;font-size:13px;line-height:1.6;color:#888">Tracking can take 1–3 days to show the first scan. Questions? Just reply to this e-mail.</td></tr>
<tr><td style="padding:24px 28px 28px;font-size:12px;color:#aaa">PajamasDog · pajamasdog.com</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${first}, your PajamasDog order is on its way.\n\n${items.map(i => `- ${i.name} x ${i.qty}`).join('\n')}\n\nTracking number: ${track}\nTrack: ${url}\nUsual delivery: ${days} days. Tracking can take 1–3 days to show the first scan.\n\nQuestions? Reply to this e-mail.\nPajamasDog · pajamasdog.com`;
  return { subject: 'Your PajamasDog order has shipped', html, text };
}

export async function cjOrders(token) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const j = await fetch(`https://developers.cjdropshipping.com/api2.0/v1/shopping/order/list?pageNum=${page}&pageSize=50`, { headers: { 'CJ-Access-Token': token } }).then(r => r.json());
    const list = j.data?.list || [];
    out.push(...list);
    if (list.length < 50) break;
  }
  return out;
}

// dry = true: build the mail, send it only to `testTo`, don't mark anything.
export async function sendTracking(token, { dry = false, testTo = '' } = {}) {
  const live = process.env.STAGE === 'live';
  const done = [];
  for (const o of await cjOrders(token)) {
    if (!SHIPPED.has(o.orderStatus) && !dry) continue;
    if (!o.trackNumber || !/^cs_(live|test)_/.test(o.orderNum || '')) continue;
    if (live && !o.orderNum.startsWith('cs_live_')) continue;
    const s = await stripe(`checkout/sessions/${o.orderNum}?expand[]=payment_intent`);
    const pi = s.payment_intent;
    if (!pi?.id || s.payment_status !== 'paid') continue;
    if (!dry && pi.metadata?.tracking_sent === o.trackNumber) continue;
    const to = dry ? testTo : s.customer_details?.email;
    if (!to) continue;
    const li = await stripe(`checkout/sessions/${s.id}/line_items?limit=50`);
    const items = (li.data || []).map(x => ({ name: x.description, qty: x.quantity }));
    const ship = s.collected_information?.shipping_details || s.shipping_details || {};
    const url = o.trackingUrl || `https://t.17track.net/en#nums=${encodeURIComponent(o.trackNumber)}`;
    const m = trackingMail({ name: ship.name || s.customer_details?.name, items, track: o.trackNumber, url, country: ship.address?.country });
    await ses.send(new SendEmailCommand({ FromEmailAddress: FROM, ReplyToAddresses: [REPLY], Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: dry ? '[SAMPLE] ' + m.subject : m.subject }, Body: { Html: { Data: m.html }, Text: { Data: m.text } } } } }));
    if (!dry) await stripe(`payment_intents/${pi.id}`, new URLSearchParams({ 'metadata[tracking_sent]': o.trackNumber }));
    done.push({ cj: o.cjOrderId, track: o.trackNumber, to: dry ? 'sample' : 'buyer' });
    if (dry) break;
  }
  return done;
}
