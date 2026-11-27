// 11-27 형님: "첫 구매 10%" — the welcome pop-up on pajamasdog.com posts an e-mail here.
// We e-mail the code WELCOME10 (Stripe promotion code, first order only; checkout has allow_promotion_codes on).
// The list lives in CloudWatch Logs as "JOIN {...}" lines (no new database); tools/join_list.sh exports it.
import { send, shell, p, btn, esc } from './notify.mjs';

const CODE = 'WELCOME10';
const ok = e => /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i.test(e);

export async function welcome(body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (body.hp) return { status: 200, ok: true };                 // honeypot: bots fill the hidden field
  if (!ok(email)) return { status: 400, error: 'Please enter a valid e-mail.' };
  console.log('JOIN', JSON.stringify({ email, at: new Date().toISOString(), from: String(body.from || '').slice(0, 80) }));
  const html = shell('Your 10% off code', p('Welcome to PajamasDog! 🐾 Here is 10% off your first order:')
    + `<tr><td style="padding:18px 28px 0" align="center"><div style="display:inline-block;border:2px dashed #ff3d7f;border-radius:14px;padding:14px 28px;font-size:28px;letter-spacing:3px;color:#111;font-weight:600">${CODE}</div></td></tr>`
    + p('Type it in the <b>promotion code</b> box on the payment page. One use per customer, first order only.')
    + btn('https://pajamasdog.com/?code=' + CODE, 'Shop now')
    + p(`<span style="font-size:12px;color:#999">You get this because ${esc(email)} asked for the code on pajamasdog.com. We may send an occasional new-arrivals note; reply "unsubscribe" and we stop.</span>`));
  const text = `Welcome to PajamasDog! Your 10% off code for your first order: ${CODE}\nType it in the promotion code box on the payment page.\nhttps://pajamasdog.com\nReply "unsubscribe" to stop e-mails.`;
  await send(email, `🐾 Your 10% off code: ${CODE}`, html, text);
  return { status: 200, ok: true, code: CODE };
}
