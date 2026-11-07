"""台本 v3 のデモ（1:05〜1:45 の 40 秒）を、事例シートを入れた録画から切ってつなぐ。

使い方: python video/cut-demo-v3.py <録画の置き場（private/rec）>
出すもの: video/out/pub/v3/demo.mp4（git の外）（1152x648・30fps・音なし）

区間は (録画のフォルダの頭, 使い始めの秒, 使い終わりの秒, 動画の中の秒)。
動画の中の秒に合わせて速さを変える（待ちの長い所は速め、押す所は等倍に近く）。
"""
import glob
import os
import subprocess
import sys
import tempfile

ROOT = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pub", "v3", "demo.mp4")

SEGS = [
    # 取り出しからカードまで（1 本目）
    ("runs-video-sheet-20261107-173822", 4, 10, 3.0, "video.webm"),     # 紙を添付して送る
    ("runs-video-sheet-20261107-173822", 23, 31, 5.0, "video.webm"),    # 取り出した決まりに印を付ける
    ("runs-video-sheet-20261107-173822", 31, 207, 4.0, "video.webm"),   # 4 枚を作る（速める）
    ("runs-video-sheet-20261107-173822", 207, 214, 3.0, "video.webm"),  # できたカード
    ("runs-video-sheet-20261107-173822", 238, 246, 4.0, "video.webm"),  # 確かめる AI の指摘
    # 枠で直す → 赤（2 本目）
    ("runs-video-sheet2-20261107-174448", 5, 12, 3.5, "video.webm"),
    ("runs-video-sheet2-20261107-174448", 12, 56, 2.0, "video.webm"),
    ("runs-video-sheet2-20261107-174448", 57, 62, 3.0, "video.webm"),
    # 言葉で直す（3 本目）→ 緑（4 本目）
    ("runs-video-sheet3-20261107-174653", 5, 12, 3.0, "video.webm"),
    ("runs-video-sheet4-20261107-175353", 26, 33, 3.0, "video.webm"),
    # 署名 → 新入社員の画面（5 本目）
    ("runs-video-sheet5-20261107-175532", 9, 20, 3.5, "video.webm"),
    ("runs-video-sheet5-20261107-175532", 1.2, 6, 3.0, "read/*.webm"),
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
    for i, (run, a, b, out, name) in enumerate(SEGS):
        src = find(run, name)
        rate = (b - a) / out
        p = os.path.join(tmp, f"p{i:02d}.mp4")
        vf = f"setpts=(PTS-STARTPTS)/{rate},fps=30,scale=1152:648:force_original_aspect_ratio=decrease,pad=1152:648:(ow-iw)/2:(oh-ih)/2:white,trim=duration={out}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", src, "-an", "-vf", vf,
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", p], check=True)
        parts.append(p)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", OUT], check=True)

d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT], capture_output=True, text=True).stdout.strip()
print(f"{OUT} {d} 秒")
