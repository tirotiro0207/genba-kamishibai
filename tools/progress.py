"""軸（docs/compass.md）と作業の表（docs/plan.md）から、進み具合を作る。

    python tools/progress.py          # docs/progress.md と docs/dashboard.html を作り直す
    python tools/progress.py --check  # 作り直した中身とファイルがずれていたら 1 で終わる
    python tools/progress.py --done 000 10  # マス 000 を済み・実際 10 分にし、前の「直近」を HEAD の番号に書き換えてから作り直す

標準ライブラリだけで動く。「今日」は日本時間の日付。
"""
import datetime
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
COMPASS_TITLES = ["始点", "終点", "終点の先", "変化の質", "変化の量"]
STATES = ["済み", "途中", "まだ"]
MARK = {"済み": "🟩", "途中": "🟨", "まだ": "⬜"}


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def read_compass(text):
    """軸の 5 つの節から、箇条書きを 2 つずつ取る（太字の印は外す）。"""
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"## \d\. (.+?)（", line) or re.match(r"## \d\. (.+)$", line)
        if m:
            cur = m.group(1).strip()
            out[cur] = []
        elif cur and line.startswith("- ") and len(out[cur]) < 2:
            out[cur].append(line[2:].replace("**", "").strip())
    return [(t, out.get(t, [])) for t in COMPASS_TITLES]


def read_plan(text):
    milestones, tasks, section_day = [], [], None
    in_ms = False
    for line in text.splitlines():
        if line.startswith("## 1. 目印"):
            in_ms = True
        elif line.startswith("## ") and in_ms and not line.startswith("## 1. 目印"):
            in_ms = False
        m = re.match(r"### (M\d)（(.+?)）", line)
        if m:
            section_day = m.group(2)
        if not line.startswith("|"):
            continue
        c = cells(line)
        if in_ms and len(c) == 3 and re.match(r"^M\d$", c[0]):
            milestones.append({"id": c[0], "day": c[1], "goal": c[2]})
        elif len(c) == 11 and re.match(r"^\d{3}[ab]?$", c[0]):
            if c[8] not in STATES:
                raise SystemExit(f"plan.md: {c[0]} の状態「{c[8]}」は 済み・途中・まだ のどれでもない")
            tasks.append({"id": c[0], "work": c[1], "milestone": c[4], "minutes": int(c[6]),
                          "star": c[7] == "★", "state": c[8],
                          "actual": int(c[9]) if c[9].isdigit() else None,
                          "commit": c[10], "day": section_day})
    return milestones, tasks


def day_key(day):
    m = re.match(r"(\d+)/(\d+)", day)
    return (int(m.group(1)), int(m.group(2))) if m else (99, 99)


def build(compass_text, plan_text, today):
    compass = read_compass(compass_text)
    milestones, tasks = read_plan(plan_text)
    days = list(dict.fromkeys(t["day"] for t in tasks))  # plan.md に出てくる順
    ms_rows = []
    for ms in milestones:
        ts = [t for t in tasks if t["milestone"] == ms["id"]]
        done = [t for t in ts if t["state"] == "済み"]
        ms_rows.append({**ms, "n": len(ts), "done": len(done),
                        "min": sum(t["minutes"] for t in ts), "done_min": sum(t["minutes"] for t in done),
                        # 目印の日を過ぎても済んでいないマスがあれば遅れ
                        "late": day_key(ms["day"]) < (today.month, today.day) and len(done) < len(ts)})
    today_key = (today.month, today.day)
    left_today = [t for t in tasks if t["state"] != "済み" and day_key(t["day"]) == today_key]
    left_before = [t for t in tasks if t["state"] != "済み" and day_key(t["day"]) < today_key]
    total = {"n": len(tasks), "done": sum(t["state"] == "済み" for t in tasks),
             "min": sum(t["minutes"] for t in tasks),
             "done_min": sum(t["minutes"] for t in tasks if t["state"] == "済み"),
             "actual": sum(t["actual"] or 0 for t in tasks)}
    return {"compass": compass, "ms": ms_rows, "tasks": tasks, "days": days, "today": today,
            "left_today": left_today, "left_before": left_before, "total": total,
            "today_plan_min": sum(t["minutes"] for t in tasks if day_key(t["day"]) == today_key)}


def pct(a, b):
    return f"{round(100 * a / b)}%" if b else "—"


