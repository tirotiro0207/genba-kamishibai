"""絵コンテ v6 の音を 1 本の WAV（3:00・48 kHz・ステレオ）にする。お金のかかる生成は使わず、全部ここで作る（正弦波と雑音）。

使い方: python video/sound-v6.py  → video/out/v6/sound.wav（git の外）
render-v6.mjs が書き出した映像に重ねる。秒は v6.tsx の秒と同じ。
- 効果音は EVENTS の表（秒・種類・大きさ）
- 音楽は軽いくり返し（C・G・Am・F）。0:26.8 で止め、0:48.5 に続きから鳴らす。大きさは MUSIC_VOL の折れ線
- 11/6 の人の声は使わない（同意がまだ）。作者の声（自撮り）は届いたら足す
- 最後の 0.5 秒は無音
"""
import os
import wave

import numpy as np

SR = 48000
DUR = 180.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
out = np.zeros((N, 2), dtype=np.float64)


def tt(d: float) -> np.ndarray:
    return np.arange(int(SR * d)) / SR


def add(at: float, sig: np.ndarray, vol: float = 1.0, pan: float = 0.0) -> None:
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * vol
    out[i : i + len(sig), 0] += sig * (1 - max(0, pan))
    out[i : i + len(sig), 1] += sig * (1 + min(0, pan))


def env(d: float, a: float = 0.005, r: float = 0.05) -> np.ndarray:
    x = tt(d)
    e = np.minimum(1, x / max(a, 1e-4)) * np.minimum(1, (d - x) / max(r, 1e-4))
    return np.clip(e, 0, 1)


def lowpass(x: np.ndarray, k: int) -> np.ndarray:
    if k <= 1:
        return x
    return np.convolve(x, np.ones(k) / k, mode="same")


def noise(d: float) -> np.ndarray:
    return rng.standard_normal(int(SR * d))


def band(d: float, lo: int, hi: int) -> np.ndarray:
    """雑音を、移動平均の差で大まかに帯域に絞る"""
    n = noise(d)
    return lowpass(n, max(1, SR // hi)) - lowpass(n, max(1, SR // lo))


# ---- 効果音の部品 ----
def hum(d):  # 電気室の低いうなり「ブーン」
    x = tt(d)
    return (np.sin(2 * np.pi * 50 * x) + 0.6 * np.sin(2 * np.pi * 100 * x) + 0.3 * np.sin(2 * np.pi * 150 * x)) * env(d, 0.3, 0.05) * 0.35


def crack(d=0.14):  # バチッ
    x = tt(d)
    return noise(d) * np.exp(-x * 40) * 1.2 + np.sin(2 * np.pi * 90 * x) * np.exp(-x * 30)


def ring(d):  # 耳鳴り
    x = tt(d)
    return np.sin(2 * np.pi * 6200 * x) * env(d, 0.4, d * 0.6) * 0.05


def piano(f, d=3.5):  # ピアノの低い音（倍音と減衰）
    x = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * h * x) for h, a in ((1, 1), (2, 0.45), (3, 0.2), (4, 0.1)))
    return s * np.exp(-x * 1.1) * env(d, 0.004, 0.3) * 0.5


def pop(f=900, d=0.09):  # ポッ
    x = tt(d)
    return np.sin(2 * np.pi * f * x * (1 - x * 3)) * np.exp(-x * 45) * 0.5


def rustle(d=0.3):  # パサッ（紙）
    return band(d, 1500, 8000) * np.exp(-tt(d) * 10) * 0.9


def whoosh(d=0.35):  # シュッ・スッ
    x = tt(d)
    return band(d, 600, 6000) * np.sin(np.pi * x / d) ** 2 * 0.8


def wood(d=1.4):  # 木がこすれる音・戸の音
    x = tt(d)
    return band(d, 120, 900) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * x)) * env(d, 0.1, 0.3) * 0.9


def click(d=0.03):  # カチッ・ポチ
    return noise(d) * np.exp(-tt(d) * 220) * 0.9


def tick(d=0.02):  # チッ（時計）
    return band(d, 2500, 9000) * np.exp(-tt(d) * 300) * 1.4


