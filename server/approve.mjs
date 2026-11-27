// 11-26 형님: "승인하고 결제" button in the order e-mail — no CJ login.
// GET  /approve?s=<stripe session>&o=<CJ order id>&x=<expiry>&t=<sig>  → shows a confirm page (nothing is paid on GET,
//      because mail apps open links on their own to preview them)
// POST /approve (same fields)                                         → pays THIS CJ order from the CJ wallet balance
// Signed with a key derived from STRIPE_WEBHOOK_SECRET, valid 7 days; a paid order can't be paid twice (CJ status check).
import crypto from 'node:crypto';
import { stripe, esc, orderCode } from './notify.mjs';

export const API_BASE = 'https://6l5lt5zx2k7jra6ynbmmd32usm0nhbay.lambda-url.us-east-1.on.aws';
const CJ = 'https://developers.cjdropshipping.com/api2.0/v1';
const key = () => crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '').update('pd-approve-v1').digest();
const sig = (s, o, x) => crypto.createHmac('sha256', key()).update(`${s}|${o}|${x}`).digest('base64url');

export function approveLink(sessionId, cjOrderId) {
  const x = Math.floor(Date.now() / 1000) + 7 * 86400;
  return `${API_BASE}/approve?s=${encodeURIComponent(sessionId)}&o=${encodeURIComponent(cjOrderId)}&x=${x}&t=${sig(sessionId, cjOrderId, x)}`;
}

function check(q) {
  const { s = '', o = '', x = '', t = '' } = q;
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(s) || !/^[A-Za-z0-9]{6,40}$/.test(o) || !/^\d+$/.test(x)) return 'Bad link.';
  const a = Buffer.from(sig(s, o, x)), b = Buffer.from(String(t));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'Bad link.';
  if (+x < Date.now() / 1000) return '링크가 만료됐어요 (7일). CJ에서 직접 결제해 주세요.';
  return '';
}

