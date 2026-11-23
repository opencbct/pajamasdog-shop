// Shared PajamasDog shop code: product sources, regions, feed, try-on.
const PAGE_SIZE = 12;
const EDIBLE = /\b(treat|food|kibble|jerky|chew stick|supplement|cbd|vitamin)s?\b/i;
// Food only as links to shops that sell it themselves; never via CJ dropship (we would be the seller).
const blocked = p => (p.cat==='food' || EDIBLE.test(p.name)) && (p.src==='cj');
const DEMO = new URLSearchParams(location.search).has('demo'); // repeat samples to test scrolling

// Shops we link to. Each one is shown only where it can really ship.
// Add a shop here + its products in the feed; nothing else changes.
// Amazon tracking ID for pajamasdog.com (create it in Amazon Associates, then put it here).
const AMAZON_TAG = '';
const linkOf = p => p.asin ? `https://www.amazon.com/dp/${p.asin}${AMAZON_TAG?`?tag=${AMAZON_TAG}`:''}` : (p.url||'#');
// Partner shop doors (hero chips). Put each affiliate ID here once approved;
// until then the links still work, they just earn nothing.
const PARTNER_IDS = { coupang:'', naver:'', cj:'' };
const PARTNER_LINKS = {
  amazon:  q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}${AMAZON_TAG?`&tag=${AMAZON_TAG}`:''}`,
  coupang: q => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
  naver:   q => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`,
  cj:      q => `https://cjdropshipping.com/search/${encodeURIComponent(q)}.html`,
};
const SOURCES = {
  amazon:  {label:'Amazon',  regions:['US']},       // tracking tag goes in each product url
  coupang: {label:'Coupang', regions:['KR']},
  naver:   {label:'Naver',   regions:['KR']},
  cj:      {label:'CJ',      regions:['GLOBAL','US','KR']},
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
  let list = (await FEED).filter(p => cat==='all' || p.cat===cat || (cat==='cats' && p.pet==='cat'));
  if(DEMO && list.length){ const out=[]; for(let i=0;i<PAGE_SIZE;i++){ const p=list[(page*PAGE_SIZE+i)%list.length]; out.push({...p,id:p.id+'-'+page+'-'+i}); } return page<20?out:[]; }
  return list.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
}

// One product by id (for detail + try-on pages).
async function getProduct(id){ await getProducts('all',0); return (await FEED).find(p => p.id===id); }
// Product picture: real image, or a color tile until an approved image exists.
const visualOf = p => p.img ? `<img src="${p.img}" alt="${p.name}">` : `<div class="ph" style="--c:${p.color||'#f3c6d6'}"><span>🐾</span></div>`;
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
