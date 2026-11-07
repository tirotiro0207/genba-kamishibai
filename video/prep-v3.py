# 台本 v3 の素材を、git の外の置き場から video/out/pub/v3/ へ写して整える（ローカルで画像を直すだけ。API は使わない）。
#   python video/prep-v3.py <素材の置き場>
# 素材の置き場は private/material の中（写真 3 枚と事例シート 1 枚。git に入れない）。出す先の out/ も git の外。
#  - 写真は長い辺 1600 px に縮める
#  - 事例シートは、機器に見える他社の商品名と小さな銘板の字をぼかしてから縮める（sheet.png）
#  - 折り紙の紙の柄は、事例シートの上の正方形を強くぼかして字を読めなくしたもの（fold.png。台本 v3 の「字がにじんで読めない」紙）
import sys
from pathlib import Path

from PIL import Image, ImageFilter

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent / "out" / "pub" / "v3"
out.mkdir(parents=True, exist_ok=True)


def find(prefix: str) -> Path:
    hits = sorted(p for p in src.iterdir() if p.name.startswith(prefix))
    if len(hits) != 1:
        raise SystemExit(f"{prefix} で始まる素材が 1 つではない: {[p.name for p in hits]}")
    return hits[0]


def shrink(im: Image.Image, long: int) -> Image.Image:
    k = long / max(im.size)
    return im if k >= 1 else im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)


for key, name in (("A1", "a1.jpg"), ("A2", "a2.jpg"), ("A3", "a3.jpg"), ("A5", "a5.jpg")):
    shrink(Image.open(find(key + "_")).convert("RGB"), 1600).save(out / name, quality=92)

# A6 は素材の時点で飲み物のラベルなどを四角くぼかしてある。四角の縁が硬いので、少し広い所を強くぼかし、縁をぼかした型でなじませる
a6 = Image.open(find("A6_")).convert("RGB")
if a6.size != (960, 1280):
    raise SystemExit(f"A6 の大きさが前と違う {a6.size}。なじませる所を測り直す")
for box in [(110, 660, 450, 1020), (80, 255, 250, 360)]:
    pad = 40
    big = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    part = a6.crop(big)
    soft = part.filter(ImageFilter.GaussianBlur(14))
    mask = Image.new("L", part.size, 0)
    mask.paste(255, (pad, pad, part.width - pad, part.height - pad))
    part.paste(soft, (0, 0), mask.filter(ImageFilter.GaussianBlur(pad / 2)))
    a6.paste(part, big[:2])
shrink(a6, 1600).save(out / "a6.jpg", quality=92)

sheet = Image.open(find("B_")).convert("RGB")
if sheet.size != (2558, 3175):
    raise SystemExit(f"事例シートの大きさが前と違う {sheet.size}。ぼかす所を測り直す")
# 機器の銘板の帯・メーカー名・商品名（元の画素で測った所）
# 黄色の説明の字（「右肘付近から流出」と星）は元のまま残す（ぼかした所に重なるため、黄色の画素だけ元に戻す）
for box in [(815, 1192, 1240, 1252)]:
    orig = sheet.crop(box)
    part = orig.filter(ImageFilter.GaussianBlur(9))
    yellow = orig.point(lambda v: v).convert("RGB")
    mask = Image.new("L", orig.size, 0)
    mask.putdata([255 if r > 190 and g > 190 and b < 120 else 0 for r, g, b in list(yellow.get_flattened_data())])
    part.paste(orig, (0, 0), mask.filter(ImageFilter.MaxFilter(3)))
    sheet.paste(part, box[:2])
shrink(sheet, 2400).save(out / "sheet.png")
# 折り紙の柄: 見出しと写真の上の正方形。字が読めないほどぼかす
sq = sheet.crop((0, 0, sheet.width, sheet.width)).resize((600, 600), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
sq.save(out / "fold.png")
print("→", out, sorted(p.name for p in out.iterdir()))
