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
    oy = yb + half_y
    if s_front is None:
        return sv, (xl + xr) / 2, oy
    # 斜め・真横は、あごから 30 上の行の顔の前の線（いちばん右の黒）の真ん中を、こちらの顔の線（x 45.4）に合わせる
    r = black[int(round(oy - 30 / sv))]
    e = int(np.nonzero(r)[0].max())
    b = e
    while b > 0 and r[b - 1]:
        b -= 1
    return sv, (b + e) / 2 - 45.4 / sv, oy

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

# ---- こちらの頭に合わせる直し（作者の見直し表のコメントから） ----
# 参考絵の頭は丸く、こちらの頭（顔の輪郭）は角の丸い四角なので、斜め・真横では後頭部の角が髪からはみ出たり、
# 前髪が顔より前へ出すぎたりする。髪の形（パスにする前の塗り）を頭の座標の上で直してから、パスにする。
FACE = "M-18 -70H18Q44 -70 44.6 -48L45.4 -30Q45 0 12 0H-12Q-44.6 0.4 -45 -30L-44.4 -48Q-44 -70 -18 -70Z"  # avatar.ts の faceOutline("standard")
DOME = "M-45 -30L-44.4 -48C-47 -87 -11 -91.6 0 -91.6S47 -87 44.6 -48L45.4 -30"  # 両はしは顔の輪郭の線の真っすぐな所に重ねる（つなぎ目を出さない）  # 頭の上の丸み（スキンヘッド。3 つの向きで同じ）
FIX = {
    # wrap: 後頭部の角（顔の輪郭の線の外の端まで）を髪で包む。fitx: (行の y, 後ろの端, 前の端) へ髪を横に伸び縮みさせる
    # clip: 頭の輪郭（線の外の端）より外の髪を落とす（とさかは残す）。shift: 顔の右の髪の塊を顔の輪郭に寄せる
    # front_all: 胴より後ろに回さない（肩に掛かる髪）。tail_back: 真横のツインテールの尾を後ろへずらす量
    # nape: (x, y) 耳の後ろの x より後ろ・y より上の頭を髪で埋める
    ("mash", "side"): {"fitx": (-50, None, 46.5)},
    ("sidePart", "side"): {"fitx": (-50, None, 46.5)},
    ("curly", "front"): {"front_all": True},
    ("curly", "quarter"): {"front_all": True},
}

def flatten(d, n=24):
    """M H L Q C S Z だけの path を折れ線の点にする"""
    t = re.findall(r"[A-Za-z]|-?\d+(?:\.\d+)?", d)
    pts, i, cur, cmd, last_c = [], 0, (0.0, 0.0), "", None
    while i < len(t):
        if t[i].isalpha():
            cmd = t[i]; i += 1
            continue
        if cmd in "ML":
            cur = (float(t[i]), float(t[i + 1])); i += 2; pts.append(cur); last_c = None
        elif cmd == "H":
            cur = (float(t[i]), cur[1]); i += 1; pts.append(cur); last_c = None
        elif cmd in "QCS":
            k = {"Q": 4, "C": 6, "S": 4}[cmd]
            v = [float(x) for x in t[i:i + k]]; i += k
            if cmd == "Q":
                c = [cur, (v[0], v[1]), (v[2], v[3])]
                last_c = None
            else:
                if cmd == "S":
                    r = (2 * cur[0] - last_c[0], 2 * cur[1] - last_c[1]) if last_c else cur
                    v = [r[0], r[1]] + v
                c = [cur, (v[0], v[1]), (v[2], v[3]), (v[4], v[5])]
                last_c = (v[2], v[3])
            for j in range(1, n + 1):
                q, pp = j / n, c
                while len(pp) > 1:
                    pp = [((1 - q) * a[0] + q * b[0], (1 - q) * a[1] + q * b[1]) for a, b in zip(pp, pp[1:])]
                pts.append(pp[0])
            cur = pts[-1]
    return pts

def region(d, sv, ox, oy, shape):
    """頭の座標の path の内側を、髪の絵の画素の格子で塗る"""
    from PIL import ImageDraw
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([(x / sv + ox, y / sv + oy) for x, y in flatten(d)], fill=255)
    return np.array(im) > 127

def remap_x(masks, xrow, src_of_dst):
    """横に伸び縮みさせる。src_of_dst は、直したあとの x（頭の座標）が元のどの x から来るか"""
    H, W = masks[0].shape
    xi = np.broadcast_to(((src_of_dst(xrow) - xrow) / (xrow[1] - xrow[0]) + np.arange(W))[None, :], (H, W))
    yi = np.broadcast_to(np.arange(H)[:, None].astype(float), (H, W))
    return [ndi.map_coordinates(m.astype(float), [yi, xi], order=1, cval=0) > 0.5 for m in masks]

