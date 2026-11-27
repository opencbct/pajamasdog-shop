// 11-26 형님: "포장도 상품이야" — digital gift reveal.
// Suppliers can't wrap per order, so the wrapping is an online unboxing the recipient opens from a link.
// One file for both screens: the gift builder on product.html (GiftBuilder.open) and the reveal page gift.html (GiftBox.reveal).
// Options + prices come from server/giftwrap.json (the server checks them again; any premium choice = +$1.99).
const GIFTWRAP = fetch('server/giftwrap.json?v=1').then(r => r.json());
const gEsc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

(function injectCSS(){
  if(document.getElementById('giftCss')) return;
  const s = document.createElement('style'); s.id = 'giftCss';
  s.textContent = `
.gbox{--b:#c89b6d;--b2:#b3855a;--r:#d7192f;--r2:#a50f22;position:relative;width:200px;height:170px;margin:46px auto 10px;transform-style:preserve-3d}
.gbox .body,.gbox .lid{position:absolute;left:0;right:0;background:linear-gradient(160deg,var(--b),var(--b2));box-shadow:inset 0 -10px 18px rgba(0,0,0,.18)}
.gbox .body{bottom:0;height:130px;border-radius:6px}
.gbox .lid{top:0;left:-10px;right:-10px;height:44px;border-radius:7px;z-index:3;transition:transform .9s cubic-bezier(.3,1.6,.5,1),opacity .9s;box-shadow:0 6px 10px rgba(0,0,0,.25),inset 0 -6px 10px rgba(0,0,0,.15)}
.gbox .pat{position:absolute;inset:0;border-radius:inherit;opacity:.55;pointer-events:none}
.gbox[data-pat=dots] .pat{background:radial-gradient(circle,#fff 3px,transparent 4px) 0 0/22px 22px}
.gbox[data-pat=stars] .pat{background:radial-gradient(circle,#ffe9a6 1.5px,transparent 2.5px) 0 0/19px 23px,radial-gradient(circle,#fff 1px,transparent 2px) 9px 11px/27px 31px;opacity:.9}
.gbox[data-pat=plaid] .pat{background:repeating-linear-gradient(0deg,rgba(255,255,255,.0) 0 14px,rgba(255,255,255,.22) 14px 18px,rgba(0,0,0,.0) 18px 34px),repeating-linear-gradient(90deg,rgba(0,0,0,.0) 0 14px,rgba(255,255,255,.22) 14px 18px,rgba(0,0,0,.0) 18px 34px),linear-gradient(90deg,#1f6b3a 50%,#b3122a 50%) 0 0/68px 100%;opacity:.8}
.gbox[data-pat=paws] .pat{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34'%3E%3Cg fill='%23c9a06a'%3E%3Ccircle cx='17' cy='21' r='5'/%3E%3Ccircle cx='10' cy='14' r='2.4'/%3E%3Ccircle cx='15' cy='10' r='2.4'/%3E%3Ccircle cx='20' cy='10' r='2.4'/%3E%3Ccircle cx='25' cy='14' r='2.4'/%3E%3C/g%3E%3C/svg%3E") 0 0/34px 34px;opacity:.9}
.gbox .rv,.gbox .rh{position:absolute;background:linear-gradient(90deg,var(--r2),var(--r) 35%,var(--r) 65%,var(--r2))}
.gbox .body .rv{left:calc(50% - 13px);width:26px;top:0;bottom:0}
.gbox .body .rh{top:calc(50% - 13px);height:26px;left:0;right:0;background:linear-gradient(0deg,var(--r2),var(--r) 35%,var(--r) 65%,var(--r2))}
.gbox .lid .rv{left:calc(50% - 13px);width:26px;top:0;bottom:0}
.gbox .bow{position:absolute;left:50%;top:-30px;width:0;height:0;z-index:4}
.gbox .bow i{position:absolute;width:48px;height:32px;border:9px solid var(--r);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;top:0;box-shadow:inset 0 0 0 2px var(--r2)}
.gbox .bow i:nth-child(1){right:2px;transform:rotate(-18deg)}
.gbox .bow i:nth-child(2){left:2px;transform:rotate(18deg)}
.gbox .bow b{position:absolute;left:-11px;top:16px;width:22px;height:20px;border-radius:7px;background:var(--r);box-shadow:inset 0 -4px 0 var(--r2)}
.gbox.glit .rv,.gbox.glit .rh,.gbox.glit .bow b{background-image:radial-gradient(circle,#fff 1px,transparent 1.6px),linear-gradient(90deg,var(--r2),var(--r) 40%,var(--r) 60%,var(--r2));background-size:7px 7px,100% 100%;animation:glit 1.2s linear infinite}
@keyframes glit{to{background-position:7px 7px,0 0}}
.gbox.open .lid{transform:translate(70px,-170px) rotate(28deg);opacity:0}
.gbox.shake{animation:gshake .5s ease-in-out 2}
@keyframes gshake{25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
.gbox .tis{position:absolute;left:8px;right:8px;top:26px;height:30px;z-index:2;opacity:0;transition:opacity .4s .5s,transform .6s .5s;transform:translateY(20px)}
.gbox .tis i{position:absolute;bottom:0;width:60px;height:54px;background:#fff4f7;clip-path:polygon(50% 0,100% 100%,0 100%);opacity:.92}
.gbox .tis i:nth-child(1){left:6px;transform:rotate(-14deg)}.gbox .tis i:nth-child(2){left:62px;height:64px}.gbox .tis i:nth-child(3){right:6px;transform:rotate(14deg)}
.gbox.open .tis{opacity:1;transform:translateY(-20px)}
.gfx{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:60}
.gfx i{position:absolute;top:-40px;font-style:normal;animation:gfall linear forwards}
@keyframes gfall{to{transform:translate(var(--dx),110vh) rotate(var(--rot))}}
.gfx i.up{top:auto;bottom:-40px;animation-name:grise}
@keyframes grise{to{transform:translate(var(--dx),-110vh) rotate(var(--rot));opacity:.2}}
.gcard{max-width:330px;margin:18px auto 0;border-radius:14px;padding:20px 20px 18px;text-align:left;box-shadow:0 14px 40px rgba(0,0,0,.45);transform:rotate(-1.5deg);font-size:16px;line-height:1.5}
.gcard .to{font-size:13px;opacity:.7}.gcard .msg{font-size:20px;margin:8px 0 10px;white-space:pre-wrap;word-break:break-word}.gcard .fr{text-align:right;font-size:14px;opacity:.8}
.gcard .deco{float:right;font-size:30px;line-height:1}
.gcard .ph{background:#eee;border-radius:2px;margin:0 0 12px;aspect-ratio:1/1;overflow:hidden}.gcard .ph img{width:100%;height:100%;object-fit:cover;display:block}
/* builder sheet */
.gsheet{position:fixed;inset:0;z-index:55;background:rgba(10,9,14,.72);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s}
.gsheet.on{opacity:1}
.gsheet .in{background:var(--bg,#15131c);color:var(--txt,#f3f1f8);width:100%;max-width:560px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:14px 16px 18px;transform:translateY(30px);transition:transform .25s}
.gsheet.on .in{transform:none}
.gsheet .top{display:flex;align-items:center;justify-content:space-between}
.gsheet .top h2{font-weight:300;font-size:22px;margin:0}
.gsheet .x{background:none;border:0;color:inherit;font-size:28px;cursor:pointer;opacity:.7;padding:0 4px}
.gsheet .note{font-size:12px;opacity:.6;margin:2px 0 0}
.gsheet .stage{position:relative;height:230px;border-radius:18px;background:radial-gradient(circle at 50% 70%,#2c2740,#15131c 70%);margin:10px 0 6px;overflow:hidden}
.gsheet .stage .gbox{transform:scale(.9);margin-top:34px}
.gsheet .tabs{display:flex;gap:6px;overflow:auto;margin:8px 0}
.gsheet .tabs button{flex:1;min-width:0;white-space:nowrap;background:var(--chip,#26222f);color:inherit;border:0;border-radius:999px;padding:9px 4px;font:inherit;font-size:14px;cursor:pointer}
.gsheet .tabs button.on{background:#fff;color:#15131c}
.gsheet .opts{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x mandatory}
.gsheet .opt{flex:0 0 auto;width:78px;background:none;border:0;color:inherit;font:inherit;font-size:12px;text-align:center;cursor:pointer;scroll-snap-align:start;padding:0}
.gsheet .sw{width:64px;height:64px;margin:0 auto 5px;border-radius:16px;position:relative;display:flex;align-items:center;justify-content:center;font-size:26px;border:2px solid transparent;overflow:hidden}
.gsheet .opt.on .sw{border-color:#fff;box-shadow:0 0 0 3px var(--pink,#ff3d7f)}
.gsheet .sw .pr{position:absolute;right:3px;top:3px;font-size:10px;background:#ffd36b;color:#3a2a00;border-radius:6px;padding:0 4px;line-height:15px}
.gsheet label{display:block;font-size:13px;opacity:.75;margin:10px 0 4px}
.gsheet input,.gsheet textarea{width:100%;box-sizing:border-box;background:var(--chip,#26222f);color:inherit;border:1px solid #3a3446;border-radius:12px;padding:11px 12px;font:inherit;font-size:16px}
.gsheet textarea{min-height:74px;resize:vertical}
.gsheet .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gsheet .presets{display:flex;gap:6px;overflow-x:auto;margin-top:6px}
.gsheet .presets button{flex:0 0 auto;background:var(--chip,#26222f);color:inherit;border:0;border-radius:999px;padding:7px 11px;font:inherit;font-size:13px;cursor:pointer}
.gsheet .sum{display:flex;justify-content:space-between;font-size:14px;margin:14px 2px 10px;opacity:.85}
.gsheet .peek{display:block;width:100%;background:none;border:1px solid #4a4358;color:inherit;border-radius:999px;padding:12px;font:inherit;font-size:15px;margin-top:8px;cursor:pointer}
@media(prefers-reduced-motion:reduce){.gbox .lid{transition:none}.gfx{display:none}}
`;
  document.head.appendChild(s);
})();