// 11-27 형님: "승인 버튼에 폰 인증 넣자" — paying also needs the 6-digit code from his phone's authenticator app
// (Google Authenticator, account "PajamasDog approve"). Secret = Lambda env APPROVE_TOTP_SECRET (base32). No secret → never pay.
function b32(str) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of String(str).replace(/[\s=]/g, '').toUpperCase()) { const v = A.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
  return Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
}
function totp(key, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', key).update(msg).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
export function phoneCodeOk(code) {
  const key = b32(process.env.APPROVE_TOTP_SECRET || '');
  if (!key || key.length < 10 || !/^\d{6}$/.test(String(code || ''))) return false;
  const now = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some(d => crypto.timingSafeEqual(Buffer.from(totp(key, now + d)), Buffer.from(String(code))));
}

const page = (title, body) => ({ statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#15131c;color:#f2eef8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:300}main{max-width:460px;margin:0 auto;padding:28px 18px}
h1{font-weight:300;font-size:26px;margin:8px 0 14px}p{line-height:1.6;opacity:.9;margin:0 0 10px}.box{background:#211e2b;border-radius:16px;padding:16px 18px;margin:16px 0}
button{width:100%;border:0;border-radius:999px;background:#ff3d7f;color:#fff;font:inherit;font-size:18px;padding:16px;margin-top:10px;cursor:pointer}button:disabled{opacity:.5}
input.code{width:100%;box-sizing:border-box;background:#211e2b;color:#fff;border:1px solid #3a3446;border-radius:14px;padding:14px;font:inherit;font-size:28px;letter-spacing:8px;text-align:center;margin-top:8px}.ok{color:#7ee2a8}.bad{color:#ff8a8a}small{opacity:.6}</style></head><body><main><img src="https://pajamasdog.com/img/logo2/logo3.png?v=1" alt="PajamasDog" height="56">${body}</main></body></html>` });

async function cjGet(token, path) { return fetch(`${CJ}${path}`, { headers: { 'CJ-Access-Token': token } }).then(r => r.json()).catch(() => ({})); }
async function cjSend(token, method, path, body) {
  return fetch(`${CJ}${path}`, { method, headers: { 'CJ-Access-Token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ message: String(e) }));
}

// Everything we must know before money moves.
async function state(token, s, o) {
  const [sess, det, bal] = await Promise.all([
    stripe(`checkout/sessions/${s}?expand[]=payment_intent.latest_charge`),
    cjGet(token, `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(o)}`),
    cjGet(token, '/shopping/pay/getBalance')]);
  const d = det.data || {};
  const cost = d.orderAmount ?? ((d.productAmount || 0) + (d.postageAmount || 0));
  const ch = sess.payment_intent?.latest_charge || {};
  return { sess, d, cost: +cost || 0, balance: bal.data?.amount, paid: sess.payment_status === 'paid', refunded: !!(ch.refunded || ch.amount_refunded),
    sameOrder: d.orderNum === s || d.orderNumber === s };
}

export async function approve(event, cjToken) {
  const q = event.requestContext?.http?.method === 'POST'
    ? Object.fromEntries(new URLSearchParams(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '')))
    : Object.fromEntries(new URLSearchParams(event.rawQueryString || ''));
  const bad = check(q); if (bad) return page('PajamasDog', `<h1 class="bad">${esc(bad)}</h1>`);
  const token = await cjToken();
  const st = await state(token, q.s, q.o);
  const code = orderCode(q.s);
  const head = `<div class="box">주문 <b>#${code}</b> · 손님 결제 $${((st.sess.amount_total || 0) / 100).toFixed(2)}<br>CJ ${esc(q.o)} · 상태 ${esc(st.d.orderStatus || '?')}<br>CJ 원가 <b>$${st.cost.toFixed(2)}</b> · CJ 잔액 ${st.balance != null ? '$' + Number(st.balance).toFixed(2) : '?'}</div>`;

  // Refuse anything odd: not the same order, not paid by the buyer, refunded, already paid at CJ, cost above what the buyer paid, low balance.
  const why = !st.sameOrder ? 'CJ 주문과 Stripe 주문이 맞지 않아요.'
    : !st.paid ? '손님 결제가 확인되지 않았어요.'
    : st.refunded ? '이미 환불된 주문이에요. 결제하지 마세요.'
    : !['CREATED', 'IN_CART', 'UNPAID'].includes(st.d.orderStatus) ? `이미 처리된 주문이에요 (CJ 상태 ${esc(st.d.orderStatus)}).`
    : !(st.cost > 0) || st.cost * 100 > (st.sess.amount_total || 0) ? 'CJ 원가가 이상해요. CJ에서 직접 확인해 주세요.'
    : st.balance != null && +st.balance < st.cost ? `CJ 잔액이 모자라요. CJ 지갑에 $${(st.cost - st.balance).toFixed(2)} 이상 충전한 뒤 이 버튼을 다시 눌러 주세요.`
    : '';

  if (event.requestContext?.http?.method !== 'POST') {
    if (why) return page('PajamasDog 승인', `<h1>CJ 결제 승인</h1>${head}<p class="bad">${why}</p>`);
    // 11-26: buyers may cancel for 12 h. Paying CJ before that risks paying for an order that gets cancelled.
    const hrs = (Date.now() / 1000 - (st.sess.created || 0)) / 3600;
    const wait = hrs < 12 ? `<p class="bad">⏳ 손님 취소 가능 시간 안이에요 (주문 ${Math.floor(hrs)}시간 전). ${Math.ceil(12 - hrs)}시간 뒤에 승인하면 취소돼도 CJ 돈이 안 나가요.</p>` : '';
    return page('PajamasDog 승인', `<h1>CJ 결제 승인</h1>${head}${wait}
<form method="post" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='결제 중…'">
${['s', 'o', 'x', 't'].map(k => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join('')}
<p style="margin-top:14px">📱 폰 인증 앱(PajamasDog approve)의 6자리 숫자</p>
<input class="code" name="c" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required placeholder="••••••">
<button>CJ 잔액으로 $${st.cost.toFixed(2)} 결제하고 발송</button></form><p><small>누르면 CJ 지갑에서 이 주문 원가만 빠져나가요.</small></p>`);
  }
  if (why) return page('PajamasDog 승인', `<h1>결제 안 함</h1>${head}<p class="bad">${why}</p>`);
  if (!phoneCodeOk(q.c)) {
    console.log('approve: wrong phone code', q.o);
    await new Promise(r => setTimeout(r, 1500));   // slow down guessing
    const back = `${API_BASE}/approve?${['s', 'o', 'x', 't'].map(k => `${k}=${encodeURIComponent(q[k])}`).join('&')}`;
    return page('PajamasDog 승인', `<h1 class="bad">폰 인증 숫자가 틀렸어요</h1>${head}<p>결제 안 했어요. 앱의 새 숫자로 다시 해 주세요.</p><p><a href="${esc(back)}" style="color:#ff8fb8">다시 하기</a></p>`);
  }

  // Confirm (CREATED → UNPAID) if needed, then pay from balance.
  let conf = null;
  if (st.d.orderStatus !== 'UNPAID') conf = await cjSend(token, 'PATCH', '/shopping/order/confirmOrder', { orderId: q.o });
  const pay = await cjSend(token, 'POST', '/shopping/pay/payBalance', { orderId: q.o });
  console.log('approve', JSON.stringify({ o: q.o, conf: conf && { code: conf.code, msg: conf.message }, pay: { code: pay.code, result: pay.result, msg: pay.message } }));
  const ok = pay.result === true || pay.code === 200;
  const after = await cjGet(token, `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(q.o)}`);
  return page('PajamasDog 승인', ok
    ? `<h1 class="ok">✓ 결제 완료 — CJ가 발송해요</h1>${head}<p>CJ 상태: ${esc(after.data?.orderStatus || '?')}. 발송되면 손님에게 추적 메일이 자동으로 가요.</p>`
    : `<h1 class="bad">결제 실패</h1>${head}<p>CJ 응답: ${esc(pay.message || JSON.stringify(pay).slice(0, 200))}${conf && !(conf.result === true || conf.code === 200) ? '<br>확인 단계: ' + esc(conf.message) : ''}</p><p>CJ에서 직접 결제해 주세요.</p>`);
}
