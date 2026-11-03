"""手で塗り直した髪だけの PNG（4 倍・透明つき）を、頭の座標（首の付け根が原点、顔の内側は x ±42.5・下 −2.5）の SVG の path にする。
使い方:
  1. 参考絵の SVG を 4 倍の PNG に描き戻す（顔の位置を測るため）: npx tsx scripts/picto-hair-render.ts <参考絵の置き場> <描き戻しの置き場>
  2. HAIR_TS=src/shared/picto/hair-traced.ts uv run --python 3.12 --no-project --with vtracer --with numpy --with scipy --with pillow \
       python scripts/picto-hair-trace.py <参考絵の置き場> <描き戻しの置き場> <髪の置き場> <途中の json> [名前...]
  名前を渡すと、その髪だけを作り直し、ほかは途中の json に残っている形を使う。
  髪の置き場には <No>_<id>/front・oblique・side.png と、髪を顔に載せた見本（一覧_1〜4.png。赤が髪、灰が顔と体）を置く。
（vtracer は Python 3.14 では落ちるので 3.12 で動かす）
"""
import json, re, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
import vtracer

REF, SRC, HAIR, OUT = sys.argv[1:5]
ONLY = sys.argv[5:]
K = 4  # 描き戻しと髪の PNG の倍率
NEW = ["short", "bun", "long", "ponytail", "buzz", "sidePart", "curly", "twoBlock", "mash", "centerPart", "slickBack", "shortBob", "braids",
       "twinTails", "skinhead", "softMohawk", "wolf", "halfUp"]
VIEWS = {"front": "front", "quarter": "oblique", "side": "side"}
# 見本（一覧）: 1 枚に 5 段、1 段 170 画素。右半分に、正面・斜め・真横の順で顔に載せた髪が並ぶ
SHEET_ROWS, SHEET_ROW_H = 5, 170
SHEET_COLS = [(500, 690), (690, 860), (855, 1020)]
U = 4  # 見本を何倍にして合わせるか

def disk(r):
    r = max(1, int(round(r)))
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r

def face_box(rgb, black):
    # 線の小さな切れ目から顔の白が外とつながらないよう、黒を少し太らせてから白を数える
    pad = 3 * K
    white = np.all(rgb > 240, axis=2) & ~ndi.binary_dilation(black, structure=disk(pad))
    lab, _ = ndi.label(white)
    h, w = white.shape
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    best = None
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if i in border or sl is None:
            continue
        area = (lab[sl] == i).sum()
        if (sl[0].start + sl[0].stop) / 2 > h * 0.75:
            continue
        if best is None or area > best[0]:
            best = (area, i)
    m = lab == best[1]
    ys, xs = np.nonzero(m)
    yb = ys.max()
    # 幅は下半分（髪が横を隠しにくい所）で最も広い行
    rows = range(int(ys.min() + (yb - ys.min()) * 0.45), yb)
    _, row = max((xs[ys == r].max() - xs[ys == r].min(), r) for r in rows if (ys == r).any())
    xl, xr = xs[ys == row].min(), xs[ys == row].max()
    return xl - pad, xr + pad, yb + pad, ndi.binary_dilation(m, structure=disk(pad))

def head_frame(rgb, s_front):
    """参考絵の顔から、頭の座標への合わせ方（倍率と原点）を求める"""
    black = rgb.mean(axis=2) < 60
    xl, xr, yb, face = face_box(rgb, black)
    if s_front is None:
        sv = 85.0 / (xr - xl)
    else:
        # 斜め・真横の顔は正面より大きく描かれていることがあるので、目の中心からあごの内側まで（頭の単位で 34.5）で合わせる
        lab3, _ = ndi.label(ndi.binary_fill_holes(face) & black)
        eyes = []
        for i, sl in enumerate(ndi.find_objects(lab3), 1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            # 耳（C の字）を目と取り違えないよう、顔の前半分（右）にあるものだけ
            if 1.0 <= hh / max(ww, 1) <= 2.2 and sl[1].start > (xl + xr) / 2:
                eyes.append(((lab3[sl] == i).sum(), (sl[0].start + sl[0].stop) / 2))
        sv = 34.5 / (yb - max(eyes)[1])
    # 元の絵の顔の線は 5 より太いことがあるので、線の内側ではなく線の真ん中で合わせる（前の端 x 45・あご y 0）
    row = int(round(yb - 30 / sv))
    run = lambda line: int(np.argmin(line)) if not line.all() else len(line)
    half_x = run(black[row, xr - 3 * K:]) / 2 - 3 * K
    half_y = run(black[yb - 3 * K:, int(round((xl + xr) / 2))]) / 2 - 3 * K
    ox = (xl + xr) / 2 if s_front is None else xr + half_x - 45 / sv
    return sv, ox, yb + half_y

def corr(a, b):
    """b を a の上で動かして一番重なる位置 (dy, dx)（a[y+dy, x+dx] ~ b[y, x]）"""
    c = fftconvolve(a, b[::-1, ::-1], mode="full")
    i = np.unravel_index(np.argmax(c), c.shape)
    return c[i], i[0] - (b.shape[0] - 1), i[1] - (b.shape[1] - 1)

def resize(m, k):
    im = Image.fromarray((m * 255).astype(np.uint8))
    return np.array(im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BILINEAR)).astype(float) / 255