def apply_fix(fix, hair, gray, dark, sv, ox, oy):
    H, W = hair.shape
    u = 1 / sv
    yy = (np.arange(H)[:, None] - oy) * sv
    xx = (np.arange(W)[None, :] - ox) * sv
    face = region(FACE, sv, ox, oy, hair.shape)
    if "fitx" in fix:
        y0, back, front = fix["fitx"]
        xs = np.nonzero(hair[int(round(y0 / sv + oy))])[0]
        b0, f0 = (xs.min() - ox) * sv, (xs.max() - ox) * sv
        b1 = b0 if back is None else back
        # 後ろの端と前の端を、それぞれ目当ての位置へ（あいだは真っすぐ伸び縮み、外はそのままずらす）
        src = lambda x: np.interp(x, [-1e4, b1, front, 1e4], [-1e4 + (b0 - b1), b0, f0, 1e4 + (f0 - front)])
        hair, gray, dark = remap_x([hair, gray, dark], xx[0], src)
        print("  fitx y %g: back %.1f -> %.1f, front %.1f -> %.1f" % (y0, b0, b1, f0, front))
    if fix.get("shift"):
        # 顔の右に垂れる髪（顔の右の端より右・耳より下）を、顔の輪郭の線の外の端（線の太さ 5 の半分）に触れるまで左へ寄せる
        out_face = ndi.distance_transform_edt(~face) * sv
        part = hair & (xx > 40) & (yy > -50)
        # 行ごとに、髪の左の端と線の外の端のすき間を測り、いちばん広い所が閉じるだけ寄せる
        rows = [float(out_face[r][part[r]].min()) - 2.5 for r in range(H) if part[r].any() and -35 < (r - oy) * sv < -5]
        gap = max(rows)
        sh = (0, -int(round(gap / sv)))
        hair = (hair & ~part) | ndi.shift(part, sh, order=0)
        gray = (gray & ~part) | ndi.shift(gray & part, sh, order=0)
        hair = smooth(hair, 0.5 * u)
        print("  shift right part left by %.2f" % gap)
    if fix.get("tail_back"):
        # 真横のツインテールの尾（頭の塊と離れた塊）を後ろへずらす
        lab, n = ndi.label(hair)
        sizes = ndi.sum(hair, lab, range(1, n + 1))
        big = int(np.argmax(sizes)) + 1
        sh = (0, -int(round(fix["tail_back"] / sv)))
        for i in range(1, n + 1):
            comp = lab == i
            if i == big or float(np.broadcast_to(xx, comp.shape)[comp].mean()) > -15:
                continue
            hair = (hair & ~comp) | ndi.shift(comp, sh, order=0)
            gray = (gray & ~comp) | ndi.shift(gray & comp, sh, order=0)
            print("  tail moved back by", fix["tail_back"], "size", int(sizes[i - 1]))
    head = face | region(DOME + "Z", sv, ox, oy, hair.shape)
    out_head = ndi.distance_transform_edt(~head) * sv
    in_head = ndi.distance_transform_edt(head) * sv
    if fix.get("clip"):
        hair &= (out_head <= 2.5) | (yy < -98)
        hair = components(hair, lambda sl, n: n * sv * sv > 20)
    if "nape" in fix:
        # 尾が頭から離れて垂れる髪は、頭の後ろ（耳の後ろの x より後ろ、y の下の端まで）を髪で埋める
        xcut, ybot = fix["nape"]
        band = ((out_head <= 2.5) | head) & (xx < xcut) & (yy <= ybot) & (yy > -80)
        hair |= smooth(band, 2 * u)
        print("  nape x < %g, down to y %g" % (xcut, ybot))
    if fix.get("wrap"):
        # 行ごとに、髪の後ろの端を、顔の輪郭の線の外の端（後頭部の角）まで出す。出す量は縦になめらかに変える（段を作らない）
        # 包む下の端は、後ろの髪のいちばん下（数で渡したときはその y。頭から離れて垂れる尾があるとき）
        back_hair = hair & (xx < -35) & (yy < -5)
        ymax = fix["wrap"] if fix["wrap"] is not True else (np.nonzero(back_hair)[0].max() - oy) * sv if back_hair.any() else -40
        x0 = np.arange(W)
        outer = (out_head <= 2.5) & (yy > -70) & (xx < 0)
        rows = [r for r in range(H) if -105 < (r - oy) * sv <= ymax and hair[r].any()]
        # 後ろの端は、線の外の端より内の髪で測る（それより後ろに離れて垂れる尾は数えない）
        xb = np.array([x0[hair[r] & (x0 >= x0[outer[r]].min())].min() if outer[r].any() and (hair[r] & (x0 >= x0[outer[r]].min())).any()
                       else x0[hair[r]].min() for r in rows], float)
        want = np.array([min(xb[i], x0[outer[r]].min()) if outer[r].any() else xb[i] for i, r in enumerate(rows)])
        new = np.minimum(xb, ndi.gaussian_filter1d(want, 5 * u, mode="nearest"))
        for i, r in enumerate(rows):
            if (xb[i] - ox) * sv < -20:  # 後ろ半分に端がある行だけ（頭の上で前に寄った毛先の行は伸ばさない）
                hair[r, int(round(new[i])):int(xb[i]) + 1] = True
        hair = smooth(hair, 0.5 * u)
        print("  wrap down to y %.1f, out by up to %.1f" % (ymax, float((xb - new).max()) * sv))
    if fix.get("clip") or fix.get("wrap"):
        # 縁の黒（輪郭の線の太さ 5）を残し、剃った所の灰と坊主の地肌はその内側だけ（とさかの灰・つやの線はそのまま）
        inner = ndi.distance_transform_edt(ndi.binary_fill_holes(hair)) * sv > 5  # つやの白い点（穴）のまわりは縁にしない
        big = components(gray, lambda sl, n: n * sv * sv > 60)  # 剃った所・刈り上げ（つやの細い線は残す）
        gray = (gray & ~big) | (big & (inner | (yy < -98)))
        gray &= hair
        dark &= inner
    return hair, gray, dark

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
        fix = FIX.get((name, view), {})
        if fix:
            hair, gray, dark = apply_fix(fix, hair, gray, dark, sv, ox, oy)
        skin = np.zeros_like(hair)
        if name == "softMohawk":
            # 頭の丸みの線は、スキンヘッドと同じ 1 つの形（顔の輪郭の線にそのままつながる）を描き、元の絵の縁の黒は使わない。
            # とさかは元の絵のまま、剃った所の内側から雫の形に立ち上がる。剃った所の灰は線の内側を埋め、とさかの下に敷く（つなぎ目を出さない）
            head = region(FACE, sv, ox, oy, hair.shape) | region(DOME + "Z", sv, ox, oy, hair.shape)
            in_head = ndi.distance_transform_edt(head) * sv
            out_head = ndi.distance_transform_edt(~head) * sv
            black = hair & ~gray
            band = (in_head <= 3.5) & (out_head <= 2.0)  # 元の絵の縁の黒がある帯
            cand = black & ~band
            up = components(cand, lambda sl, n: (sl[0].start - oy) * sv < -95)
            grow = ndi.binary_dilation(up, iterations=int(round(6 / sv))) & black
            lab, _ = ndi.label(cand)
            ids = np.unique(lab[grow & cand])
            fin = grow | np.isin(lab, ids[ids > 0])
            # とさかのわきに付いてきた縁の黒の細い切れ端（太さ 7 未満）を落とす（とさかは太いので残る）
            fin = ndi.binary_opening(fin, structure=disk(3.5 / sv)) & fin
            # 線より内のとさかは、とさかが線を横切る左右の 2 点を結ぶ弦から下へ垂らした半分の楕円（雫の下の丸み）にする。
            # 元の縁の黒に隠れていた、つばのような出っ張りは出さない
            outer = fin & ~head
            ys, xs = np.nonzero(fin & ~head & (out_head <= 2))
            i, j = int(np.argmin(xs)), int(np.argmax(xs))
            p0, p1 = np.array([xs[i], ys[i]], float), np.array([xs[j], ys[j]], float)
            c, half = (p0 + p1) / 2, np.linalg.norm(p1 - p0) / 2
            ex = (p1 - p0) / (2 * half)
            ey = np.array([-ex[1], ex[0]])  # 弦に直角で下向き（画像の y は下が正）
            gy, gx = np.mgrid[0:H, 0:W]
            uu = (gx - c[0]) * ex[0] + (gy - c[1]) * ex[1]
            vv = (gx - c[0]) * ey[0] + (gy - c[1]) * ey[1]
            # 深さは斜めの 14 までにそろえる（正面の元の絵は生え際の近くまで垂れていて、頭の上にちょこんと乗って見えない）
            depth = min(max(float(vv[fin & head].max()) * 0.9, 4 / sv), 14 / sv)
            # 弦より上（弦と頭の線の間）も、とさかで埋める
            drop = ((vv >= 0) & ((uu / half) ** 2 + (vv / depth) ** 2 <= 1)) | ((vv < 0) & (np.abs(uu) <= half))
            fin = outer | (head & drop) | (fin & ~head)
            print("  fin chord %.1f wide, depth %.1f" % (2 * half * sv, depth * sv))
            # とさかのてっぺんは 3 つの向きで同じ高さ（y −125）。弦の真ん中の高さを根もとにして縦に伸び縮みさせる
            yt = float(np.nonzero(fin.any(axis=1))[0].min())
            yb, target = float(c[1]), oy - 125 / sv
            k = (yb - target) / (yb - yt)
            src_r = np.where(np.arange(H) < yb, yb - (yb - np.arange(H)) / k, np.arange(H))
            yi = np.broadcast_to(src_r[:, None], (H, W))
            xi = np.broadcast_to(np.arange(W)[None, :].astype(float), (H, W))
            fin = ndi.map_coordinates(fin.astype(float), [yi, xi], order=1) > 0.5
            print("  fin top %.1f -> -125 (x%.3f)" % ((yt - oy) * sv, k))
            fin = ndi.binary_opening(fin, structure=disk(3 / sv)) & fin
            # 灰は頭の線の下まで敷く（線が灰の端を隠すので、端の角やすき間が出ない）
            gray = (ndi.binary_fill_holes(hair | fin) | (fin & head)) & (out_head < 1.5)
            gray = smooth(gray, 0.4 * u)
            hair = smooth(fin, 0.4 * u)
        # あごより 8 下から下は、胴より後ろの層（三つ編みと、肩に掛かるくせ毛は胸の前なので前の層のまま）
        lower = hair & (yy > 8) if name != "braids" and not fix.get("front_all") else np.zeros_like(hair)
        # 前の層は切れ目より少し下（1.5）まで伸ばし、後ろの層と重ねる（切れ目にすき間の線が出ないように）
        front = hair & ~(lower & (yy > 9.5)) if lower.any() else hair
        lower = components(lower, lambda sl, n: n * sv * sv > 150)
        g2 = components(smooth(gray, 0.4 * u), lambda sl, n: n * sv * sv > 3)
        ys, xs = np.nonzero(front)
        result[name][view] = {
            "black": to_head(trace(front), sv, ox, oy) if front.any() else "",
            "gray": to_head(trace(g2), sv, ox, oy) if g2.any() else "",
            "behind": to_head(trace(lower), sv, ox, oy) if lower.any() else "",
            "dark": to_head(trace(dark), sv, ox, oy) if dark.any() else "",
            "skin": to_head(trace(skin), sv, ox, oy) if skin.any() else "",
            "top": round(float((ys.min() - oy) * sv), 1) if front.any() else None,
            "scale": round(sv, 5), "ox": round(float(ox), 1), "oy": round(float(oy), 1), "W": W, "H": H,
        }
        print(name, view, "s=%.4f" % sv, "shift=(%.1f, %.1f)" % (sx, sy), "top", result[name][view]["top"],
              "len", len(result[name][view]["black"]) + len(result[name][view]["gray"]) + len(result[name][view]["behind"]), flush=True)
