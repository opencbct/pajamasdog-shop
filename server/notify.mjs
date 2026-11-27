// 11-26: order e-mails.
//  - ownerOrder: new paid order → 형님 (pay it in CJ)
//  - buyerConfirm: order confirmed → buyer (with cancel / problem link)
//  - helpRequest: buyer's cancel / problem form → 형님 + short reply to buyer
// Money never moves here: refunds are done by 형님 in Stripe. Sending only.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { readFileSync } from 'node:fs';
import { approveLink } from './approve.mjs';
import { giftLink } from './gift.mjs';

export const OWNER = 'orders@opencbct.com'; // 11-26 형님: order notices go here
export const FROM = 'PajamasDog <info@opencbct.com>';
export const REPLY = 'info@opencbct.com';
const ses = new SESv2Client({ region: 'us-east-1' });

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stripe = (path, form) => fetch(`https://api.stripe.com/v1/${path}`, { method: form ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form })
  .then(r => r.json());

export async function send(to, subject, html, text, replyTo = REPLY) {
  return ses.send(new SendEmailCommand({ FromEmailAddress: FROM, ReplyToAddresses: [replyTo], Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject }, Body: { Html: { Data: html }, Text: { Data: text } } } } }));
}

// Same look as the tracking e-mail.
// 11-26 형님: customer e-mails carry the Shipping & Returns policy in small print at the bottom.
export const FINE = JSON.parse(readFileSync(new URL('./policy_mail.json', import.meta.url))).html;   // full Shipping & Returns, from returns.html (tools/policy_to_mail.py)
export const shell = (title, body, fine = false) => `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;supported-color-schemes:light only}</style></head><body bgcolor="#f6f4f1" style="margin:0;background:#f6f4f1;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:300">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:520px;background:#fff;border-radius:18px">
<tr><td style="padding:28px 28px 0"><img src="https://pajamasdog.com/img/logo2/classic.jpg?v=1" alt="PajamasDog" width="200" style="display:block;width:200px;height:auto;border-radius:12px"></td></tr>
<tr><td style="padding:22px 28px 0;font-size:24px;color:#111">${title}</td></tr>
${body}
<tr><td style="padding:24px 28px 28px;font-size:12px;color:#aaa"><a href="https://pajamasdog.com" style="color:#aaa;text-decoration:none">pajamas.Dog</a>${fine ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #eee;font-size:9.5px;line-height:1.5;color:#b3b3b3">${FINE}</div>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
export const p = t => `<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.6;color:#444">${t}</td></tr>`;
export const btn = (href, label) => `<tr><td style="padding:22px 28px 0" align="center"><a href="${esc(href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:16px;padding:14px 34px;border-radius:999px">${esc(label)}</a></td></tr>`;
export const rows = items => `<tr><td style="padding:18px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee">${
  items.map(i => `<tr><td style="padding:6px 0;font-size:15px;color:#333">${esc(i.name)}</td><td style="padding:6px 0;font-size:15px;color:#333;text-align:right">× ${i.qty}</td></tr>`).join('')}</table></td></tr>`;

export const orderCode = id => id.slice(-8).toUpperCase();
const money = c => '$' + (c / 100).toFixed(2);
const ship = s => s.collected_information?.shipping_details || s.shipping_details || {};

export async function lineItems(id) {
  const li = await stripe(`checkout/sessions/${id}/line_items?limit=50`);
  return (li.data || []).map(x => ({ name: x.description, qty: x.quantity }));
}

