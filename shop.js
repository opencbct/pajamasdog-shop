// Shared PajamasDog shop code: product sources, regions, feed, try-on.
const PAGE_SIZE = 12;
const EDIBLE = /\b(treat|food|kibble|jerky|chew stick|supplement|cbd|vitamin)s?\b/i;
// Food only as links to shops that sell it themselves; never via CJ dropship (we would be the seller).
const blocked = p => (p.cat==='food' || EDIBLE.test(p.name)) && (p.src==='cj');
const DEMO = new URLSearchParams(location.search).has('demo'); // repeat samples to test scrolling

// Shops we link to. Each one is shown only where it can really ship.
// Add a shop here + its products in the feed; nothing else changes.
// Amazon tracking ID for pajamasdog.com (create it in Amazon Associates, then put it here).
const AMAZON_TAG = 'pajamasdog-20';
const linkOf = p => p.src==='pd' ? `product.html?id=${encodeURIComponent(p.id)}` : p.asin ? `https://www.amazon.com/dp/${p.asin}${AMAZON_TAG?`?tag=${AMAZON_TAG}`:''}` : (p.url||'#');
// Partner shop doors (hero chips). Put each affiliate ID here once approved;
// until then the links still work, they just earn nothing.
const PARTNER_IDS = { coupang:'', naver:'', cj:'' };
const PARTNER_LINKS = {
  amazon:  q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}${AMAZON_TAG?`&tag=${AMAZON_TAG}`:''}`,
  coupang: q => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
  naver:   q => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`,
  cj:      q => `https://cjdropshipping.com/search/${encodeURIComponent(q)}.html`,
};
// Our checkout server (Stripe + CJ order, AWS Lambda pajamasdog-checkout).
// CHECKOUT_LIVE=false: Stripe TEST mode, only reachable with ?preview. Flip to true after live keys.
const CHECKOUT_LIVE = false;
const CHECKOUT_URL = 'https://6l5lt5zx2k7jra6ynbmmd32usm0nhbay.lambda-url.us-east-1.on.aws';
const PREVIEW = (() => { try { if(new URLSearchParams(location.search).has('preview')) sessionStorage.setItem('pd:preview','1'); return !!sessionStorage.getItem('pd:preview'); } catch(e){ return false; } })();
const CHECKOUT_API = (CHECKOUT_LIVE || PREVIEW) ? CHECKOUT_URL : '';
const SOURCES = {
  amazon:  {label:'Amazon',  regions:['US']},       // tracking tag goes in each product url
  coupang: {label:'Coupang', regions:['KR']},
  naver:   {label:'Naver',   regions:['KR']},
  cj:      {label:'CJ',      regions:['GLOBAL','US','KR']},
  // Our own products (we are the seller, CJ ships). US only for now.
  // Hidden on the live site until CHECKOUT_API is set; add ?preview to see them.
  pd:      {label:'PajamasDog', regions:(CHECKOUT_API || PREVIEW) ? ['US'] : []},
  sample:  {label:'Soon',    regions:['GLOBAL','US','KR']},
};
// Visitor region from the browser clock + language (no tracking, no IP lookup).
const REGION = (() => {
  const q = new URLSearchParams(location.search).get('region'); if(q) return q.toUpperCase();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if(tz==='Asia/Seoul' || /^ko/i.test(navigator.language)) return 'KR';
  if(/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Boise)|^Pacific\/Honolulu/.test(tz)) return 'US';
  return 'GLOBAL';
})();
const canShip = p => (SOURCES[p.src||'sample']||{regions:[]}).regions.includes(REGION);

let FEED = null;
async function getProducts(cat, page){
  FEED = FEED || fetch('products/feed.json',{cache:'no-store'}).then(r=>r.json()).then(a=>a.filter(p => !blocked(p) && canShip(p)));
  let list = (await FEED).filter(p => cat==='all' || p.cat===cat || (p.tags||[]).includes(cat) || (cat==='cats' && p.pet==='cat') || (cat==='dogs' && p.pet!=='cat' && (p.cat==='pajamas'||p.cat==='matching')));
  if(DEMO && list.length){ const out=[]; for(let i=0;i<PAGE_SIZE;i++){ const p=list[(page*PAGE_SIZE+i)%list.length]; out.push({...p,id:p.id+'-'+page+'-'+i}); } return page<20?out:[]; }
  return list.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
}