def place(sheet, no, name, fn, alpha):
    """見本の赤（顔に載せた髪）を手がかりに、髪の PNG が参考絵の 4 倍の描き戻しのどこに乗るか（ずらす量）を求める"""
    x0, x1 = SHEET_COLS[list(VIEWS.values()).index(fn)]
    row = (no - 2) % SHEET_ROWS
    T = sheet[row * SHEET_ROW_H:(row + 1) * SHEET_ROW_H, x0:x1]
    red = ((T[..., 0] - T[..., 1]) / 255.0).clip(0, 1) * (T[..., 0] > 150)
    gray = ((255 - T.mean(axis=2)) / 255.0).clip(0, 1) * (np.abs(T[..., 0] - T[..., 1]) < 25)
    des = np.array(Image.open(os.path.join(REF, f"{no:02d}_{name}", f"{fn}.png")).convert("L")).astype(float)
    dark = ((200 - des) / 200).clip(0, 1)
    # 見本の灰の線と参考絵の黒い線を、下半分（首・肩の線。髪で変わらない所）で合わせる
    g = resize(gray, U)
    g[: int(g.shape[0] * 0.55)] = 0
    best = None
    for f in np.arange(0.28, 0.42, 0.002):
        d = resize(dark, f * U)
        d[: int(d.shape[0] * 0.55)] = 0
        s, dy, dx = corr(g, d)
        s /= np.sqrt((d ** 2).sum())
        if best is None or s > best[0]:
            best = (s, f, dy, dx)
    _, f, dy, dx = best
    # 髪を同じ倍率で縮めて赤に合わせる。髪の画素 → 見本 → 参考絵 → 4 倍の描き戻し
    _, hy, hx = corr(resize(red, U), resize(alpha, f * U / K))
    return K * (hx - dx) / (f * U), K * (hy - dy) / (f * U)

def trace(mask):
    img = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).convert("RGB")
    tmp_in, tmp_out = OUT + ".in.png", OUT + ".out.svg"
    img.save(tmp_in)
    vtracer.convert_image_to_svg_py(tmp_in, tmp_out, colormode="binary", mode="spline", filter_speckle=4 * K,
                                    corner_threshold=60, length_threshold=4.0 * K, splice_threshold=45, path_precision=2)
    svg = open(tmp_out, encoding="utf-8").read()
    os.remove(tmp_in); os.remove(tmp_out)
    return [(d, *[float(v) for v in tr.split(",")]) for d, tr in re.findall(r'<path d="([^"]+)"[^>]*transform="translate\(([^)]+)\)"', svg)]

def to_head(paths, s, ox, oy):
    """ピクセルの path を頭の座標へ（x' = (x + tx − ox)·s）。数は小数 1 桁に丸める"""
    res = []
    for d, tx, ty in paths:
        o, axis = [], 0
        for t in re.findall(r"[A-Za-z]|-?\d+(?:\.\d+)?", d):
            if t.isalpha():
                o.append(t); axis = 0
            else:
                v = (float(t) + tx - ox) * s if axis == 0 else (float(t) + ty - oy) * s
                o.append(f"{round(v, 1):g}"); axis ^= 1
        res.append(re.sub(r" ?([A-Za-z]) ?", lambda m: m.group(1), " ".join(o)).replace(" -", "-"))
    return "".join(res)

def components(mask, keep_if):
    """塊ごとに keep_if(塊の範囲, 画素数) が真のものだけ残す"""
    lab, _ = ndi.label(mask)
    out = np.zeros_like(mask)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        comp = lab[sl] == i
        if keep_if(sl, comp.sum()):
            out[sl] |= comp
    return out

def smooth(mask, sigma):
    """縁のギザギザをならす（ぼかしてから半分で切る）"""
    return ndi.gaussian_filter(mask.astype(float), sigma) > 0.5

