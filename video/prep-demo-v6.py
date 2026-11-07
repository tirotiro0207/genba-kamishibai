"""通し v6 の E の段（デモ）の素材を、録画から作る。切り出す秒は全部 video/demo-cuts-v6.json にある。

使い方: python video/prep-demo-v6.py <録画の置き場（private/rec）>
出すもの（git の外）: video/out/pub/v6/ の demo.mp4（40 秒・1152x648・30fps・音なし）・notrans.mp4・panels.png・e9.png
録画を撮り直したら、表の録画の秒を直してこれを流すだけでよい（v6.tsx の E の秒は demo.mp4 の中の秒）。
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REC = sys.argv[1]
T = json.load(open(os.path.join(HERE, "demo-cuts-v6.json"), encoding="utf-8"))
OUT = os.path.join(HERE, "out", "pub", "v6")
os.makedirs(OUT, exist_ok=True)


def run(*a: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


def find(run_dir: str, name: str) -> str:
    hits = glob.glob(os.path.join(REC, run_dir, "*", name))
    if len(hits) != 1:
        sys.exit(f"録画が 1 本に決まらない: {run_dir}/*/{name} → {hits}")
    return hits[0]


# 1. demo.mp4: 区間ごとに速さを変えて切り、つなぐ
segs = T["demo"]["segs"]
total = sum(s[3] for s in segs)
if abs(total - T["demo"]["len"]) > 1e-6:
    sys.exit(f"区間の長さの合計が {T['demo']['len']} 秒でない: {total}")
demo = os.path.join(OUT, "demo.mp4")
with tempfile.TemporaryDirectory() as tmp:
    parts = []
    for i, (key, a, b, out, name, opt) in enumerate(segs):
        src = find(T["runs"][key], name)
        rate = (b - a) / out
        p = os.path.join(tmp, f"p{i:02d}.mp4")
        pre = "".join(f"drawbox=x={x}:y={y}:w={w}:h={h}:color=white:t=fill," for x, y, w, h in (T["boxes"][n] for n in opt.get("boxes", [])))
        if "zoom" in opt:
            zx, zy = opt["zoom"]
            pre += f"crop=640:360:{zx}:{zy},"
        vf = f"{pre}setpts=(PTS-STARTPTS)/{rate},fps=30,scale=1152:648:force_original_aspect_ratio=decrease,pad=1152:648:(ow-iw)/2:(oh-ih)/2:white,trim=duration={out}"
        run("-ss", str(a), "-to", str(b), "-i", src, "-an", "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", p)
        parts.append(p)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in parts)
    run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", demo)

# 2. 静止画（demo.mp4 の中の秒）
for name, s in T["stills"].items():
    vf = ["-vf", "crop={0}:{1}:{2}:{3}".format(*s["crop"])] if "crop" in s else []
    run("-ss", str(s["t"]), "-i", demo, "-frames:v", "1", *vf, os.path.join(OUT, f"{name}.png"))

# 3. notrans.mp4 は、ほかの現場の映像と同じ切り方（prep-footage-v3.py）で作る
with tempfile.TemporaryDirectory() as tmp:
    tab = os.path.join(tmp, "notrans.json")
    with open(tab, "w", encoding="utf-8") as f:
        json.dump({"_dir": "v6", "_len": {"notrans": T["notrans"]["out"]}, "notrans": [T["notrans"]]}, f, ensure_ascii=False)
    subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "prep-footage-v3.py"), tab, tmp, REC, "notrans"], check=True)

for n in ("demo.mp4", "notrans.mp4", *(f"{k}.png" for k in T["stills"])):
    print(os.path.join(OUT, n), os.path.getsize(os.path.join(OUT, n)), "bytes")