// One product by id (for detail + try-on pages).
async function getProduct(id){ await getProducts('all',0); return (await FEED).find(p => p.id===id); }
// Product picture: real image, or a color tile until an approved image exists.
const visualOf = p => p.img ? `<img src="${p.img}" alt="${p.name}">` : `<div class="ph" style="--c:${p.color||'#f3c6d6'}"><span>🐾</span></div>`;
// Partner badge: uses img/partners/<src>.svg when we have the partner's approved logo file; else the name.
const PARTNER_LOGOS = {}; // e.g. amazon:'img/partners/amazon.svg' (add only after approval)
const shopBadge = src => PARTNER_LOGOS[src] ? `<img class="plg" src="${PARTNER_LOGOS[src]}" alt="${(SOURCES[src]||{}).label||''}">` : ((SOURCES[src]||{}).label||'');
const shopName = p => (SOURCES[p.src||'sample']||{}).label || '';

// ---- AI try-on -------------------------------------------------------------
// Poses the dog model can take. The AI redraws the dog in this pose wearing the outfit.
const POSES = [
  {k:'sit',   label:'Sit',      ic:'🐕'},
  {k:'stand', label:'Stand',    ic:'🐾'},
  {k:'lie',   label:'Lie down', ic:'🛋️'},
  {k:'walk',  label:'Walk',     ic:'🦮'},
  {k:'sleep', label:'Sleep',    ic:'🌙'},
];
// tryOn(photoFile, product, pose) -> {url, preview}. TRYON_API is the server (AWS Lambda)
// that holds the image-AI key. Empty = preview mode: the dog photo is shown as-is.
const TRYON_API = '';
async function tryOn(photoFile, product, pose='sit'){
  if(!TRYON_API) return {url: URL.createObjectURL(photoFile), preview:true};
  const fd = new FormData(); fd.append('photo', photoFile); fd.append('product', product.id); fd.append('pose', pose);
  const r = await fetch(TRYON_API, {method:'POST', body:fd});
  if(!r.ok) throw new Error('try-on failed');
  return {url: URL.createObjectURL(await r.blob()), preview:false};
}

// ---- Logo motion: replay a small bounce + shine whenever a logo scrolls into view.
(function(){
  if(!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    const el = e.target;
    if(e.isIntersecting && el.tagName==='VIDEO'){ el.currentTime = 0; el.play().catch(()=>{}); return; }
    if(e.isIntersecting){ el.classList.remove('lm-go'); void el.offsetWidth; el.classList.add('lm-go'); }
  }), {threshold:.6});
  const watch = root => (root||document).querySelectorAll('header a img, header .hlogo, .plogo').forEach(el => {
    if(el.tagName==='VIDEO'){ if(el.dataset.lm) return; el.dataset.lm = 1; io.observe(el); return; }
    const t = el.tagName==='IMG' ? el.parentElement : el;
    if(t.dataset.lm) return; t.dataset.lm = 1; t.classList.add('lm'); io.observe(t);
  });
  document.addEventListener('DOMContentLoaded', () => watch());
  new MutationObserver(() => watch()).observe(document.documentElement, {childList:true, subtree:true});
})();

// Pay for our own (pd) items. The server sets every price; the browser only sends ids + sizes.
async function payDirect(lines, wrap='none', gift=null){
  if(!CHECKOUT_API){ alert('Checkout opens soon.'); return; }
  const r = await fetch(CHECKOUT_API.replace(/\/$/,'')+'/checkout', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({items: lines.map(l => ({id:l.id, size:l.size||'', qty:1})), wrap, gift})});
  const j = await r.json(); if(j.url) location.href = j.url; else alert(j.error || 'Checkout failed. Please try again.');
}