result = json.load(open(OUT, encoding="utf-8")) if ONLY and os.path.exists(OUT) else {}
for no, name in enumerate(NEW, 2):
    if ONLY and name not in ONLY:
        continue
    result[name] = {}
    sheet = np.array(Image.open(os.path.join(HAIR, f"一覧_{(no - 2) // SHEET_ROWS + 1}.png")).convert("RGB")).astype(int)
    s_front = None
    for view, fn in VIEWS.items():
        sv, ox, oy = head_frame(np.array(Image.open(os.path.join(SRC, f"{no:02d}_{name}", f"{fn}.png")).convert("RGB")).astype(int), s_front)
        s_front = s_front or sv
        rgba = np.array(Image.open(os.path.join(HAIR, f"{no:02d}_{name}", f"{fn}.png")).convert("RGBA")).astype(int)
        alpha = rgba[..., 3] > 127
        if not alpha.any():  # スキンヘッドは髪が無い
            result[name][view] = {"black": "", "gray": "", "behind": "", "top": None}
            continue
        sx, sy = place(sheet, no, name, fn, alpha.astype(float))
        ox, oy = ox - sx, oy - sy
        u = 1 / sv
        H, W = alpha.shape
        yy = (np.arange(H)[:, None] - oy) * sv
        # 塗りは 3 色（黒・刈り上げの灰 #444・つやや剃った所の灰 #777）。黒と #444 は髪の色、#777 は灰のまま重ねる
        gray = alpha & (np.abs(rgba[..., 0] - 0x77) < 20)
        dark = smooth(alpha & (np.abs(rgba[..., 0] - 0x44) < 20), 0.4 * u)  # 坊主の地肌の透ける所。黒い縁の内側
        hair = smooth(alpha, 0.5 * u)
        # あごより 8 下から下は、胴より後ろの層（三つ編みは胸の前に垂らすので前の層のまま）
        lower = hair & (yy > 8) if name != "braids" else np.zeros_like(hair)
        front = hair & ~lower
        lower = components(lower, lambda sl, n: n * sv * sv > 150)
        g2 = components(smooth(gray, 0.4 * u), lambda sl, n: n * sv * sv > 3)
        ys, xs = np.nonzero(front)
        result[name][view] = {
            "black": to_head(trace(front), sv, ox, oy) if front.any() else "",
            "gray": to_head(trace(g2), sv, ox, oy) if g2.any() else "",
            "behind": to_head(trace(lower), sv, ox, oy) if lower.any() else "",
            "dark": to_head(trace(dark), sv, ox, oy) if dark.any() else "",
            "top": round(float((ys.min() - oy) * sv), 1) if front.any() else None,
            "scale": round(sv, 5), "ox": round(float(ox), 1), "oy": round(float(oy), 1), "W": W, "H": H,
        }
        print(name, view, "s=%.4f" % sv, "shift=(%.1f, %.1f)" % (sx, sy), "top", result[name][view]["top"],
              "len", len(result[name][view]["black"]) + len(result[name][view]["gray"]) + len(result[name][view]["behind"]), flush=True)
json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)

# ---- TypeScript に書き出す（環境変数 HAIR_TS に .ts のパスがあれば） ----
TS = os.environ.get("HAIR_TS")
if TS:
    DOME = {
        "front": "M-44.6 -46C-46 -86 -24 -100 0 -100S46 -86 44.6 -46",
        "quarter": "M-46 -42C-49 -86 -22 -100 2 -100C26 -100 46 -86 44.6 -46",
        "side": "M-47 -36C-52 -88 -20 -100 6 -100C30 -100 46 -86 44.6 -46",
    }
    GLOSS = '<path d="M-30 -80Q-24 -92 -10 -94" fill="none" stroke="#ccc" stroke-width="4" stroke-linecap="round"/>'
    lines = [
        "// 手で塗り直した髪だけの絵から取り出した形（おかっぱ以外の 18 種）。scripts/picto-hair-trace.py が作る。手で直さない（製品仕様 §14）",
        "// 座標は頭の座標（首の付け根が原点、顔の内側は x ±42.5・下 −2.5）。front は顔より前、behind は胴より後ろ（あごより 8 下から下）。",
        "// HAIRFILL は髪の塗り、SKINFILL は肌の色（スキンヘッドとソフトモヒカンの頭の丸み）に置き換える",
        'import type { View } from "./character";',
        "",
        "export const TRACED_HAIRS = " + json.dumps(NEW) + " as const;",
        "export type TracedHair = (typeof TRACED_HAIRS)[number];",
        "export const TRACED: Record<TracedHair, Record<View, { front: string; behind?: string }>> = {",
    ]
    tops = {}
    for name in NEW:
        lines.append(f"  {name}: {{")
        for view in VIEWS:
            d = result[name][view]
            dome = name in ("skinhead", "softMohawk")
            front = (f'<path d="{DOME[view]}" fill="SKINFILL" stroke="#000" stroke-width="5"/>' if dome else "")
            if name == "skinhead":
                front += GLOSS
            else:
                # 黒の上に灰（つやの線・剃った所）を重ねる。坊主は黒い縁の内側を髪の色（#444）で塗る
                if d.get("dark"):
                    front += f'<path d="{d["black"]}" fill="#000"/><path d="{d["dark"]}" fill="HAIRFILL"/>'
                else:
                    front += f'<path d="{d["black"]}" fill="HAIRFILL"/>' if d["black"] else ""
                front += f'<path d="{d["gray"]}" fill="#777"/>' if d["gray"] else ""
            entry = "front: " + json.dumps(front)
            if d["behind"]:
                entry += ", behind: " + json.dumps(d["behind"])
            lines.append(f"    {view}: {{ {entry} }},")
            t = -100 if name == "skinhead" else d["top"]
            tops[name] = min(tops.get(name, 0), t)
        lines.append("  },")
    lines.append("};")
    lines.append("/** かぶらないときの頭のいちばん上（3 つの向きでいちばん高い所） */")
    lines.append("export const TRACED_TOP: Record<TracedHair, number> = " + json.dumps({k: round(v) for k, v in tops.items()}).replace('"', "") + ";")
    open(TS, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("TS", TS, os.path.getsize(TS))