def render_md(d):
    L = ["# 進み具合", "",
         f"`tools/progress.py` が [plan.md](plan.md) と [compass.md](compass.md) から作る（手で書かない）。作った日: {d['today']:%Y-%m-%d}（日本時間）", "",
         "## 軸", ""]
    for title, items in d["compass"]:
        L.append(f"- **{title}**: " + " / ".join(items))
    t = d["total"]
    L += ["", "## 目印ごとの進み具合", "",
          f"全体: {t['done']} / {t['n']} マス、{t['done_min']} / {t['min']} 分（見込みの分で {pct(t['done_min'], t['min'])}）。実際の分の合計 {t['actual']} 分", "",
          "| 目印 | 日 | 済んだマス / 全部 | 済んだ分 / 見込みの分 | 進み |", "|---|---|---|---|---|"]
    for m in d["ms"]:
        L.append(f"| {m['id']} | {m['day']} | {m['done']} / {m['n']} | {m['done_min']} / {m['min']} | {pct(m['done_min'], m['min'])} |")
    L += ["", "## 日ごとの全マス", "", "🟩 済み　🟨 途中　⬜ まだ　**★** 一番遅れてはいけない筋", ""]
    for day in d["days"]:
        ts = [x for x in d["tasks"] if x["day"] == day]
        L += [f"### {day}（{sum(x['state'] == '済み' for x in ts)} / {len(ts)} マス）", "",
              "| 状態 | ★ | ID | 作業 | 目印 | 見込みの分 | 実際の分 | コミット |", "|---|---|---|---|---|---|---|---|"]
        for x in ts:
            star = "**★**" if x["star"] else ""
            work = f"**{x['work']}**" if x["star"] else x["work"]
            L.append(f"| {MARK[x['state']]} {x['state']} | {star} | {x['id']} | {work} | {x['milestone']} | {x['minutes']} | "
                     f"{x['actual'] if x['actual'] is not None else ''} | {x['commit']} |")
        L.append("")
    L += [f"## 今日の残り（{d['today'].month}/{d['today'].day}）", ""]
    if d["left_before"]:
        L.append(f"前の日から残っているもの: {len(d['left_before'])} マス、{sum(x['minutes'] for x in d['left_before'])} 分")
        L += [f"- {MARK[x['state']]} {'★ ' if x['star'] else ''}{x['id']} {x['work']}（{x['day']}・{x['minutes']} 分）" for x in d["left_before"]]
        L.append("")
    L.append(f"今日のもの: {len(d['left_today'])} マス、{sum(x['minutes'] for x in d['left_today'])} 分")
    L += [f"- {MARK[x['state']]} {'★ ' if x['star'] else ''}{x['id']} {x['work']}（{x['minutes']} 分）" for x in d["left_today"]]
    return "\n".join(L) + "\n"


FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap">')