// ---- new paid order ----
export async function orderMails(session, cj) {
  const items = await lineItems(session.id);
  const sh = ship(session), a = sh.address || {};
  const code = orderCode(session.id);
  const cjNo = cj?.data?.orderId || cj?.data?.cjOrderId || '';
  const cjAmt = cj?.data?.orderAmount ?? ((cj?.data?.productAmount ?? 0) + (cj?.data?.postageAmount ?? 0));
  const cjCost = cjAmt ? '$' + Number(cjAmt).toFixed(2) : '';
  const cjOk = cj?.result === true || cj?.code === 200;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const live = session.id.startsWith('cs_live_');

  // 형님 (Korean, short): what was bought, CJ order, what to do.
  const oHtml = shell(`🐾 새 주문 ${money(session.amount_total)}`, rows(items)
    + p(`배송지: ${esc(a.city)}, ${esc(a.state)} ${esc(a.country)}<br>주문코드: <b>${code}</b>`)
    + p(cjOk ? `CJ 주문 생성됨 ${esc(cjNo)} ${cjCost ? '· 원가 ' + cjCost : ''}<br><b>승인 버튼을 눌러야 CJ가 발송해요.</b>` : `<b style="color:#c00">CJ 주문 생성 실패</b> — CJ에서 직접 주문하거나 환불하세요.<br>${esc(JSON.stringify(cj).slice(0, 300))}`)
    + (cjOk && cjNo ? btn(approveLink(session.id, cjNo), `승인하고 CJ 결제${cjCost ? ' ' + cjCost : ''}`) : btn('https://www.cjdropshipping.com/myCJ.html#/myOrders', 'CJ 열기'))
    + p('<small>버튼 → 확인 화면 → 한 번 더 눌러야 CJ 잔액에서 결제돼요. CJ 로그인 필요 없음.</small>')
    + p(`<a href="https://dashboard.stripe.com/${live ? '' : 'test/'}payments/${esc(pi)}">Stripe 결제 보기</a>`));
  const oText = `새 주문 ${money(session.amount_total)} · ${code}\n${items.map(i => `- ${i.name} x ${i.qty}`).join('\n')}\n배송지: ${a.city}, ${a.state} ${a.country}\n${cjOk ? `CJ ${cjNo} ${cjCost} — 승인: ${approveLink(session.id, cjNo)}` : 'CJ 주문 생성 실패: ' + JSON.stringify(cj).slice(0, 300)}`;
  await send(OWNER, `[PajamasDog] 새 주문 ${money(session.amount_total)} ${cjOk ? '— 승인 필요' : '— CJ 실패!'}`, oHtml, oText);

  // Buyer: confirmation with the cancel / problem link.
  const to = session.customer_details?.email; if (!to) return;
  const first = (sh.name || session.customer_details?.name || '').trim().split(/\s+/)[0] || 'there';
  const help = `https://pajamasdog.com/help.html?e=${encodeURIComponent(to)}`;
  const bHtml = shell('Thank you — your order is in 🐾', p(`Hi ${esc(first)}, we got your order <b>#${code}</b>.`) + rows(items)
    + p(`Total ${money(session.amount_total)} · free shipping to ${esc(a.city)}, ${esc(a.state)}.<br>It leaves our partner warehouse in 1–3 days, and we e-mail the tracking number when it ships.`)
    + (session.metadata?.gift ? p(`🎁 <b>Your gift reveal is ready.</b> Send this link to ${esc(session.metadata.gift_to || 'them')} — they tap the box to unwrap it:`) + btn(giftLink(session.id), 'Open the gift reveal') : '')
    + p('Need to cancel? You can cancel for a full refund within 12 hours, before it ships.')
    + btn(help, 'Cancel or get help'), true);
  const bText = `Hi ${first}, we got your PajamasDog order #${code}.\n${items.map(i => `- ${i.name} x ${i.qty}`).join('\n')}\nTotal ${money(session.amount_total)}, free shipping.\nWe e-mail the tracking number when it ships.\n${session.metadata?.gift ? `Gift reveal link: ${giftLink(session.id)}\n` : ''}Cancel within 12 hours or get help: ${help}`;
  await send(to, `Order #${code} confirmed — PajamasDog`, bHtml, bText);
}

// ---- cancel / problem form (POST /help) ----
const KINDS = { cancel: 'Cancel my order', damaged: 'Damaged or defective', wrong: 'Wrong item', late: 'Not arrived / no tracking', size: 'Wrong size', other: 'Something else' };
const KO = { cancel: '주문 취소', damaged: '파손/불량', wrong: '오배송', late: '미도착/추적 없음', size: '사이즈', other: '기타' };