def chime(f=880, d=0.8):  # 明るい音
    x = tt(d)
    return (np.sin(2 * np.pi * f * x) + 0.5 * np.sin(2 * np.pi * f * 1.5 * x)) * np.exp(-x * 5) * 0.3


def warn(d=1.4):  # 低い警告音
    x = tt(d)
    return np.sign(np.sin(2 * np.pi * 110 * x)) * (np.sin(2 * np.pi * 2.5 * x) > 0) * env(d, 0.01, 0.2) * 0.12


def thud(d=0.6):  # 低い音 1 回
    x = tt(d)
    return np.sin(2 * np.pi * 55 * x) * np.exp(-x * 6) * 0.8


def write(d):  # 書く音
    x = tt(d)
    return band(d, 2000, 7000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 3 * x))) * env(d, 0.05, 0.1) * 0.25


def pencil(d):  # 鉛筆
    x = tt(d)
    return band(d, 3000, 9000) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 5 * x))) * env(d, 0.05, 0.1) * 0.22


def flip(d=0.35):  # めくる音
    return band(d, 800, 6000) * np.sin(np.pi * tt(d) / d) * 0.7


def stamp(d=0.25):  # ポン（印鑑）
    x = tt(d)
    return np.sin(2 * np.pi * 180 * x * (1 - x)) * np.exp(-x * 18) * 0.9


def clack(d=0.3):  # カタン
    x = tt(d)
    return (noise(d) * np.exp(-x * 60) + np.sin(2 * np.pi * 240 * x) * np.exp(-x * 25)) * 0.7


def fanfare():  # 小さなファンファーレ
    s = np.zeros(int(SR * 1.0))
    for i, f in enumerate((523, 659, 784, 1047)):
        c = chime(f, 0.5) * 0.8
        j = int(i * 0.12 * SR)
        s[j : j + len(c)] += c[: len(s) - j]
    return s


def ambience(d, lo=80, hi=1200, vol=0.08):  # 部屋・現場の音
    return band(d, lo, hi) * env(d, 0.4, 0.4) * vol


def murmur(d):  # ざわめき
    x = tt(d)
    return band(d, 300, 2500) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * x)) * env(d, 0.3, 0.3) * 0.06


# ---- 効果音の表 ----
add(0.0, hum(1.0))
add(1.0, crack(), 1.0)
add(1.2, ring(6.0))
add(8.0, piano(55, 4.5), 1.2)
add(13.0, ambience(3.0, vol=0.1))
for i in range(12):
    add(16.2 + i * 0.18, pop(700 + (i * 97) % 500), 0.6, pan=((i % 5) - 2) / 3)
add(18.5, rustle())
for s in (21.7, 22.3, 22.9):
    add(s, whoosh(0.3), 0.8)
add(25.0, wood(1.6))
add(26.8, click())
add(27.3, ambience(21.2, 60, 600, 0.035))  # 自撮りの部屋の音（声は届いたら足す）
add(48.3, click())
add(49.6, wood(0.9), 0.8)
add(52.0, murmur(1.5))
add(53.5, click(), 0.8)
add(53.8, fanfare(), 0.9)
add(55.0, chime(1320, 0.9), 1.0)
add(56.8, thud(), 0.8)
add(59.0, whoosh(0.5))
for i in range(6):
    add(62.5 + i * 0.8, click(0.04), 0.9)
for i in range(4):
    add(67.0 + i, pop(1200, 0.12), 0.8)
for i in range(16):
    add(71.0 + i * 0.5, tick(), 0.6)
add(73.0, chime(1046, 0.4), 0.9)
add(76.2, write(2.6))
add(79.0, warn(1.6), 1.0)
add(85.5, thud(), 1.0)
for i in range(18):
    add(88.6 + i * 0.17, click(0.02), 0.35)
add(92.0, chime(988, 0.8))
add(96.0, stamp())
add(97.6, flip())
for i in range(10):
    add(110.2 + i * 0.22, click(0.015), 0.2)