# 掲示板のような黒とグレーの面。済み＝黒の塗り、途中＝グレーの塗り、まだ＝枠だけ。赤は遅れの印にだけ使う
CSS = """
:root{
--paper:#f4f4f2;--surface:#ffffff;--ink:#141414;--ink-soft:#5c5c5a;--mid:#b9b9b5;--line:#d9d9d5;--on-ink:#ffffff;--alert:#c8221d;--alert-soft:#fbe9e8;
--font:"Noto Sans JP","Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif;
--t-xs:12px;--t-sm:13px;--t-md:15px;--t-lg:20px;--t-xl:30px;--t-xxl:44px;
--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:24px;--s-6:40px;--s-7:64px;--r:6px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
--paper:#121212;--surface:#1b1b1b;--ink:#ededeb;--ink-soft:#a3a3a0;--mid:#5a5a58;--line:#2e2e2d;--on-ink:#121212;--alert:#ff6b61;--alert-soft:#3a1715;color-scheme:dark}}
:root[data-theme="dark"]{
--paper:#121212;--surface:#1b1b1b;--ink:#ededeb;--ink-soft:#a3a3a0;--mid:#5a5a58;--line:#2e2e2d;--on-ink:#121212;--alert:#ff6b61;--alert-soft:#3a1715;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 var(--t-md)/1.65 var(--font)}
.wrap{max-width:1120px;margin:0 auto;padding-block:var(--s-6) var(--s-7);
padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:var(--s-6)}
h1,h2,h3{margin:0;text-wrap:balance}
.num{font-variant-numeric:tabular-nums}
.eyebrow{font-size:var(--t-xs);font-weight:700;letter-spacing:.12em;color:var(--ink-soft)}
.sec{display:flex;flex-direction:column;gap:var(--s-4)}
.sec>header{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-2) var(--s-4);border-bottom:3px solid var(--ink);padding-bottom:var(--s-2)}
.sec>header h2{font-size:var(--t-lg);font-weight:900}
.sec>header p{margin:0;font-size:var(--t-sm);color:var(--ink-soft)}
/* 上の見出し */
.top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s-5);align-items:end}
.top h1{font-size:var(--t-xl);font-weight:900;line-height:1.25}
.top .src{margin:var(--s-2) 0 0;font-size:var(--t-sm);color:var(--ink-soft);max-width:60ch}
.total{display:flex;gap:var(--s-5);align-items:end}
.total div{display:flex;flex-direction:column}
.total b{font-size:var(--t-xxl);font-weight:900;line-height:1}
.total small{font-size:var(--t-sm);color:var(--ink-soft)}
.total span.u{font-size:var(--t-md);font-weight:700;margin-left:2px}
/* 軸 */
.axis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--s-3)}
.ax{background:var(--surface);border:1px solid var(--line);border-top:6px solid var(--ink);border-radius:0 0 var(--r) var(--r);padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-2);min-width:0}
.ax h3{font-size:var(--t-md);font-weight:900}
.ax p{margin:0;font-size:var(--t-sm);color:var(--ink-soft);line-height:1.6}
/* 目印の帯 */
.band{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:var(--s-1)}
.seg{display:flex;flex-direction:column;gap:var(--s-2);min-width:0}
.seg .meter{position:relative;height:22px;border:2px solid var(--ink);background:var(--surface);overflow:hidden}
.seg .meter i{position:absolute;inset:0 auto 0 0;background:var(--ink)}
.seg .lab .mid{font-size:var(--t-md);font-weight:900;color:var(--ink)}
.seg.late .lab .mid{color:var(--alert)}
.seg .lab{display:flex;flex-direction:column;font-size:var(--t-xs);color:var(--ink-soft);line-height:1.45}
.seg .lab b{font-size:var(--t-sm);color:var(--ink)}
.seg.late .meter{border-color:var(--alert)}
.seg.late .lab b{color:var(--alert)}
.seg.done .meter{background:var(--ink)}
/* 日ごとのマス */
.legend{display:flex;flex-wrap:wrap;gap:var(--s-2) var(--s-4);font-size:var(--t-sm);color:var(--ink-soft);margin:0;padding:0;list-style:none}
.legend li{display:flex;align-items:center;gap:var(--s-2)}
.sw{display:inline-block;width:18px;height:18px;border-radius:3px;border:2px solid var(--ink)}
.sw.s-済み{background:var(--ink)}.sw.s-途中{background:var(--mid);border-color:var(--mid)}.sw.s-まだ{background:var(--surface);border:1px solid var(--line)}
.day{display:flex;flex-direction:column;gap:var(--s-3)}
.day>h3{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-2) var(--s-3);font-size:var(--t-md);font-weight:900}
.day>h3 small{font-weight:400;font-size:var(--t-sm);color:var(--ink-soft)}
.day.today>h3::before{content:"今日";font-size:var(--t-xs);font-weight:700;letter-spacing:.12em;background:var(--ink);color:var(--on-ink);padding:1px var(--s-2);border-radius:3px}
.tasks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--s-2)}
.t{display:flex;flex-direction:column;gap:var(--s-1);padding:var(--s-3);border-radius:var(--r);border:1px solid var(--line);background:var(--surface);min-width:0;font-size:var(--t-sm)}
.t .h{display:flex;align-items:center;gap:var(--s-2)}
.t .id{font-weight:900;font-size:var(--t-md)}
.t .st{margin-left:auto;font-size:var(--t-xs);font-weight:700;letter-spacing:.06em;padding:0 var(--s-2);border-radius:3px;border:1px solid currentColor}
.t .w{line-height:1.5;overflow-wrap:anywhere}
.t .m{font-size:var(--t-xs);color:var(--ink-soft)}
.t.s-済み{background:var(--ink);border-color:var(--ink);color:var(--on-ink)}
.t.s-済み .m{color:var(--on-ink);opacity:.72}
.t.s-途中{background:var(--mid);border-color:var(--mid)}
.t.s-途中 .m{color:var(--ink)}
.t.s-まだ{color:var(--ink-soft)}
.t.s-まだ .id,.t.s-まだ .w{color:var(--ink)}
.t.star{border-width:3px;border-color:var(--ink)}
.t.star.s-まだ{box-shadow:inset 0 0 0 1px var(--ink)}
.t .sm{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;font-size:var(--t-sm);font-weight:900;background:var(--ink);color:var(--on-ink)}
.t.s-済み .sm{background:var(--on-ink);color:var(--ink)}
/* 今日の残り */
.left{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:var(--s-3)}
.box{background:var(--surface);border:2px solid var(--ink);border-radius:var(--r);padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-3);min-width:0}
.box.over{border-color:var(--alert);background:var(--alert-soft)}
.box .big{display:flex;gap:var(--s-5);align-items:end;flex-wrap:wrap}
.box .big b{font-size:var(--t-xl);font-weight:900;line-height:1}
.box .big small{display:block;font-size:var(--t-xs);color:var(--ink-soft)}
.box .warn{margin:0;font-weight:700;color:var(--alert);font-size:var(--t-sm)}
.box ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:var(--s-1);font-size:var(--t-sm)}
.box li{display:flex;gap:var(--s-2)}
.box li .id{font-weight:900;min-width:3.2em}
.box .none{margin:0;color:var(--ink-soft);font-size:var(--t-sm)}
@media (max-width:900px){.axis{grid-template-columns:repeat(2,minmax(0,1fr))}.band{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:var(--s-3)}}
@media (max-width:560px){.top{grid-template-columns:1fr}.axis{grid-template-columns:1fr}.total b{font-size:var(--t-xl)}}
@media (prefers-reduced-motion:no-preference){.seg .meter i{transition:width .3s ease}}
"""


