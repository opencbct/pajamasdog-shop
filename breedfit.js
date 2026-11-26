// 11-26: "My pet is a …" helper + "Good fit for" breed list on the product page.
// Uses the item's real size chart (sizes_data.js, sizes_extra.js). Items without a chart get an
// estimate from common pet-size labels, and the page says so.
(function(){
  window.SIZES = Object.assign({}, window.SIZES || {}, window.SIZES_EXTRA || {});
  const KEY = 'pd:breed';
  const mid = r => (r[0] + r[1]) / 2;
  // Common pet-clothes chest (cm) per label, only for items with no chart.
  const GENERIC = { XXS: 26, XS: 32, S: 38, M: 44, L: 50, XL: 56, '2XL': 62, XXL: 62, '3XL': 70, XXXL: 70, '4XL': 78, '5XL': 86, '6XL': 94 };

  const forPets = p => { const t = (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase();
    const cat = /\bcats?\b|kitten/.test(t), dog = /\bdogs?\b|puppy|pup\b/.test(t);
    return cat && !dog ? ['cat'] : dog && !cat ? ['dog'] : ['dog', 'cat']; };

  // -> {size, exact, why} or {size:null, why}
  window.sizeForBreed = (p, b, ci = 0) => {
    const sizes = p.sizes || []; if (!sizes.length) return { size: null, why: '' };
    const c = window.SIZES[p.id];
    let pick = null, exact = !!c, firstChest = null;
    if (c && c.by === 'weight') {
      const lb = mid(b.kg) / 0.4536; pick = Object.keys(c.lb).find(z => c.lb[z] >= lb) || null;
    } else if (c && c.by === 'back') {
      const r = c.rows.find(r => r[3] >= mid(b.back)); pick = r ? r[0] : null;
    } else {
      const rows = c ? c.rows.map(r => [r[0], r[1]]) : sizes.map(z => [z, GENERIC[z]]).filter(r => r[1]);
      if (!rows.length) return { size: null, why: '' };
      firstChest = rows[0][1];
      const need = mid(b.chest) + 2;                   // garment a little bigger than the pet
      const r = rows.find(r => r[1] >= need); pick = r ? r[0] : null;
      if (pick && firstChest > b.chest[1] + 14) pick = null;   // even the smallest size would be far too big
    }
    if (!pick) return { size: null, why: `Not a good fit for a ${b.name}.` };
    const stock = window.inStock ? inStock(p, ci) : sizes;
    const order = c && c.rows ? c.rows.map(r => r[0]) : sizes;
    if (!stock.includes(pick)) { const next = order.slice(order.indexOf(pick)).find(z => stock.includes(z)); if (!next) return { size: null, why: `${pick} is sold out in this color.` }; pick = next; }
    return { size: pick, exact, why: `${exact ? 'About' : 'Estimated'} <b>${pick}</b> for a ${b.name} (chest about ${Math.round(mid(b.chest))} cm).` };
  };

  // {size: [breed names]} in size order
  window.fitsByBreed = (p) => {
    const kinds = forPets(p), out = {};
    for (const b of window.BREEDS || []) { if (!kinds.includes(b.kind)) continue;
      const r = sizeForBreed(p, b, 0); if (r.size) (out[r.size] = out[r.size] || []).push(b.name); }
    const order = p.sizes || [];
    return { groups: order.filter(z => out[z]).map(z => [z, out[z]]), exact: !!window.SIZES[p.id] };
  };

  window.breedFitHTML = (p) => {
    if (!(p.sizes || []).length) return '';
    const kinds = forPets(p), saved = (() => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } })();
    const opts = (window.BREEDS || []).filter(b => kinds.includes(b.kind)).map(b => `<option value="${b.k}"${b.k === saved ? ' selected' : ''}>${b.name}</option>`).join('');
    const f = fitsByBreed(p);
    const list = f.groups.map(([z, names]) => `<div class="fz"><b>${z}</b><span>${names.join(', ')}</span></div>`).join('');
    return `<div class="bf"><label class="lbl2" for="breed">My pet is a</label>
      <select id="breed"><option value="">Choose breed…</option>${opts}</select><p class="bf-out"></p></div>
      ${list ? `<div class="fits"><div class="lbl2">Good fit for${f.exact ? '' : ' <small>(estimate — measure to be sure)</small>'}</div>${list}</div>` : ''}`;
  };

  window.bindBreedFit = (root, getProduct, getColor, onPick) => {
    const sel = root.querySelector('#breed'); if (!sel) return;
    const run = () => {
      const b = (window.BREEDS || []).find(x => x.k === sel.value), out = root.querySelector('.bf-out');
      try { localStorage.setItem(KEY, sel.value); } catch (e) {}
      if (!b) { out.innerHTML = ''; return; }
      const r = sizeForBreed(getProduct(), b, getColor());
      out.innerHTML = r.size ? `${r.why} <small>Every pet differs — measure the chest if you can.</small>` : r.why;
      if (r.size) onPick(r.size);
    };
    sel.addEventListener('change', run);
    if (sel.value) run();
  };
})();
