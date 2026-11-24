// Find my size: pet measurements -> recommended size for one product (uses SIZES + STOCK from sizes_data.js).
// Garment must be a little bigger than the pet: chest +2 cm ease. Between sizes -> bigger one.
(function(){
  const IN = 2.54, LB = 0.4536;
  const KEY = 'pd:pet';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){ return {}; } };
  const save = m => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch(e){} };

  // sizes in stock for this product + color index (falls back to the feed list)
  window.inStock = (p, ci=0) => {
    const s = (window.STOCK||{})[p.id]; if(!s) return p.sizes || [];
    const col = (s.colors||[])[ci] || (s.colors||[])[0];
    return (s.avail||{})[col] || p.sizes || [];
  };

  // m = {chest, neck, back} in cm, kg in kg. Returns {size, why} or {size:null, why}
  window.recommendSize = (p, m, ci=0) => {
    const c = (window.SIZES||{})[p.id];
    const stock = inStock(p, ci);
    if(!c) return {size:null, why:'No size chart for this item yet. E-mail us your pet’s measurements and we’ll pick the size.'};
    let order = [], pick = null, why = '';
    if(c.by === 'weight'){
      order = Object.keys(c.lb);
      if(!m.kg) return {size:null, why:'This item is sized by weight. Enter your pet’s weight.'};
      const lb = m.kg / LB; pick = order.find(z => c.lb[z] >= lb) || null;
      why = `For about ${Math.round(lb)} lb.`;
    } else if(c.by === 'back'){
      order = c.rows.map(r => r[0]);
      if(!m.back) return {size:null, why:'This item is sized by back length. Enter your pet’s back length.'};
      const r = c.rows.find(r => r[3] >= m.back); pick = r ? r[0] : null;
      why = `Fits a back length up to ${r ? r[3] : '?'} cm.`;
    } else {
      order = c.rows.map(r => r[0]);
      if(m.chest){
        let i = c.rows.findIndex(r => r[1] >= m.chest + 2);
        if(i < 0) return {size:null, why:'Your pet is bigger than our largest size for this item.'};
        if(m.back && c.rows[i][3] < m.back - 4 && i < c.rows.length-1) i++;          // too short in the back -> size up
        if(m.neck && c.rows[i][2] && c.rows[i][2] < m.neck && i < c.rows.length-1) i++; // neck too tight -> size up
        pick = c.rows[i][0]; why = `Garment chest ${c.rows[i][1]} cm for a ${m.chest} cm chest.`;
      } else if(m.kg && c.kg){
        pick = order.find(z => c.kg[z] && m.kg <= c.kg[z][1]) || null; why = 'By weight (chest is more accurate).';
      } else return {size:null, why:'Enter your pet’s chest (around the widest part, behind the front legs).'};
    }
    if(!pick) return {size:null, why:'Your pet is bigger than our largest size for this item.'};
    if(!stock.includes(pick)){                     // recommended size sold out in this color -> next bigger in stock
      const next = order.slice(order.indexOf(pick)).find(z => stock.includes(z));
      if(!next) return {size:null, why:`${pick} is sold out in this color. Try another color.`};
      why += ` ${pick} is sold out in this color, so ${next}.`; pick = next;
    }
    return {size:pick, why};
  };

  // Small form. onPick(size) is called with the recommended size.
  window.sizeFinderHTML = () => {
    const m = load(), metric = m.unit === 'cm';
    const v = (cm) => cm ? (metric ? cm : Math.round(cm / IN * 10) / 10) : '';
    const w = m.kg ? (metric ? m.kg : Math.round(m.kg / LB)) : '';
    return `<details class="sf"${m.chest||m.kg ? ' open' : ''}><summary>📏 Find my size</summary>
      <div class="sf-row"><label>Chest<input inputmode="decimal" data-k="chest" value="${v(m.chest)}"></label>
      <label>Neck<input inputmode="decimal" data-k="neck" value="${v(m.neck)}"></label>
      <label>Back<input inputmode="decimal" data-k="back" value="${v(m.back)}"></label>
      <label>Weight<input inputmode="decimal" data-k="kg" value="${w}"></label></div>
      <div class="sf-unit"><button type="button" class="chip${metric?'':' on'}" data-u="in">in · lb</button><button type="button" class="chip${metric?' on':''}" data-u="cm">cm · kg</button>
      <button type="button" class="btn sf-go">Find my size</button></div>
      <p class="sf-out"></p><p class="sf-help">Chest: around the widest part, behind the front legs. Back: base of neck to base of tail.</p></details>`;
  };
  window.bindSizeFinder = (root, getProduct, getColor, onPick) => {
    const box = root.querySelector('.sf'); if(!box) return;
    let unit = load().unit === 'cm' ? 'cm' : 'in';
    box.querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', () => {
      unit = b.dataset.u; box.querySelectorAll('[data-u]').forEach(x => x.classList.toggle('on', x===b));
    }));
    const run = () => {
      const g = k => parseFloat(box.querySelector(`[data-k="${k}"]`).value) || 0;
      const toCm = x => x ? (unit==='cm' ? x : Math.round(x * IN * 10)/10) : 0;
      const m = {chest: toCm(g('chest')), neck: toCm(g('neck')), back: toCm(g('back')), kg: g('kg') ? (unit==='cm' ? g('kg') : Math.round(g('kg')*LB*10)/10) : 0, unit};
      save(m);
      const r = recommendSize(getProduct(), m, getColor());
      box.querySelector('.sf-out').innerHTML = r.size ? `We recommend <b>${r.size}</b>. <small>${r.why}</small>` : r.why;
      if(r.size) onPick(r.size);
    };
    box.querySelector('.sf-go').addEventListener('click', run);
    return run;
  };
})();
