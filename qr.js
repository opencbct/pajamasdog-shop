// 11-27 형님: branded QR (logo inside the code) for gift links — same look as tools/brand_qr.py.
// Needs qrcode-generator (cdnjs 1.4.4). Error correction H; dots are cleared only under the logo's shape.
// brandQR(url, px) → Promise<canvas>
async function brandQR(url, px = 640, logoFrac = 0.5) {
  const qr = qrcode(0, 'H'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), border = 3, cell = Math.floor(px / (n + 2 * border)), W = cell * (n + 2 * border);
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
  const INK = '#15131c', dark = (r, col) => r >= 0 && col >= 0 && r < n && col < n && qr.isDark(r, col);
  const eye = (r, col) => (r < 7 && col < 7) || (r < 7 && col >= n - 7) || (r >= n - 7 && col < 7);
  g.fillStyle = INK;
  // Rounded dots that join their neighbours (like the Python RoundedModuleDrawer).
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (!dark(r, col) || eye(r, col)) continue;
    const x = (col + border) * cell, y = (r + border) * cell, h = cell / 2;
    g.beginPath(); g.arc(x + h, y + h, h, 0, 7); g.fill();
    if (dark(r, col + 1) && !eye(r, col + 1)) g.fillRect(x + h, y, cell, cell);
    if (dark(r + 1, col) && !eye(r + 1, col)) g.fillRect(x, y + h, cell, cell);
  }
  // Eyes: rounded squares.
  const rr = (x, y, s, rad, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, s, s, rad); g.fill(); };
  for (const [r, col] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = (col + border) * cell, y = (r + border) * cell;
    rr(x, y, 7 * cell, cell * 1.6, INK); rr(x + cell, y + cell, 5 * cell, cell * 1.1, '#fff'); rr(x + 2 * cell, y + 2 * cell, 3 * cell, cell * .8, INK);
  }
  // Logo: clear a halo around its shape, then draw it.
  const logo = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'img/logo2/ink.png'; });
  const lw = Math.round(W * logoFrac), lh = Math.round(lw * logo.height / logo.width), lx = (W - lw) / 2, ly = (W - lh) / 2;
  const halo = Math.max(3, Math.round(cell * 0.9));
  const m = document.createElement('canvas'); m.width = W; m.height = W; const mg = m.getContext('2d');
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; mg.drawImage(logo, lx + Math.cos(t) * halo, ly + Math.sin(t) * halo, lw, lh); }
  mg.globalCompositeOperation = 'source-in'; mg.fillStyle = '#fff'; mg.fillRect(0, 0, W, W);
  g.drawImage(m, 0, 0); g.drawImage(logo, lx, ly, lw, lh);
  return c;
}