json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)

# ---- TypeScript に書き出す（環境変数 HAIR_TS に .ts のパスがあれば） ----
TS = os.environ.get("HAIR_TS")
if TS:
    # スキンヘッドのつやの線（向きごと）。作者の元の絵（スキンヘッドの 3 枚）のつやの線の真ん中を頭の座標に直して当てはめた。頭の線から離して内側に置く
    GLOSS = {v: f'<path d="{d}" fill="none" stroke="#ccc" stroke-width="4" stroke-linecap="round"/>' for v, d in {
        "front": "M-32.5 -60.5Q-28.9 -73.1 -15.6 -80.4",
        "quarter": "M-32.2 -63.1Q-26.7 -77.9 -9.6 -82.8",
        "side": "M-32.2 -62.9Q-26.3 -77.7 -9.4 -82.8",
    }.items()}
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
            # スキンヘッドとソフトモヒカンの頭の丸みは顔の輪郭の線にそのままつながる 1 つの形（3 つの向きで同じ）
            # 肌の塗りは線の両はし（y −48）で閉じる（下まで塗ると目に掛かる）。線は顔の輪郭の線の真っすぐな所まで伸ばして重ねる
            dome_fill = DOME.split("L", 1)[1].rsplit("L", 1)[0]
            front = (f'<path d="M{dome_fill}Z" fill="SKINFILL"/><path d="{DOME}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>'
                     if name in ("skinhead", "softMohawk") else "")
            if d.get("skin"):
                front += f'<path d="{d["skin"]}" fill="SKINFILL"/>'
            if name == "skinhead":
                front += GLOSS[view]
            elif name == "softMohawk":
                # 剃った所の灰は頭の線の下に敷き（線が灰の端を隠す）、とさかを線の上に重ねる
                front = front.replace('<path d="M-45', f'<path d="{d["gray"]}" fill="#777"/><path d="M-45', 1)
                front += f'<path d="{d["black"]}" fill="HAIRFILL"/>'
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