export async function helpRequest(body, cjStatus) {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const kind = KINDS[body.kind] ? body.kind : 'other';
  const msg = String(body.message || '').slice(0, 1500);
  const code = String(body.code || '').trim().toUpperCase().slice(0, 12);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, error: 'Please enter the e-mail you used to order.' };

  const list = await stripe(`checkout/sessions?limit=10&customer_details[email]=${encodeURIComponent(email)}&expand[]=data.payment_intent.latest_charge`);
  const orders = (list.data || []).filter(s => s.payment_status === 'paid' && s.metadata?.kind !== 'pack')
    .filter(s => !code || orderCode(s.id) === code);
  if (!orders.length) return { status: 404, error: 'We could not find a paid order for this e-mail. Please check it, or e-mail info@opencbct.com.' };

  const lines = [];
  for (const s of orders.slice(0, 3)) {
    const items = await lineItems(s.id);
    const ch = s.payment_intent?.latest_charge || {};
    const hours = Math.round((Date.now() / 1000 - s.created) / 3600);
    const st = await cjStatus(s.id);
    lines.push({ s, items, hours, st, refunded: ch.amount_refunded || 0 });
  }
  const o = lines[0];
  const canCancel = kind === 'cancel' && o.hours <= 12 && (!o.st || o.st === 'CREATED' || o.st === 'UNPAID');
  const live = o.s.id.startsWith('cs_live_');

  // 형님: what they asked, the order, CJ status, what to do.
  const todo = kind === 'cancel'
    ? (canCancel ? 'CJ 아직 미결제 → Stripe에서 전액 환불하세요. 환불되면 CJ 주문은 2시간 안에 자동 삭제됩니다.' : `12시간 지남 또는 CJ ${o.st || '?'} 상태 → 정책상 취소 불가 안내 또는 예외 판단.`)
    : '사진 확인 후: 교체 재발송(CJ) 또는 Stripe 환불. 정책: 48시간 내 사진, 45일 미이동 재발송.';
  const oHtml = shell(`✋ 고객 요청: ${KO[kind]}`, lines.map(l => rows(l.items)
      + p(`주문 #${orderCode(l.s.id)} · ${money(l.s.amount_total)} · ${l.hours}시간 전 · CJ: ${esc(l.st || '없음')}${l.refunded ? ' · 환불됨 ' + money(l.refunded) : ''}<br>
<a href="https://dashboard.stripe.com/${live ? '' : 'test/'}payments/${esc(l.s.payment_intent?.id)}">Stripe 결제 보기 (환불 버튼)</a>`)).join('')
    + p(`고객: ${esc(email)}<br>메시지: ${esc(msg) || '(없음)'}`)
    + p(`<b>할 일:</b> ${esc(todo)}`)
    + p('이 메일에 답장하면 고객에게 갑니다.'));
  await send(OWNER, `[PajamasDog] 고객 요청 — ${KO[kind]} #${orderCode(o.s.id)}`, oHtml,
    `고객 요청: ${KO[kind]}\n주문 #${orderCode(o.s.id)} ${money(o.s.amount_total)} ${o.hours}h CJ:${o.st}\n고객: ${email}\n${msg}\n할 일: ${todo}`, email);

  // Buyer: we got it.
  const next = kind === 'cancel'
    ? (canCancel ? 'Your order has not shipped yet. We will cancel it and refund you in full — you will get a refund e-mail from Stripe within 1 business day.' : 'Your order is already being processed, so it may not be possible to cancel. We will reply within 2 business days.')
    : (kind === 'damaged' || kind === 'wrong' ? 'Please reply to this e-mail with clear photos of the problem, the product tag and the shipping label. We will reply within 2 business days.' : 'We will reply within 2 business days.');
  await send(email, `We got your request — order #${orderCode(o.s.id)}`, shell('We got your request', p(`<b>${KINDS[kind]}</b> · order #${orderCode(o.s.id)}`) + p(esc(next)), true),
    `We got your request: ${KINDS[kind]} (order #${orderCode(o.s.id)}).\n${next}\nPajamasDog`);
  return { status: 200, ok: true, message: next };
}
