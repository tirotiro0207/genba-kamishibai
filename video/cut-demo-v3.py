"""台本 v3 のデモ（1:05〜1:45 の 40 秒）を、事例シートを入れた録画から切ってつなぐ。

使い方: python video/cut-demo-v3.py <録画の置き場（private/rec）>
出すもの: video/out/pub/v3/demo.mp4（git の外）（1152x648・30fps・音なし）

区間は (録画のフォルダ, 使い始めの秒, 使い終わりの秒, 動画の中の秒, 録画のファイル, 白で消す所・寄せる所)。
動画の中の秒に合わせて速さを変える（待ちの長い所は速め、押す所は等倍に近く）。
"""
import glob
import os
import subprocess
import sys
import tempfile

ROOT = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pub", "v3", "demo.mp4")

S1 = "runs-video-sheet-20261107-173822"
S2 = "runs-video-sheet2-20261107-174448"
S3 = "runs-video-sheet3-20261107-174653"
S4 = "runs-video-sheet4-20261107-175353"
S6 = "runs-video-sheet6-20261107-181459"
# 上の帯（手元の試しの数。本物の数ではないので出さない）と、古い作り方の注記を白で消す。zoom は寄せる所（640x360 の左上）
BAR = (360, 0, 440, 60)
NOTE = (250, 150, 660, 82)
SEGS = [
    # 取り出しからカードまで（1 本目）
    (S1, 4, 10, 2.5, "video.webm", {}),                    # 紙を添付して送る
    (S1, 23, 31, 3.0, "video.webm", {}),                   # 取り出した決まりに印を付ける
    (S1, 31, 207, 2.0, "video.webm", {}),                  # 4 枚を作る（速める）
    (S1, 207, 214, 2.5, "video.webm", {"boxes": [BAR, NOTE]}),  # できたカード
    (S1, 238, 241, 1.5, "video.webm", {}),                 # 確かめる AI: 緑 80
    (S1, 241, 246, 5.5, "video.webm", {"zoom": (256, 288)}),  # ただし「反応したら作業してよい」と逆に取られるおそれ
    # 枠で直す → 赤（2 本目）
    (S2, 6.2, 12, 3.0, "video.webm", {}),
    (S2, 12, 26, 0.7, "video.webm", {"boxes": [BAR]}),
    (S2, 26, 56, 0.8, "video.webm", {}),
    (S2, 57, 62, 4.5, "video.webm", {"zoom": (256, 250)}),  # 赤（危ない読み違い）
    # 言葉で直す（3 本目）→ 緑（4 本目）
    (S3, 5, 12, 3.0, "video.webm", {}),
    (S4, 30, 33, 2.0, "video.webm", {}),
    # 版を上げて確かめ直し、監修者が「命に関わる」を選ぶ → 署名 → 新入社員の画面に赤い縁で届く（6 本目）
    (S6, 68.8, 69.8, 1.0, "video.webm", {"zoom": (256, 288)}),  # 重さはまだ決めていない
    (S6, 74, 75.6, 1.5, "video.webm", {"zoom": (256, 240)}),  # 命に関わるを選んだ
    (S6, 76, 79, 2.5, "video.webm", {"boxes": [BAR]}),
    (S6, 1.2, 7, 4.0, "read/*.webm", {}),
]


def find(run: str, name: str) -> str:
    hits = glob.glob(os.path.join(ROOT, run, "*", name))
    if len(hits) != 1:
        sys.exit(f"録画が 1 本に決まらない: {run}/*/{name} → {hits}")
    return hits[0]


total = sum(s[3] for s in SEGS)
if abs(total - 40.0) > 1e-6:
    sys.exit(f"合計が 40 秒でない: {total}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    parts = []
    for i, (run, a, b, out, name, opt) in enumerate(SEGS):
        src = find(run, name)
        rate = (b - a) / out
        p = os.path.join(tmp, f"p{i:02d}.mp4")
        pre = "".join(f"drawbox=x={x}:y={y}:w={w}:h={h}:color=white:t=fill," for x, y, w, h in opt.get("boxes", []))
        if "zoom" in opt:
            zx, zy = opt["zoom"]
            pre += f"crop=640:360:{zx}:{zy},"
        vf = f"{pre}setpts=(PTS-STARTPTS)/{rate},fps=30,scale=1152:648:force_original_aspect_ratio=decrease,pad=1152:648:(ow-iw)/2:(oh-ih)/2:white,trim=duration={out}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", src, "-an", "-vf", vf,
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", p], check=True)
        parts.append(p)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", OUT], check=True)

d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT], capture_output=True, text=True).stdout.strip()
print(f"{OUT} {d} 秒")