add(107.5, ambience(5.0, vol=0.05))
add(119.5, click(), 0.7)
add(122.0, ambience(16.5, 60, 900, 0.05))
add(126.1, clack())
add(128.7, click(), 0.9)
add(129.0, click(), 0.9)
add(138.5, ambience(4.0, 40, 400, 0.08))
add(142.5, pencil(1.5))
add(145.8, pop(1000, 0.15), 0.9)
for i in range(1, 15):
    at = 148.5 + (i - 1) * 0.5 if i <= 6 else 152.5 + 3.4 * (1 - (1 - (i - 7) / 8) ** 2)
    add(at, flip(0.18), 0.5, pan=((i % 3) - 1) / 2)
for i in range(25):
    add(156.5 + i * 0.07, flip(0.12), 0.25, pan=((i % 3) - 1) / 2)
add(167.0, wood(2.0), 0.9)
add(169.5, piano(130.8, 5.0) + piano(164.8, 5.0) * 0.7 + piano(196.0, 5.0) * 0.6, 0.9)

# ---- 音楽（軽いくり返し。m は曲の中の秒） ----
BPM = 96
BEAT = 60 / BPM
CHORDS = [(261.6, 329.6, 392.0), (196.0, 246.9, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 349.2)]  # C G Am F


def music(m: np.ndarray) -> np.ndarray:
    bar = (m // (BEAT * 4)).astype(int) % 4
    beat_t = m % BEAT
    step = (m // (BEAT / 2)).astype(int) % 6
    s = np.zeros_like(m)
    for ci, ch in enumerate(CHORDS):
        on = bar == ci
        if not on.any():
            continue
        mm = m[on]
        pad = sum(np.sin(2 * np.pi * f * mm) + 0.5 * np.sin(2 * np.pi * f * 1.003 * mm) for f in ch) * 0.05
        arp_f = np.array([ch[0] * 2, ch[1] * 2, ch[2] * 2, ch[1] * 2, ch[0] * 2, ch[2]])[step[on]]
        half_t = mm % (BEAT / 2)
        pluck = np.sin(2 * np.pi * arp_f * half_t) * np.exp(-half_t * 9) * 0.18
        bass = np.sin(2 * np.pi * ch[0] / 2 * mm) * np.exp(-(mm % (BEAT * 2)) * 2.5) * 0.18
        s[on] = pad + pluck + bass
    return s * (0.85 + 0.15 * np.exp(-beat_t * 8))


MUSIC_VOL = [(21.5, 0), (22.0, 0.45), (26.79, 0.45), (26.8, 0), (48.5, 0), (48.6, 0.45), (49.3, 0.5), (50.5, 0.8), (52, 0.55), (59, 0.45),
             (78.9, 0.45), (79.0, 0), (88.4, 0), (89.2, 0.45), (105.5, 0.45), (106.5, 0.28), (135.0, 0.28), (136.0, 0.6), (138.5, 0.25),
             (156.0, 0.3), (158.0, 0.7), (163.0, 0.8), (165.0, 1.0), (168.5, 0.9), (170.0, 0), (180, 0)]
t_all = np.arange(N) / SR
mpos = np.where(t_all < 26.8, t_all - 21.5, t_all - 48.5 + 5.3)
vol = np.interp(t_all, [p[0] for p in MUSIC_VOL], [p[1] for p in MUSIC_VOL])
live = vol > 0
mus = np.zeros(N)
mus[live] = music(np.maximum(0, mpos[live])) * vol[live]
out[:, 0] += mus
out[:, 1] += mus

# 0:20〜0:21.5 はこもる（高い音を落とす）
a, b = int(20 * SR), int(21.5 * SR)
for c in (0, 1):
    out[a:b, c] = lowpass(out[a:b, c], 24)
# 最後の 0.5 秒は無音
out[int(179.5 * SR) :] = 0
peak = np.abs(out).max()
out = np.tanh(out * 1.1) * 0.89  # 強い音（バチッ）だけを丸める
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "v6", "sound.wav")
os.makedirs(os.path.dirname(dst), exist_ok=True)
with wave.open(dst, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print(dst, f"{N / SR:.1f} 秒", f"ピーク {peak:.2f}")
