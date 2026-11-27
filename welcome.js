// 11-27 형님: first-order 10% pop-up (like Ruffwear's, but by e-mail: SMS costs money + 10DLC paperwork).
// Shown once per visitor, 15 s after landing. The server e-mails the code WELCOME10 (server/welcome.mjs).
(function(){
  const K = 'pd:welcome';
  const get = () => { try { return localStorage.getItem(K); } catch(e){ return '1'; } };   // no storage → never nag
  const set = v => { try { localStorage.setItem(K, v); } catch(e){} };
  if(get() || typeof CHECKOUT_API === 'undefined' || !CHECKOUT_API) return;
  const css = `
.wpop{position:fixed;inset:0;z-index:70;background:rgba(10,9,14,.7);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .3s}
.wpop.on{opacity:1}
.wpop .in{position:relative;width:100%;max-width:400px;background:var(--card,#221f2d);color:var(--txt,#f3f1f8);border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);transform:scale(.94);transition:transform .3s}
.wpop.on .in{transform:none}
.wpop .ph{height:190px;background:url(img/hero_winter.webp) center 30%/cover}
.wpop .bd{padding:18px 20px 20px;text-align:center}
.wpop h2{font-weight:300;font-size:30px;line-height:1.15;margin:0 0 6px}
.wpop h2 b{font-weight:600;color:var(--pink,#ff3d7f)}
.wpop p{margin:0 0 14px;opacity:.75;font-size:15px}
.wpop input[type=email]{width:100%;box-sizing:border-box;background:var(--chip,#26222f);color:inherit;border:1px solid #3a3446;border-radius:999px;padding:14px 18px;font:inherit;font-size:16px;margin-bottom:10px;text-align:center}
.wpop .no{background:none;border:0;color:inherit;opacity:.55;font:inherit;font-size:14px;margin-top:10px;cursor:pointer;padding:6px}
.wpop .x{position:absolute;top:8px;right:10px;background:rgba(0,0,0,.45);border:0;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}
.wpop small{display:block;font-size:11px;opacity:.5;margin-top:8px;line-height:1.4}
.wpop .code{font-size:30px;letter-spacing:3px;font-weight:600;border:2px dashed var(--pink,#ff3d7f);border-radius:14px;padding:10px;margin:6px 0 12px}`;
  function show(){
    if(get() || document.querySelector('.gsheet')) return;           // never over the gift sheet
    set('seen');
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = document.createElement('div'); el.className = 'wpop';
    el.innerHTML = `<div class="in" role="dialog" aria-label="10% off your first order">
      <button class="x" aria-label="Close">×</button><div class="ph"></div>
      <div class="bd"><h2>Save <b>10%</b><br>on your first order</h2><p>Get the code by e-mail.</p>
      <form><input type="email" required placeholder="Your e-mail" autocomplete="email"><input name="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      <button class="btn" type="submit">Get 10% off</button></form>
      <button class="no">No thanks</button>
      <small>First order only. We may send an occasional new-arrivals note; unsubscribe anytime. <a href="privacy.html" style="color:inherit">Privacy</a></small></div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
    el.querySelector('.x').onclick = close; el.querySelector('.no').onclick = close;
    el.addEventListener('click', e => { if(e.target === el) close(); });
    el.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const b = el.querySelector('.btn'), email = el.querySelector('input[type=email]').value.trim();
      b.disabled = true; b.textContent = 'Sending…';
      try {
        const r = await fetch(CHECKOUT_API.replace(/\/$/,'') + '/join', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email, hp: el.querySelector('[name=hp]').value, from: location.pathname})});
        const j = await r.json().catch(() => ({}));
        if(!r.ok) throw new Error(j.error || 'Please try again.');
        set('joined');
        el.querySelector('.bd').innerHTML = `<h2>You're in! 🐾</h2><p>Your code is on its way to your e-mail. Use it at checkout:</p>
          <div class="code">WELCOME10</div><button class="btn">Start shopping</button>`;
        el.querySelector('.bd .btn').onclick = close;
      } catch(err){ b.disabled = false; b.textContent = 'Get 10% off'; alert(err.message); }
    };
  }
  setTimeout(show, 15000);
})();
