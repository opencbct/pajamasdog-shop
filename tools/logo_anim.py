"""PajamasDog logo animation -> mp4 (letters bounce in, drawing rises, URL types, shine).
usage: python3 logo_anim.py <logo.png> <out.mp4> <W> <H> [bg hex]"""
import sys, subprocess, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

src, out, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
BG = sys.argv[5] if len(sys.argv) > 5 else '#15131c'
FPS, DUR = 30, 4.5
im = Image.open(src).convert('RGBA')
a = np.array(im)
alpha = a[..., 3] > 30
# every visible pixel goes to its nearest logo colour (keeps soft edges with their own letter)
PAL = np.array([[255, 255, 255], [12, 192, 223], [94, 23, 235]], np.float32)
dist = ((a[..., None, :3].astype(np.float32) - PAL) ** 2).sum(-1)
cls = dist.argmin(-1)
white, cyan, purple = (alpha & (cls == 0)), (alpha & (cls == 1)), (alpha & (cls == 2))
yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
sub = alpha & (yy >= 294)                                         # PAJAMASDOG.COM
draw = white & (yy < 213) & (xx >= 190) & ~sub                    # dog + cat line drawing
letters_mask = alpha & ~sub & ~draw

def comps(mask, min_px=20):
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    out = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        m = lab == i + 1
        if m.sum() >= min_px: out.append(m)
    return out

# letters: split per colour so neighbouring letters separate; tiny pieces (j dot) join nearest
pieces = []
for m in [letters_mask & white, letters_mask & cyan, letters_mask & purple]:
    cs = comps(m, 1)
    big = [c for c in cs if c.sum() > 300]; small = [c for c in cs if c.sum() <= 300]
    for c in small:
        cx = np.where(c)[1].mean()
        j = min(range(len(big)), key=lambda k: abs(np.where(big[k])[1].mean() - cx))
        big[j] = big[j] | c
    pieces += big
pieces.sort(key=lambda m: np.where(m)[1].min())
subs = sorted(comps(sub, 1), key=lambda m: np.where(m)[1].min())

bb = np.argwhere(alpha); (y0, x0), (y1, x1) = bb.min(0), bb.max(0) + 1
S = min(W * 0.82 / (x1 - x0), H * 0.55 / (y1 - y0))               # logo scale on canvas
OX = (W - (x1 - x0) * S) / 2 - x0 * S
OY = (H - (y1 - y0) * S) / 2 - y0 * S

def sprite(mask):
    ys, xs = np.where(mask); t, l, b, r = ys.min(), xs.min(), ys.max() + 1, xs.max() + 1
    arr = a[t:b, l:r].copy(); arr[..., 3] = np.where(mask[t:b, l:r], arr[..., 3], 0)
    img = Image.fromarray(arr).resize((max(1, round((r - l) * S)), max(1, round((b - t) * S))), Image.LANCZOS)
    return img, OX + l * S, OY + t * S

L = [sprite(m) for m in pieces]; D = sprite(draw); T = [sprite(m) for m in subs]
full = Image.new('RGBA', (W, H)); [full.alpha_composite(s, (round(x), round(y))) for s, x, y in L + [D] + T]

def back(t):  # easeOutBack
    c = 1.9; t -= 1; return 1 + (c + 1) * t ** 3 + c * t ** 2
clamp = lambda v: max(0.0, min(1.0, v))

def put(canvas, spr, x, y, sc=1.0, dy=0.0, op=1.0, anchor='bottom'):
    img, w, h = spr[0], spr[0].width, spr[0].height
    if op <= 0 or sc <= 0.01: return
    if sc != 1.0: img = img.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    if op < 1: img = img.copy(); img.putalpha(img.getchannel('A').point(lambda v: int(v * op)))
    px = x + (w - img.width) / 2; py = (y + h - img.height) if anchor == 'bottom' else y + (h - img.height) / 2
    canvas.alpha_composite(img, (round(px), round(py + dy)))

bgc = Image.new('RGBA', (W, H), BG)
proc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                         '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16',
                         '-movflags', '+faststart', out], stdin=subprocess.PIPE)
N = int(FPS * DUR)
for f in range(N):
    t = f / FPS; fr = bgc.copy(); layer = Image.new('RGBA', (W, H))
    for i, (img, x, y) in enumerate(L):                      # letters bounce in one by one
        p = clamp((t - 0.15 - 0.09 * i) / 0.5)
        if p > 0: put(layer, (img,), x, y, sc=back(p), dy=(1 - clamp(p * 1.6)) * 40 * S / 2.2, op=clamp(p * 4))
    p = clamp((t - 1.15) / 0.6)                              # drawing pops up from behind the letters
    if p > 0: put(layer, (D[0],), D[1], D[2], sc=back(p), dy=(1 - p) * 30, op=clamp(p * 3))
    for i, (img, x, y) in enumerate(T):                      # URL types in
        p = clamp((t - 1.85 - 0.045 * i) / 0.2)
        if p > 0: put(layer, (img,), x, y, op=p, anchor='center')
    p = clamp((t - 3.0) / 0.9)                               # shine sweep across the finished logo
    if 0 < p < 1:
        sh = Image.new('L', (W, H), 0); d = ImageDraw.Draw(sh); cx = -W * 0.3 + p * W * 1.6
        d.polygon([(cx, 0), (cx + W * 0.12, 0), (cx - H * 0.4 + W * 0.12, H), (cx - H * 0.4, H)], fill=150)
        sh = sh.filter(ImageFilter.GaussianBlur(18))
        m = Image.fromarray((np.array(sh, np.float32) * np.array(layer.getchannel('A'), np.float32) / 255).astype(np.uint8))
        glow = Image.new('RGBA', (W, H), (255, 255, 255, 0)); glow.putalpha(m); layer.alpha_composite(glow)
    fr.alpha_composite(layer)
    proc.stdin.write(fr.convert('RGB').tobytes())
proc.stdin.close(); proc.wait()
print('pieces', len(L), 'url chars', len(T), '->', out)