const GiftBox = {
  // look = {box, ribbon, inside, card} keys → the option objects
  pick(W, look){ const f = (l, k) => W[l].find(o => o.k === k) || W[l][0];
    return {box: f('box', look.box), ribbon: f('ribbon', look.ribbon), inside: f('inside', look.inside), card: f('card', look.card)}; },
  tier(o){ return Object.values(o).some(x => x.tier === 'premium') ? 'premium' : 'free'; },
  html(o){
    return `<div class="gbox${o.ribbon.glitter ? ' glit' : ''}" data-pat="${o.box.pat || ''}" style="--b:${o.box.bg};--b2:${o.box.bg2};--r:${o.ribbon.c};--r2:${o.ribbon.c2}">
      <div class="tis"><i></i><i></i><i></i></div>
      <div class="lid"><div class="pat"></div><div class="rv"></div><div class="bow"><i></i><i></i><b></b></div></div>
      <div class="body"><div class="pat"></div><div class="rv"></div><div class="rh"></div></div></div>`;
  },
  // Effects that pour out when the box opens
  fx(kind, ms = 4500){
    if(kind === 'tissue' || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const L = document.createElement('div'); L.className = 'gfx'; document.body.appendChild(L);
    const set = {confetti: ['🎊','🎉','✨','🟥','🟨','🟦','🟩'], snow: ['❄️','❅','❆','•'], hearts: ['❤️','💖','💕','💗'], paws: ['🐾','🐾','🦴','🐾']}[kind] || ['✨'];
    const up = kind === 'hearts';
    for(let i = 0; i < 46; i++){
      const e = document.createElement('i'); e.textContent = set[i % set.length]; if(up) e.className = 'up';
      e.style.left = Math.random() * 100 + 'vw'; e.style.fontSize = (14 + Math.random() * 18) + 'px';
      e.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); e.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      e.style.animationDuration = (2.4 + Math.random() * 2.6) + 's'; e.style.animationDelay = (Math.random() * 1.2) + 's';
      if(kind === 'snow') e.style.color = '#fff';
      L.appendChild(e);
    }
    setTimeout(() => L.remove(), ms + 2500);
  },
  card(o, g, photo){
    const c = o.card;
    return `<div class="gcard" style="background:${c.bg};color:${c.ink}">
      ${c.photo && photo ? `<div class="ph"><img src="${gEsc(photo)}" alt=""></div>` : ''}
      ${c.deco ? `<span class="deco">${c.deco}</span>` : ''}
      <div class="to">${g.to ? 'To ' + gEsc(g.to) : 'For you'}</div>
      <div class="msg">${gEsc(g.msg || 'A little something for your pup! 🐾')}</div>
      <div class="fr">${g.from ? '— ' + gEsc(g.from) : ''}</div></div>`;
  },
};