def render_html(d):
    e = html.escape
    t = d["total"]
    today_label = f'{d["today"].month}/{d["today"].day}'
    P = ['<!doctype html><html lang="ja"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         f"<title>現場の紙芝居 進み具合</title>{FONTS}<style>{CSS}</style></head><body><div class=\"wrap\">",
         '<header class="top"><div><p class="eyebrow">進み具合</p><h1>現場の紙芝居</h1>',
         f'<p class="src">plan.md と compass.md から tools/progress.py が作る（手で書かない）。作った日: {d["today"]:%Y-%m-%d}（日本時間）</p></div>',
         f'<div class="total num"><div><small>済んだマス</small><b>{t["done"]}<span class="u">/ {t["n"]}</span></b></div>'
         f'<div><small>見込みの分で</small><b>{pct(t["done_min"], t["min"])}</b></div>'
         f'<div><small>実際の分</small><b>{t["actual"]}<span class="u">分</span></b></div></div></header>']
    # 軸
    P.append('<section class="sec"><header><h2>軸</h2><p>何から何へ変えるか</p></header><div class="axis">')
    for title, items in d["compass"]:
        P.append(f'<article class="ax"><h3>{e(title)}</h3>' + "".join(f"<p>{e(i)}</p>" for i in items) + "</article>")
    P.append("</div></section>")
    # 目印の帯
    late = [m for m in d["ms"] if m["late"]]
    note = f'遅れている目印 {len(late)} つ' if late else "遅れている目印なし"
    P.append(f'<section class="sec"><header><h2>目印の進み具合</h2><p class="num">{t["done_min"]} / {t["min"]} 分 ・ {note}</p></header><div class="band">')
    for m in d["ms"]:
        w = round(100 * m["done_min"] / m["min"]) if m["min"] else 0
        cls = "seg" + (" late" if m["late"] else "") + (" done" if m["n"] and m["done"] == m["n"] else "")
        P.append(f'<div class="{cls}" title="{e(m["goal"])}"><div class="lab num"><span class="mid">{m["id"]}</span></div><div class="meter"><i style="width:{w}%"></i></div>'
                 f'<div class="lab num"><b>{e(m["day"])}{"・遅れ" if m["late"] else ""}</b><span>{m["done"]} / {m["n"]} マス</span><span>{m["done_min"]} / {m["min"]} 分</span></div></div>')
    P.append("</div></section>")
    # 日ごとのマス
    P.append('<section class="sec"><header><h2>日ごとのマス</h2><p>★ は一番遅れてはいけない筋</p></header>'
             '<ul class="legend"><li><span class="sw s-済み"></span>済み</li><li><span class="sw s-途中"></span>途中</li>'
             '<li><span class="sw s-まだ"></span>まだ</li><li><span class="sw"></span>太い枠と ★ は遅れてはいけない筋</li></ul>')
    for day in d["days"]:
        ts = [x for x in d["tasks"] if x["day"] == day]
        is_today = day_key(day) == (d["today"].month, d["today"].day)
        act = sum(x["actual"] or 0 for x in ts)
        P.append(f'<div class="day{" today" if is_today else ""}"><h3>{e(day)}<small class="num">{sum(x["state"] == "済み" for x in ts)} / {len(ts)} マス ・ '
                 f'見込み {sum(x["minutes"] for x in ts)} 分 ・ 実際 {act} 分</small></h3><div class="tasks">')
        for x in ts:
            star = '<span class="sm" aria-label="遅れてはいけない筋">★</span>' if x["star"] else ""
            a = x["actual"] if x["actual"] is not None else "—"
            com = f" ・ {e(x['commit'])}" if x["commit"] else ""
            P.append(f'<div class="t s-{x["state"]}{" star" if x["star"] else ""}"><div class="h">{star}<span class="id num">{x["id"]}</span>'
                     f'<span class="st">{x["state"]}</span></div><div class="w">{e(x["work"])}</div>'
                     f'<div class="m num">見込み {x["minutes"]} 分 ・ 実際 {a} 分 ・ {x["milestone"]}{com}</div></div>')
        P.append("</div></div>")
    P.append("</section>")
    # 今日の残り
    left = d["left_before"] + d["left_today"]
    left_min = sum(x["minutes"] for x in left)
    over = left_min > d["today_plan_min"]
    P.append(f'<section class="sec"><header><h2>今日の残り（{today_label}）</h2><p class="num">今日の見込み {d["today_plan_min"]} 分</p></header><div class="left">')
    P.append(f'<div class="box{" over" if over else ""}"><div class="big num"><div><small>残りのマス</small><b>{len(left)}</b></div>'
             f'<div><small>残りの見込み</small><b>{left_min}<span class="u"> 分</span></b></div></div>')
    if over:
        P.append(f'<p class="warn">残りが今日の見込みを {left_min - d["today_plan_min"]} 分超えている（前の日からの残り {len(d["left_before"])} マス）</p>')
    if left:
        P.append("<ul>" + "".join(f'<li class="num"><span class="id">{x["id"]}</span><span>{"★ " if x["star"] else ""}{e(x["work"])}'
                                  f'（{e(x["day"]) if x in d["left_before"] else x["state"]}・{x["minutes"]} 分）</span></li>' for x in left) + "</ul>")
    else:
        P.append('<p class="none">今日の分は全部済んだ</p>')
    P.append("</div></div></section></div></body></html>")
    return "\n".join(P) + "\n"


