"""Derives every raster asset and the palette from the files in brand/ and reference/.
Run once after changing brand art:  python -I scripts/prepare-assets.py
Outputs: src/tokens.json, src/favicon.template.svg, public/assets/*, brand/migrate-logo.png
"""
import json, colorsys, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "brand" / "LOGO MIGRATE PNG...png"      # RGBA, colour type 6, transparent pixels are pure black
FLAT = ROOT / "brand" / "LOGO MIGRATE PNG.png"        # RGB, opaque
BAN1 = ROOT / "reference" / "MIGRATE 1.jpg.jpeg"
WORD = ROOT / "reference" / "SAMPUL MIGRATE JPG.jpg.jpeg"
OUT = ROOT / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

def hexs(rgb): return "#%02x%02x%02x" % tuple(int(v) for v in rgb)

# ---- 1. logo: premultiplied resize (transparent region is pure black, so straight resize would fringe dark)
im = np.array(Image.open(LOGO).convert("RGBA")).astype(np.float64)
a = im[..., 3:4] / 255.0
ys, xs = np.where(im[..., 3] > 0)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
print("logo bbox", x0, y0, x1, y1)

def premul_resize(arr, size):
    al = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * al, arr[..., 3:4]], axis=2).astype(np.float32)
    pil = [Image.fromarray(pm[..., i], mode="F").resize(size, Image.LANCZOS) for i in range(4)]
    r = np.stack([np.array(p) for p in pil], axis=2)
    al2 = np.clip(r[..., 3:4] / 255.0, 0, 1)
    rgb = np.where(al2 > 1e-4, r[..., :3] / np.maximum(al2, 1e-4), 0)
    return np.clip(np.concatenate([rgb, r[..., 3:4]], axis=2), 0, 255).round().astype(np.uint8)

def square_canvas(arr, pad_frac):
    h, w = arr.shape[:2]
    s = int(max(h, w) * (1 + pad_frac * 2))
    cv = np.zeros((s, s, 4), np.float64)
    oy, ox = (s - h) // 2, (s - w) // 2
    cv[oy:oy + h, ox:ox + w] = arr
    return cv

crop = im[y0:y1, x0:x1]
sq = square_canvas(crop, 0.06)
# fill transparent rgb with the nearest opaque colour so no engine ever shows a black halo
def bleed(arr):
    m = arr[..., 3] > 0
    from scipy.ndimage import distance_transform_edt
    idx = distance_transform_edt(~m, return_distances=False, return_indices=True)
    out = arr.copy(); out[..., :3] = arr[tuple(idx)][..., :3]; return out
Image.fromarray(bleed(sq).round().astype(np.uint8)).save(ROOT / "brand" / "migrate-logo.png")
for n in (96, 192, 512):
    Image.fromarray(premul_resize(sq, (n, n))).save(OUT / f"logo-{n}.png")
Image.fromarray(premul_resize(sq, (180, 180))).save(OUT / "apple-touch-icon.png")
Image.fromarray(premul_resize(sq, (512, 512))).save(OUT / "migrate-logo.png")
Image.open(WORD).convert("RGB").save(OUT / "banner.jpg", quality=90)   # share-card image
print("assets written")

