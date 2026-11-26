// 11-26: CJ housekeeping (runs on the same 2-hour schedule as tracking e-mails).
//  - unpaid CJ order whose Stripe payment was fully refunded → remove it in CJ and tell 형님 (so he never pays for a cancelled order)
//  - unpaid CJ order older than 12 h → remind 형님 once a day to pay it in CJ
import { OWNER, send, shell, p as para, btn, orderCode, stripe } from './notify.mjs';
import { cjOrders } from './tracking.mjs';
import { approveLink } from './approve.mjs';

const UNPAID = new Set(['CREATED', 'UNPAID', 'IN_CART']);

export async function cjSweep(token) {
  const live = process.env.STAGE === 'live';
  const today = new Date().toISOString().slice(0, 10);
  const remind = [], removed = [];
  for (const o of await cjOrders(token)) {
    if (!UNPAID.has(o.orderStatus) || !/^cs_(live|test)_/.test(o.orderNum || '')) continue;
    if (live && !o.orderNum.startsWith('cs_live_')) continue;
    const s = await stripe(`checkout/sessions/${o.orderNum}?expand[]=payment_intent.latest_charge`);
    const pi = s.payment_intent; if (!pi?.id) continue;
    const ch = pi.latest_charge || {};
    if (ch.refunded || (ch.amount_refunded && ch.amount_refunded >= ch.amount)) {
      const d = await fetch(`https://developers.cjdropshipping.com/api2.0/v1/shopping/order/deleteOrder?orderId=${encodeURIComponent(o.orderId)}`,
        { method: 'DELETE', headers: { 'CJ-Access-Token': token } }).then(r => r.json()).catch(e => ({ error: String(e) }));
      removed.push({ code: orderCode(o.orderNum), cj: o.cjOrderId || o.orderId, ok: d?.result === true || d?.code === 200 });
      continue;
    }
    const hours = (Date.now() / 1000 - s.created) / 3600;
    if (hours >= 12 && pi.metadata?.cj_reminded !== today) {
      remind.push({ link: approveLink(o.orderNum, o.orderId), code: orderCode(o.orderNum), cj: o.cjOrderId || o.orderId, hours: Math.round(hours), amt: s.amount_total });
      await stripe(`payment_intents/${pi.id}`, new URLSearchParams({ 'metadata[cj_reminded]': today }));
    }
  }
  if (removed.length) await send(OWNER, `[PajamasDog] 환불된 주문 ${removed.length}건 — CJ 주문 지움`,
    shell('환불된 주문은 CJ에서 지웠어요', removed.map(r => para(`#${r.code} · CJ ${r.cj} · ${r.ok ? '지움' : '<b style="color:#c00">실패 — CJ에서 직접 지우세요</b>'}`)).join('')),
    removed.map(r => `#${r.code} CJ ${r.cj} ${r.ok ? 'removed' : 'FAILED'}`).join('\n'));
  if (remind.length) await send(OWNER, `[PajamasDog] CJ 미결제 주문 ${remind.length}건 — 결제해야 발송`,
    shell('아직 승인 안 된 주문', remind.map(r => para(`#${r.code} · $${(r.amt / 100).toFixed(2)} · ${r.hours}시간 전 · CJ ${r.cj}`) + btn(r.link, `#${r.code} 승인하고 CJ 결제`)).join('')),
    remind.map(r => `#${r.code} $${(r.amt / 100).toFixed(2)} ${r.hours}h CJ ${r.cj}\n${r.link}`).join('\n'));
  return { removed, remind };
}