// ---- Builder: a sheet over the product page. One decision per tab: Box · Ribbon · Inside · Card · Message.
const GiftBuilder = {
  async open({photo = '', onBuy, total = 0}){
    const W = await GIFTWRAP;
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('pd:gift') || '{}'); } catch(e){}
    const g = Object.assign({box: 'kraft', ribbon: 'red', inside: 'tissue', card: 'classic', to: '', from: '', msg: ''}, saved);
    let tab = 'box';
    const el = document.createElement('div'); el.className = 'gsheet';
    el.innerHTML = `<div class="in" role="dialog" aria-label="Gift wrap">
      <div class="top"><h2>🎁 Send it as a gift</h2><button class="x" aria-label="Close">×</button></div>
      <p class="note">Online unboxing: they open the box on their phone. The parcel ships as usual, with no prices inside.</p>
      <div class="stage"></div>
      <div class="tabs">${['box','ribbon','inside','card','note'].map(t => `<button data-t="${t}">${{box:'Box',ribbon:'Ribbon',inside:'Inside',card:'Card',note:'Message'}[t]}</button>`).join('')}</div>
      <div class="pane"></div>
      <div class="sum"><span class="tl"></span><span class="tp"></span></div>
      <button class="btn gbuy">Buy as a gift</button>
      <button class="peek">▶ Preview the unboxing</button>
    </div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const $ = s => el.querySelector(s);
    const save = () => { try { sessionStorage.setItem('pd:gift', JSON.stringify(g)); } catch(e){} };
    const draw = () => {
      const o = GiftBox.pick(W, g), prem = GiftBox.tier(o) === 'premium';
      $('.stage').innerHTML = GiftBox.html(o);
      el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
      if(tab === 'note'){
        $('.pane').innerHTML = `<div class="row2"><div><label>To</label><input id="gto" maxlength="40" placeholder="Max & Mom" value="${gEsc(g.to)}"></div>
          <div><label>From</label><input id="gfr" maxlength="40" placeholder="Aunt Jenny" value="${gEsc(g.from)}"></div></div>
          <label>Card message</label><textarea id="gmsg" maxlength="280" placeholder="Write a few words…">${gEsc(g.msg)}</textarea>
          <div class="presets">${W.messages.map(m => `<button>${gEsc(m)}</button>`).join('')}</div>`;
        $('#gto').oninput = e => { g.to = e.target.value; save(); };
        $('#gfr').oninput = e => { g.from = e.target.value; save(); };
        $('#gmsg').oninput = e => { g.msg = e.target.value; save(); };
        el.querySelectorAll('.presets button').forEach(b => b.onclick = () => { g.msg = b.textContent; $('#gmsg').value = g.msg; save(); });
      } else {
        const list = W[tab];
        $('.pane').innerHTML = `<div class="opts">${list.map(x => `<button class="opt${g[tab] === x.k ? ' on' : ''}" data-k="${x.k}">
          <div class="sw" style="${GiftBuilder.swatch(tab, x)}">${tab === 'inside' ? {tissue:'🧻',confetti:'🎊',snow:'❄️',hearts:'💕',paws:'🐾'}[x.fx] : tab === 'card' ? (x.deco || '✉️') : ''}${x.tier === 'premium' ? '<span class="pr">★</span>' : ''}</div>${gEsc(x.name)}</button>`).join('')}</div>`;
        el.querySelectorAll('.opt').forEach(b => b.onclick = () => { g[tab] = b.dataset.k; save(); draw();
          if(tab === 'inside') GiftBox.fx(g.inside, 2500); });
      }
      const add = prem ? W.price.premium / 100 : 0;
      $('.tl').textContent = prem ? 'Premium gift reveal ★' : 'Gift reveal';
      $('.tp').textContent = prem ? `+$${add.toFixed(2)}` : 'Free';
      $('.gbuy').textContent = total ? `Buy as a gift · $${(total + add).toFixed(2)}` : 'Buy as a gift';
    };
    el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
    $('.x').onclick = close; el.addEventListener('click', e => { if(e.target === el) close(); });
    $('.peek').onclick = () => {
      const box = $('.stage .gbox'); box.classList.remove('open'); box.classList.add('shake');
      setTimeout(() => { box.classList.remove('shake'); box.classList.add('open'); GiftBox.fx(g.inside); }, 1000);
      setTimeout(() => { $('.stage').insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;background:rgba(0,0,0,.35)">${GiftBox.card(GiftBox.pick(W, g), g, photo).replace('class="gcard"', 'class="gcard" style="max-width:260px;font-size:14px"')}</div>`); }, 1900);
      setTimeout(draw, 5200);
    };
    $('.gbuy').onclick = () => { save(); onBuy({on: true, box: g.box, ribbon: g.ribbon, inside: g.inside, card: g.card, to: g.to.trim(), from: g.from.trim(), msg: g.msg.trim()}); };
    draw();
  },
  swatch(tab, x){
    if(tab === 'box') return `background:linear-gradient(160deg,${x.bg},${x.bg2})`;
    if(tab === 'ribbon') return `background:linear-gradient(90deg,#2a2634 0 36%,${x.c2} 36%,${x.c} 46%,${x.c} 54%,${x.c2} 64%,#2a2634 64%)`;
    if(tab === 'card') return `background:${x.bg};color:${x.ink}`;
    return 'background:#2a2634';
  },
};
