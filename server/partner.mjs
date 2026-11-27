// 11-27 형님: PajamasDog partner (affiliate) program — pet influencers.
// Followers get 10% off with the partner's code; the partner earns 15% of what the buyer paid, paid monthly by 형님 via PayPal Business.
//   POST /partner-apply     {name, handle, platform, followers, email, paypal, code, hp}  → mails 형님 (approve button) + the applicant
//   GET  /partner-approve   ?d=<data>&t=<sig>   → confirm page (nothing happens on GET)
//   POST /partner-approve   same + c=<6-digit phone code> → creates the Stripe promotion code, mails the partner their code + link
//   refCode(code)           → active promotion-code id for checkout (?ref=CODE auto-applies it)
import crypto from 'node:crypto';
import { send, shell, p, btn, esc, stripe, OWNER } from './notify.mjs';
import { API_BASE, phoneCodeOk } from './approve.mjs';

export const PARTNER_COUPON = 'PD_PARTNER10';      // 10% off, once — 형님 creates it once in Stripe (or the key gets coupon write)
export const COMMISSION = 0.15;
const key = () => crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '').update('pd-partner-v1').digest();
const sig = s => crypto.createHmac('sha256', key()).update(s).digest('base64url');
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const emailOk = e => /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i.test(e);
const codeOf = s => clean(s, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
const page = (title, body) => ({ statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#15131c;color:#f2eef8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:300}main{max-width:460px;margin:0 auto;padding:28px 18px}
h1{font-weight:300;font-size:26px}.box{background:#211e2b;border-radius:16px;padding:16px 18px;margin:16px 0;line-height:1.7}
input{width:100%;box-sizing:border-box;background:#211e2b;color:#fff;border:1px solid #3a3446;border-radius:14px;padding:14px;font:inherit;font-size:22px;letter-spacing:4px;text-align:center;margin-top:8px}
button{width:100%;border:0;border-radius:999px;background:#ff3d7f;color:#fff;font:inherit;font-size:18px;padding:16px;margin-top:10px}.ok{color:#7ee2a8}.bad{color:#ff8a8a}</style></head>
<body><main><img src="https://pajamasdog.com/img/logo2/logo3.png?v=1" alt="PajamasDog" height="56">${body}</main></body></html>` });
const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---- apply ----
export async function partnerApply(b) {
  if (b.hp) return json(200, { ok: true });
  const a = { name: clean(b.name, 60), handle: clean(b.handle, 60).replace(/^@/, ''), platform: clean(b.platform, 20), followers: clean(b.followers, 20),
    email: clean(b.email, 120).toLowerCase(), paypal: clean(b.paypal, 120).toLowerCase(), code: codeOf(b.code || b.handle) };
  if (!a.name || !a.handle) return json(400, { error: 'Please enter your name and your account.' });
  if (!emailOk(a.email) || !emailOk(a.paypal)) return json(400, { error: 'Please enter a valid e-mail and PayPal e-mail.' });
  if (a.code.length < 3) return json(400, { error: 'Please choose a code with at least 3 letters or numbers.' });
  if (!b.agree) return json(400, { error: 'Please accept the partner rules.' });
  const d = Buffer.from(JSON.stringify({ ...a, at: Date.now() })).toString('base64url');
  const link = `${API_BASE}/partner-approve?d=${d}&t=${sig(d)}`;
  console.log('PARTNER_APPLY', JSON.stringify({ handle: a.handle, platform: a.platform, followers: a.followers, email: a.email, code: a.code }));
  await send(OWNER, `[PajamasDog] 파트너 신청 @${a.handle} (${a.followers || '?'} 팔로워)`,
    shell('🐾 새 파트너 신청', p(`이름: ${esc(a.name)}<br>계정: ${esc(a.platform)} <b>@${esc(a.handle)}</b><br>팔로워: ${esc(a.followers)}<br>이메일: ${esc(a.email)}<br>PayPal: ${esc(a.paypal)}<br>원하는 코드: <b>${esc(a.code)}10</b>`)
      + p('계정을 먼저 열어 보세요 (진짜 반려견 계정인지, 팔로워가 진짜인지).') + btn(link, '승인하고 코드 만들기')),
    `파트너 신청 @${a.handle} ${a.platform} ${a.followers}\n${a.email} / PayPal ${a.paypal}\n승인: ${link}`);
  await send(a.email, 'We got your PajamasDog partner application 🐾',
    shell('Thanks for applying!', p(`Hi ${esc(a.name)}, we got your application for <b>@${esc(a.handle)}</b>. We look at every account by hand and reply within a few days.`), true),
    `Hi ${a.name}, we got your PajamasDog partner application for @${a.handle}. We reply within a few days.`);
  return json(200, { ok: true });
}

// ---- approve (형님) ----
export async function partnerApprove(event) {
  const post = event.requestContext?.http?.method === 'POST';
  const q = Object.fromEntries(new URLSearchParams(post ? (event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '') : event.rawQueryString || ''));
  const good = q.d && q.t && Buffer.from(sig(q.d)).length === Buffer.from(String(q.t)).length && crypto.timingSafeEqual(Buffer.from(sig(q.d)), Buffer.from(String(q.t)));
  if (!good) return page('파트너 승인', '<h1 class="bad">잘못된 링크예요.</h1>');
  const a = JSON.parse(Buffer.from(q.d, 'base64url').toString());
  const code = codeOf(q.code || (a.code + '10'));
  const info = `<div class="box">${esc(a.name)} · ${esc(a.platform)} <b>@${esc(a.handle)}</b> · ${esc(a.followers)} 팔로워<br>PayPal ${esc(a.paypal)}</div>`;
  if (!post) return page('파트너 승인', `<h1>파트너 승인</h1>${info}<form method="post">
<input type="hidden" name="d" value="${esc(q.d)}"><input type="hidden" name="t" value="${esc(q.t)}">
<p>코드 (손님이 입력)</p><input name="code" value="${esc(code)}" maxlength="20" style="letter-spacing:2px">
<p style="margin-top:14px">📱 폰 인증 앱(PajamasDog approve)의 6자리 숫자</p><input name="c" inputmode="numeric" maxlength="6" required placeholder="••••••">
<button>승인하고 코드 만들기</button></form>`);
  if (!phoneCodeOk(q.c)) { await new Promise(r => setTimeout(r, 1500)); return page('파트너 승인', `<h1 class="bad">폰 인증 숫자가 틀렸어요</h1>${info}<p>아무것도 안 만들었어요. 메일의 버튼으로 다시 해 주세요.</p>`); }
  const form = new URLSearchParams({ coupon: PARTNER_COUPON, code, 'metadata[partner]': code, 'metadata[handle]': a.handle, 'metadata[platform]': a.platform,
    'metadata[email]': a.email, 'metadata[paypal]': a.paypal, 'metadata[name]': a.name });
  const pc = await stripe('promotion_codes', form);
  if (!pc.id) return page('파트너 승인', `<h1 class="bad">코드를 못 만들었어요</h1>${info}<p>Stripe: ${esc(pc.error?.message || '?')}</p><p>코드 ${esc(code)} 이 이미 있거나, 쿠폰 ${PARTNER_COUPON} 이 없거나, 키 권한이 없을 수 있어요.</p>`);
  console.log('PARTNER_APPROVED', JSON.stringify({ code, handle: a.handle, email: a.email }));
  const link = `https://pajamas.dog/?ref=${code}`;
  await send(a.email, `You're a PajamasDog partner! Your code: ${code} 🐾`,
    shell('Welcome to the pack! 🐾', p(`Hi ${esc(a.name)}, you're in. Your followers get <b>10% off</b> with your code, and you earn <b>15%</b> of every order they pay for.`)
      + `<tr><td style="padding:18px 28px 0" align="center"><div style="display:inline-block;border:2px dashed #ff3d7f;border-radius:14px;padding:12px 26px;font-size:26px;letter-spacing:3px;color:#111;font-weight:600">${esc(code)}</div></td></tr>`
      + p(`Your link (the code fills in by itself): <a href="${link}">${link.replace('https://', '')}</a>`)
      + p('<b>The rules</b><br>• Always mark posts as <b>#ad</b> or "PajamasDog partner" (US FTC rule).<br>• No buying with your own code, no coupon websites, no search ads on our brand name.<br>• Commission counts for orders 30 days after purchase (after the cancel window). Paid monthly by PayPal once you reach $25.<br>• US partners: we ask for a W-9 before you pass $600 in a year.')
      + p('Ideas: our free AI fashion show (put your dog on the runway) and gift unboxing make great posts.') + btn(link, 'Open my link'), true),
    `You're a PajamasDog partner. Code: ${code}. Link: ${link}. Followers get 10% off, you earn 15%. Mark posts #ad. Paid monthly by PayPal from $25.`);
  return page('파트너 승인', `<h1 class="ok">✓ 승인 완료</h1>${info}<div class="box">코드 <b>${esc(code)}</b><br>링크 ${esc(link)}</div><p>파트너에게 환영 메일을 보냈어요.</p>`);
}

// ---- checkout: ?ref=CODE ----
export async function refCode(raw) {
  const code = codeOf(raw); if (code.length < 3) return null;
  const r = await stripe(`promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`);
  const pc = r.data?.[0];
  return pc && pc.metadata?.partner ? { id: pc.id, code } : null;
}