# ---- 2. palette: k-means, each centre snapped to a real pixel coordinate
def load(p): return np.array(Image.open(p).convert("RGB"))
def collect():
    rows = []
    lg = np.array(Image.open(LOGO).convert("RGBA"))
    ys, xs = np.where(lg[..., 3] >= 250)
    sel = np.random.RandomState(1).choice(len(ys), 20000, replace=False)
    for i in sel: rows.append((lg[ys[i], xs[i], :3], LOGO.name, xs[i], ys[i]))
    for p in (BAN1, WORD):
        arr = load(p); h, w, _ = arr.shape
        sel = np.random.RandomState(2).choice(h * w, 40000, replace=False)
        for s in sel: rows.append((arr[s // w, s % w], p.name, s % w, s // w))
    return rows
rows = collect()
px = np.array([r[0] for r in rows]).astype(np.float64)
km = KMeans(n_clusters=12, n_init=4, random_state=3).fit(px)
snapped = []
for c in km.cluster_centers_:
    j = int(np.argmin(((px - c) ** 2).sum(1)))
    snapped.append((px[j], rows[j][1], int(rows[j][2]), int(rows[j][3]), int((km.labels_ == km.predict([px[j]])[0]).sum())))
def hsl(rgb):
    h, l, s = colorsys.rgb_to_hls(*(np.array(rgb) / 255)); return h * 360, s, l
for s in snapped: print(hexs(s[0]), "hsl=%.0f/%.2f/%.2f" % hsl(s[0]), s[1], (s[2], s[3]), "n=%d" % s[4])

def pick(fn): return min(snapped, key=fn)
purples = [s for s in snapped if 240 < hsl(s[0])[0] < 280 and hsl(s[0])[1] > 0.4]
logo_main = max([s for s in snapped if s[1] == LOGO.name] or purples, key=lambda s: s[4])
roles = {}
roles["brand"] = logo_main
roles["brandDeep"] = min(purples, key=lambda s: hsl(s[0])[2])
roles["brandSoft"] = min(purples, key=lambda s: abs(hsl(s[0])[2] - 0.85))
roles["paper"] = max(snapped, key=lambda s: hsl(s[0])[2])
roles["ink"] = min(snapped, key=lambda s: hsl(s[0])[2])
# ---- 2b. mint slot: the art has no true green; the Solana mark's aqua is the nearest real hue. Second k-means over hue 150-215 pixels across banners MIGRATE 1..6
cand_l, idx_l = [], []
for n in range(1, 7):
    pth = ROOT / "reference" / ("MIGRATE %d.jpg.jpeg" % n)
    arr = load(pth); h, w, _ = arr.shape
    flat = arr.reshape(-1, 3).astype(np.float64)
    sub = np.arange(0, len(flat), 1)
    hh = np.array([hsl(flat[i]) for i in sub])
    m = (hh[:, 0] > 150) & (hh[:, 0] < 215) & (hh[:, 1] > 0.45) & (hh[:, 2] > 0.4) & (hh[:, 2] < 0.85)
    for i in sub[m]: cand_l.append(flat[i]); idx_l.append((pth.name, int(i % w), int(i // w)))
cand = np.array(cand_l)
print("mint candidates", len(cand))
k2 = KMeans(n_clusters=2, n_init=4, random_state=5).fit(cand[::max(1, len(cand)//4000)])
big = 0 if (k2.labels_ == 0).sum() >= (k2.labels_ == 1).sum() else 1
j = int(np.argmin(((cand - k2.cluster_centers_[big]) ** 2).sum(1)))
roles["mint"] = (cand[j], idx_l[j][0], idx_l[j][1], idx_l[j][2], int(len(cand)))

others = [s for s in snapped if s is not roles["paper"] and 240 < hsl(s[0])[0] < 290]
roles["brandMist"] = min(others, key=lambda s: abs(hsl(s[0])[2] - 0.93))
roles["brandWash"] = min(others, key=lambda s: abs(hsl(s[0])[2] - 0.97))

tok = {"_note": "The only file where colour literals are authored. Every value is a real pixel from brand/ or reference/ art."}
prov = {
 "brand": "logo petal fill",
 "brandDeep": "darkest saturated purple cluster (banner petal shading)",
 "brandSoft": "mid lavender cluster (banner glow)",
 "brandMist": "pale lavender cluster (banner glow edge)",
 "brandWash": "faint lavender cluster (banner wash)",
 "paper": "lightest cluster, banner background",
 "ink": "darkest cluster, banner wordmark glyph",
 "mint": "aqua of the Solana mark in the MIGRATE banners (no true green exists in the art), second k-means k=2 over hue 150-215 pixels",
}
for k, s in roles.items():
    tok[k] = {"value": hexs(s[0]), "provenance": ("k-means (k=2, snapped to real pixel) " if k == "mint" else "k-means (k=12, snapped to real pixel) ") + "%s at x=%d y=%d, cluster size %d; %s" % (s[1], s[2], s[3], s[4], prov[k])}
(ROOT / "src" / "tokens.json").write_text(json.dumps(tok, indent=2))
print(json.dumps({k: v["value"] for k, v in tok.items() if k[0] != "_"}))

# ---- 3. favicon: trace the real pixel grid. Mask logo at 128px, contour each petal, simplify, scale to 32x32.
G = 128
sm = premul_resize(square_canvas(crop, 0.04), (G, G))
mask = (sm[..., 3] > 127).astype(np.uint8) * 255
cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:4]
print("petals", len(cnts), [int(cv2.contourArea(c)) for c in cnts])
paths = []
for c in cnts:
    ap = cv2.approxPolyDP(c, 0.6, True)[:, 0, :] * (32.0 / G)
    paths.append("M" + " ".join("%.2f %.2f" % (x, y) for x, y in ap) + "Z")
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       '<path fill="{{brand}}" d="%s"/></svg>' % " ".join(paths))
assert "--" not in svg
(ROOT / "src" / "favicon.template.svg").write_text(svg)
print("favicon bytes", len(svg))
