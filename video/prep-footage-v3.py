"""台本 v3 の現場の映像（ヒアリング・なぜ・翻訳を入れない・試したところ・現場の声）を、紙芝居の窓に流す mp4 に切る。

使い方: python video/prep-footage-v3.py <切り方の表（json）> <素材の置き場> <録画の置き場（private/rec）>
出すもの: video/out/pub/v3/<場面>.mp4（git の外）（1152x648・30fps・音なし）

切り方の表は git の外に置く（素材のフォルダ名とファイル名を公開物に書かないため）。形:
  { "<場面>": [ {"src": "<素材の置き場からの相対パス、または rec:<録画の相対パス>>",
                 "a": 使い始めの秒, "b": 使い終わりの秒（静止画は無し）, "out": 動画の中の秒,
                 "blur": [[x, y, w, h(, fade)], ...],   # ぼかす所（画面に対する割合 0〜1。fade は下の端をなだらかにする幅）
                 "keep": [x, y, w, h],          # これがあれば、ここ以外を全部ぼかす（人の顔を残さない）
                 "crop": [x, y, w, h],          # 切り抜く所（割合。16:9 に近い形で）
                 "crop_to": [x, y],             # あれば、切り抜く所の左上を b の秒までにここへ動かす（カメラが動く映像を追う）
                 "white": [[x, y, w, h], ...] } ] }  # 白で消す所（割合）
各場面の out の合計が、表の "_len" の秒と合わなければ止まる。表に "_dir" があれば、出す先を video/out/pub/<_dir>/ にする（既定は v3）。
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter

TABLE, ROOT, REC = sys.argv[1], sys.argv[2], sys.argv[3]
OUT_DIR = ""  # 表を読んでから決める
W, H = 1152, 648
BLUR = 28  # ぼかしの強さ（boxblur の半径。顔もロゴも読めない強さ）


def src_path(s: str) -> str:
    return os.path.join(REC, s[4:]) if s.startswith("rec:") else os.path.join(ROOT, s)


def px(r, w, h):
    x, y, bw, bh = r[:4]
    X, Y = int(x * w) // 2 * 2, int(y * h) // 2 * 2
    return X, Y, max(2, int(bw * w) // 2 * 2), max(2, int(bh * h) // 2 * 2)


def still(p: dict, tmp: str, i: int) -> str:
    """写真（heic は ffmpeg で png にしてから）を、ぼかして 16:9 の 1 枚にする"""
    src = src_path(p["src"])
    png = os.path.join(tmp, f"s{i}.png")
    if src.lower().endswith(".heic"):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-frames:v", "1", png], check=True)
    else:
        Image.open(src).convert("RGB").save(png)
    im = Image.open(png).convert("RGB")
    w, h = im.size
    if "keep" in p:
        k = px(p["keep"], w, h)
        keep = im.crop((k[0], k[1], k[0] + k[2], k[1] + k[3]))
        im = im.filter(ImageFilter.GaussianBlur(w / 60))
        im.paste(keep, (k[0], k[1]))
    for key, rad in (("blur", w / 60), ("soft", w / 400)):  # soft は字が読めない程度に少しだけぼかす（写真だけ）
        for r in p.get(key, []):
            b = px(r, w, h)
            reg = im.crop((b[0], b[1], b[0] + b[2], b[1] + b[3])).filter(ImageFilter.GaussianBlur(rad))
            im.paste(reg, (b[0], b[1]))
    d = ImageDraw.Draw(im)
    for r in p.get("white", []):
        b = px(r, w, h)
        d.rectangle((b[0], b[1], b[0] + b[2], b[1] + b[3]), fill="white")
    if "crop" in p:
        c = px(p["crop"], w, h)
        im = im.crop((c[0], c[1], c[0] + c[2], c[1] + c[3]))
    else:  # 真ん中を 16:9 に切る
        ch = int(im.width * 9 / 16)
        if ch <= im.height:
            top = (im.height - ch) // 2
            im = im.crop((0, top, im.width, top + ch))
    im.thumbnail((W, H))
    bg = Image.new("RGB", (W, H), "white")
    bg.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    out = os.path.join(tmp, f"s{i}.jpg")
    bg.save(out, quality=92)
    return out


def part(p: dict, tmp: str, i: int) -> str:
    out = os.path.join(tmp, f"p{i:02d}.mp4")
    tail = f"fps=30,scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:white,trim=duration={p['out']},setsar=1"
    if "b" not in p:  # 静止画
        img = still(p, tmp, i)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", str(p["out"]), "-i", img, "-vf", tail,
                        "-r", "30", "-video_track_timescale", "15360", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], check=True)
        return out
    src = src_path(p["src"])
    wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src],
                        capture_output=True, text=True, check=True).stdout.strip().split("\n")[0].split(",")
    w, h = int(wh[0]), int(wh[1])
    rate = (p["b"] - p["a"]) / p["out"]
    g = []
    cur = "[0:v]"
    n = 0
    if "keep" in p:
        k = px(p["keep"], w, h)
        g.append(f"{cur}split[ka{n}][kb{n}];[ka{n}]boxblur={BLUR}:3[kbl{n}];[kb{n}]crop={k[2]}:{k[3]}:{k[0]}:{k[1]}[kk{n}];[kbl{n}][kk{n}]overlay={k[0]}:{k[1]}[v{n}]")
        cur = f"[v{n}]"
        n += 1
    for r in p.get("blur", []):
        b = px(r, w, h)
        if len(r) > 4:  # 5 つ目は下の端をなだらかにする幅（高さに対する割合）。境目が線に見えないように、ぼかしを下へ少しずつ薄くする
            f = max(2, int(r[4] * h) // 2 * 2)
            bh = min(b[3] + f, h - b[1])
            g.append(f"{cur}split[ba{n}][bb{n}];[bb{n}]crop={b[2]}:{bh}:{b[0]}:{b[1]},boxblur={BLUR}:3,format=yuva444p,"
                     f"geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(Y,{b[3]}),255,255*clip(({bh}-Y)/{f},0,1))'[bc{n}];"
                     f"[ba{n}][bc{n}]overlay={b[0]}:{b[1]}:format=auto[v{n}]")
        else:
            g.append(f"{cur}split[ba{n}][bb{n}];[bb{n}]crop={b[2]}:{b[3]}:{b[0]}:{b[1]},boxblur={BLUR}:3[bc{n}];[ba{n}][bc{n}]overlay={b[0]}:{b[1]}[v{n}]")
        cur = f"[v{n}]"
        n += 1
    pre = "".join(f"drawbox=x={b[0]}:y={b[1]}:w={b[2]}:h={b[3]}:color=white:t=fill," for b in (px(r, w, h) for r in p.get("white", [])))
    if "crop" in p:
        c = px(p["crop"], w, h)
        if "crop_to" in p:
            e = px([*p["crop_to"], p["crop"][2], p["crop"][3]], w, h)
            d = p["b"] - p["a"]
            pre += f"crop={c[2]}:{c[3]}:'{c[0]}+({e[0] - c[0]})*min(t/{d},1)':'{c[1]}+({e[1] - c[1]})*min(t/{d},1)',"
        else:
            pre += f"crop={c[2]}:{c[3]}:{c[0]}:{c[1]},"
    g.append(f"{cur}{pre}setpts=(PTS-STARTPTS)/{rate},{tail}[out]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(p["a"]), "-to", str(p["b"]), "-i", src, "-an",
                    "-filter_complex", ";".join(g), "-map", "[out]", "-r", "30", "-video_track_timescale", "15360", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], check=True)
    return out


with open(TABLE, encoding="utf-8") as f:
    table = json.load(f)
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pub", table.get("_dir", "v3"))
os.makedirs(OUT_DIR, exist_ok=True)
only = sys.argv[4:]  # 場面の名前を渡せば、その場面だけ作る
for name, parts in table.items():
    if name.startswith("_") or (only and name not in only):
        continue
    want = table["_len"][name]
    total = sum(p["out"] for p in parts)
    if abs(total - want) > 1e-6:
        sys.exit(f"{name}: 合計が {want} 秒でない: {total}")
    with tempfile.TemporaryDirectory() as tmp:
        files = [part(p, tmp, i) for i, p in enumerate(parts)]
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in files)
        dst = os.path.join(OUT_DIR, f"{name}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", dst], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst], capture_output=True, text=True).stdout.strip()
    print(f"{dst} {d} 秒")