def mark_done(task_id, minutes):
    """plan.md の 1 行を済みにする。前に済ませたマスの「直近」は、いまの HEAD のコミットの番号に書き換える。"""
    import subprocess
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    path = DOCS / "plan.md"
    out, found = [], False
    for line in path.read_text(encoding="utf-8").split("\n"):
        c = cells(line) if line.startswith("|") else []
        if len(c) == 11 and re.match(r"^\d{3}[ab]?$", c[0]):
            if c[10] == "直近":
                c[10] = head
            if c[0] == task_id:
                c[8], c[9], c[10], found = "済み", str(minutes), "直近", True
            line = "| " + " | ".join(c) + " |"
        out.append(line)
    if not found:
        raise SystemExit(f"plan.md に {task_id} が無い")
    path.write_text("\n".join(out), encoding="utf-8", newline="\n")


def main(argv):
    if "--done" in argv:
        i = argv.index("--done")
        mark_done(argv[i + 1], int(argv[i + 2]))
        argv = [a for a in argv if a != "--check"]
    today =datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date()
    d = build((DOCS / "compass.md").read_text(encoding="utf-8"), (DOCS / "plan.md").read_text(encoding="utf-8"), today)
    outputs = {DOCS / "progress.md": render_md(d), DOCS / "dashboard.html": render_html(d)}
    if "--check" in argv:
        # Windows では git が改行を CRLF にすることがあるので、改行の違いは見ない
        stale = [p.name for p, s in outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8").replace("\r\n", "\n") != s]
        if stale:
            print("進み具合が plan.md とずれています: " + "・".join(stale) + "。python tools/progress.py で作り直してください")
            return 1
        return 0
    for p, s in outputs.items():
        p.write_text(s, encoding="utf-8", newline="\n")
    print(f"{d['total']['done']} / {d['total']['n']} マス済み。progress.md と dashboard.html を作った")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
