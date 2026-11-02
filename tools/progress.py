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
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=JetBrains+Mono:wght@400;700;800&display=swap">')

# マスの種類。作業の名前の言葉で分ける（上から順に当てはめ、どれにも当たらなければ「作る」）
KINDS = [
    ("video", "動画", re.compile(r"動画")),
    ("submit", "提出", re.compile(r"提出|README|凍結|応募|公開の")),
    ("people", "人とのやりとり", re.compile(r"監修|同意|現場の確認|段取り|採点者|勘を集める|聞き取り")),
    ("build", "作る", re.compile(r"")),
]


def kind_of(work):
    for key, label, rx in KINDS:
        if rx.search(work):
            return key, label
    return "build", "作る"


# 生成りのグレーの台に白いカードを置く。黄色寄りのオレンジは「いま」と「今日」だけ。緑は済み、赤は遅れと見積もり超え
CSS = """
/* 並び: 題 → いまの箱 → 数字 4 枚 → 軸 5 つ → 目印の帯 → 日ごとの横棒（札） → 日ごとの箱 */
:root{
--paper:#efede8;--card:#ffffff;--ink:#2a2723;--muted:#77716a;--line:#e2ded6;--track:#e7e4dd;
--now:#e39a12;--now-soft:#fcf0d6;--done:#2f8656;--done-soft:#e1f1e6;--late:#c4372c;--late-soft:#fbe5e2;
--k-build:#3f6ea6;--k-video:#3f8a7a;--k-submit:#7657a3;--k-people:#9c7432;
--body:"BIZ UDPGothic","Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif;
--mono:"JetBrains Mono",ui-monospace,"SFMono-Regular",Consolas,monospace;
--t-xs:12px;--t-sm:13px;--t-md:15px;--t-lg:19px;--t-xl:26px;--t-xxl:40px;
--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:24px;--s-6:36px;--s-7:56px;--r:10px;
--shadow:0 1px 2px rgba(40,34,26,.06),0 2px 8px rgba(40,34,26,.05)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
--paper:#181715;--card:#22201d;--ink:#ece8e1;--muted:#a49e94;--line:#34312c;--track:#2c2a26;
--now:#f2b23c;--now-soft:#3a2d12;--done:#5cc08a;--done-soft:#1a3224;--late:#ff7d70;--late-soft:#3d1c18;
--k-build:#7ea6d8;--k-video:#73c0ad;--k-submit:#ab92d6;--k-people:#d0a764;--shadow:none;color-scheme:dark}}
:root[data-theme="dark"]{
--paper:#181715;--card:#22201d;--ink:#ece8e1;--muted:#a49e94;--line:#34312c;--track:#2c2a26;
--now:#f2b23c;--now-soft:#3a2d12;--done:#5cc08a;--done-soft:#1a3224;--late:#ff7d70;--late-soft:#3d1c18;
--k-build:#7ea6d8;--k-video:#73c0ad;--k-submit:#ab92d6;--k-people:#d0a764;--shadow:none;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 var(--t-md)/1.7 var(--body)}
.wrap{max-width:1120px;margin:0 auto;padding-block:var(--s-6) var(--s-7);
padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:var(--s-5)}
h1,h2,h3{margin:0;text-wrap:balance}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.card{background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);border:1px solid var(--line)}
.label{font-size:var(--t-xs);font-weight:700;letter-spacing:.08em;color:var(--muted)}
.sec{display:flex;flex-direction:column;gap:var(--s-3)}
.sec>h2{font-size:var(--t-md);font-weight:700;display:flex;align-items:baseline;gap:var(--s-3);flex-wrap:wrap}
.sec>h2 small{font-weight:400;font-size:var(--t-sm);color:var(--muted)}
/* 題 */
.top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--s-2) var(--s-4)}
.top h1{font-size:var(--t-xl);font-weight:700;line-height:1.3}
.top p{margin:0;font-size:var(--t-sm);color:var(--muted)}
/* いま */
.now{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s-4) var(--s-6);align-items:center;padding:var(--s-5);border-left:8px solid var(--now)}
.now .label{color:var(--now)}
.now h2{font-size:var(--t-lg);font-weight:700;line-height:1.45;margin-top:var(--s-1)}
.now h2 .id{font-family:var(--mono);font-weight:800;margin-right:var(--s-2)}
.now .next{margin:var(--s-2) 0 0;font-size:var(--t-sm);color:var(--muted)}
.now .next b{color:var(--ink);font-weight:700}
.now .rest{text-align:right}
.now .rest b{display:block;font-family:var(--mono);font-size:var(--t-xxl);font-weight:800;line-height:1.05}
.now .rest b span{font-size:var(--t-md);font-weight:700;margin-left:2px}
.now.over{border-left-color:var(--late)}
.now.over .rest b{color:var(--late)}
/* 数字 4 枚 */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--s-3)}
.stat{padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-1);min-width:0}
.stat b{font-family:var(--mono);font-size:var(--t-xl);font-weight:800;line-height:1.15}
.stat b span{font-size:var(--t-sm);font-weight:700;color:var(--muted);margin-left:3px}
.stat .bar{height:6px;border-radius:3px;background:var(--track);overflow:hidden;margin-top:var(--s-1)}
.stat .bar i{display:block;height:100%;background:var(--done)}
.stat.over b{color:var(--late)}
/* 軸 */
.axis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--s-2)}
.ax{padding:var(--s-3);display:flex;flex-direction:column;gap:var(--s-1);min-width:0}
.ax h3{font-size:var(--t-sm);font-weight:700}
.ax p{margin:0;font-size:var(--t-xs);line-height:1.6;color:var(--muted)}
/* 目印の帯 */
.band{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:var(--s-2)}
.seg{padding:var(--s-2) var(--s-3);display:flex;flex-direction:column;gap:var(--s-1);min-width:0;position:relative;overflow:hidden}
.seg .fill{position:absolute;inset:auto 0 0 0;height:4px;background:var(--track)}
.seg .fill i{display:block;height:100%;background:var(--done)}
.seg b{font-family:var(--mono);font-weight:800;font-size:var(--t-md)}
.seg small{font-size:var(--t-xs);color:var(--muted);line-height:1.4}
.seg.today{border:2px solid var(--now);background:var(--now-soft)}
.seg.late{border:2px solid var(--late);background:var(--late-soft)}
.seg.late b{color:var(--late)}
.seg.full b{color:var(--done)}
/* 日ごとの横棒 */
.legend{display:flex;flex-wrap:wrap;gap:var(--s-1) var(--s-4);margin:0;padding:0;list-style:none;font-size:var(--t-xs);color:var(--muted)}
.legend li{display:flex;align-items:center;gap:6px}
.legend i{display:inline-block;width:14px;height:10px;border-radius:3px}
.lanes{padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-2)}
.lane{display:grid;grid-template-columns:7.5em minmax(0,1fr);gap:var(--s-3);align-items:center}
.lane .d{font-size:var(--t-xs);line-height:1.35;color:var(--muted);min-width:0}
.lane .d b{display:block;font-size:var(--t-sm);color:var(--ink)}
.lane.today .d b{color:var(--now)}
.lane.today .track{outline:2px solid var(--now);outline-offset:3px}
.track{display:flex;gap:2px;min-width:0;border-radius:4px}
.tag{flex:var(--w) 1 0;min-width:5px;height:26px;border:0;border-radius:4px;padding:0;cursor:pointer;background:var(--kc);position:relative}
.tag.s-済み{opacity:.32}
.tag.s-途中{background:repeating-linear-gradient(135deg,var(--kc) 0 5px,var(--card) 5px 8px)}
.tag.star{box-shadow:inset 0 0 0 2px var(--ink)}
.tag.now{box-shadow:inset 0 0 0 3px var(--now),0 0 0 2px var(--now)}
.tag[aria-pressed="true"]{outline:3px solid var(--ink);outline-offset:2px;z-index:1}
.tag:focus-visible{outline:3px solid var(--now);outline-offset:2px}
.k-build{--kc:var(--k-build)}.k-video{--kc:var(--k-video)}.k-submit{--kc:var(--k-submit)}.k-people{--kc:var(--k-people)}
.detail{margin-top:var(--s-2);padding:var(--s-3) var(--s-4);border-radius:8px;background:var(--paper);display:flex;flex-direction:column;gap:var(--s-1);font-size:var(--t-sm);min-height:3.4em}
.detail .h{display:flex;flex-wrap:wrap;gap:var(--s-2) var(--s-3);align-items:baseline}
.detail .h b{font-family:var(--mono);font-weight:800}
.detail .meta{color:var(--muted);font-size:var(--t-xs)}
.detail .empty{color:var(--muted)}
/* 日ごとの箱 */
.days{display:flex;flex-direction:column;gap:var(--s-2)}
details.day{overflow:hidden}
details.day>summary{list-style:none;cursor:pointer;padding:var(--s-3) var(--s-4);display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-1) var(--s-3)}
details.day>summary::-webkit-details-marker{display:none}
details.day>summary::before{content:"";width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);align-self:center;margin-right:var(--s-1)}
details.day[open]>summary::before{transform:rotate(45deg)}
details.day>summary b{font-size:var(--t-md)}
details.day>summary small{font-size:var(--t-xs);color:var(--muted)}
details.day.today{border-color:var(--now)}
details.day.today>summary b::after{content:"今日";margin-left:var(--s-2);font-size:var(--t-xs);font-weight:700;padding:1px 6px;border-radius:4px;background:var(--now);color:var(--card)}
.tbl{overflow-x:auto;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:var(--t-sm)}
th,td{text-align:left;padding:var(--s-2) var(--s-3);border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:var(--t-xs);font-weight:700;color:var(--muted);white-space:nowrap}
td.n{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.w{min-width:16em}
tr.s-済み td{color:var(--muted)}
.st{display:inline-block;font-size:var(--t-xs);font-weight:700;padding:0 6px;border-radius:4px;white-space:nowrap}
.st.s-済み{background:var(--done-soft);color:var(--done)}.st.s-途中{background:var(--now-soft);color:var(--now)}.st.s-まだ{border:1px solid var(--line);color:var(--muted)}
.kd{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:var(--t-xs)}
.kd i{width:8px;height:8px;border-radius:2px;background:var(--kc)}
.star-mark{font-weight:700}
@media (max-width:860px){.axis{grid-template-columns:repeat(5,minmax(150px,1fr));overflow-x:auto;padding-bottom:var(--s-1);scroll-snap-type:x mandatory}.ax{scroll-snap-align:start}
.band{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media (max-width:560px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.now{grid-template-columns:1fr}.now .rest{text-align:left}
.band{grid-template-columns:repeat(3,minmax(0,1fr))}.lane{grid-template-columns:4.6em minmax(0,1fr)}}
@media (prefers-reduced-motion:no-preference){.tag{transition:transform .15s ease,opacity .15s ease}.tag:hover{transform:translateY(-2px)}}
"""

SCRIPT = """
(function(){
  var panel=document.getElementById("detail");
  var tags=document.querySelectorAll(".tag");
  function show(t){
    tags.forEach(function(x){x.setAttribute("aria-pressed",x===t?"true":"false")});
    var d=t.dataset;
    panel.innerHTML="";
    var h=document.createElement("div");h.className="h";
    var b=document.createElement("b");b.textContent=d.id;h.appendChild(b);
    var w=document.createElement("span");w.textContent=(d.star?"★ ":"")+d.work;h.appendChild(w);
    var m=document.createElement("div");m.className="meta num";
    m.textContent=d.state+" ・ "+d.kind+" ・ "+d.ms+" ・ 見込み "+d.min+" 分 ・ 実際 "+(d.act||"—")+" 分"+(d.commit?" ・ コミット "+d.commit:"");
    panel.appendChild(h);panel.appendChild(m);
  }
  tags.forEach(function(t){t.addEventListener("click",function(){show(t)})});
  var first=document.querySelector(".tag.now")||tags[0];
  if(first)show(first);
})();
"""


def render_html(d):
    e = html.escape
    t = d["total"]
    today_md = (d["today"].month, d["today"].day)
    today_label = f'{d["today"].month}/{d["today"].day}'
    tasks = d["tasks"]
    pending = [x for x in tasks if x["state"] != "済み"]
    cur = next((x for x in tasks if x["state"] == "途中"), pending[0] if pending else None)
    nxt = next((x for x in pending if x is not cur), None)
    left = d["left_before"] + d["left_today"]
    left_min = sum(x["minutes"] for x in left)
    over = left_min > d["today_plan_min"]
    P = ['<!doctype html><html lang="ja"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         f"<title>現場の紙芝居 進み具合</title>{FONTS}<style>{CSS}</style></head><body><div class=\"wrap\">",
         f'<header class="top"><h1>現場の紙芝居　進み具合</h1><p>plan.md から自動で作成 ・ <span class="num" data-generated>{d["now"]:%Y-%m-%d %H:%M}</span>（日本時間）</p></header>']
    # いま
    P.append(f'<section class="now card{" over" if over else ""}"><div>')
    if cur:
        P.append(f'<div class="label">いま</div><h2><span class="id">{cur["id"]}</span>{e(cur["work"])}</h2>')
        if nxt:
            P.append(f'<p class="next">次: <b class="num">{nxt["id"]}</b> {e(nxt["work"])}</p>')
    else:
        P.append('<div class="label">いま</div><h2>全部のマスが済んだ</h2>')
    P.append(f'</div><div class="rest"><div class="label">今日の残り（{today_label}）</div><b>{left_min}<span>分</span></b></div></section>')
    # 数字 4 枚
    w = round(100 * t["done_min"] / t["min"]) if t["min"] else 0
    P.append('<section class="stats">'
             f'<div class="stat card"><span class="label">済んだマス／全部</span><b>{t["done"]}<span>/ {t["n"]}</span></b></div>'
             f'<div class="stat card"><span class="label">見積もりの分での進み</span><b>{pct(t["done_min"], t["min"])}</b><div class="bar"><i style="width:{w}%"></i></div></div>'
             f'<div class="stat card"><span class="label">実際の分</span><b>{t["actual"]}<span>分</span></b></div>'
             f'<div class="stat card{" over" if over else ""}"><span class="label">今日の残り</span><b>{len(left)}<span>マス</span> {left_min}<span>分</span></b></div></section>')
    # 軸
    P.append('<section class="sec"><h2>軸<small>何から何へ変えるか</small></h2><div class="axis">')
    for title, items in d["compass"]:
        P.append(f'<article class="ax card"><h3>{e(title)}</h3>' + "".join(f"<p>{e(i)}</p>" for i in items) + "</article>")
    P.append("</div></section>")
    # 目印の帯
    late = [m for m in d["ms"] if m["late"]]
    P.append(f'<section class="sec"><h2>目印<small class="num">{t["done_min"]} / {t["min"]} 分 ・ {"遅れている目印 " + str(len(late)) + " つ" if late else "遅れなし"}</small></h2><div class="band">')
    for m in d["ms"]:
        mw = round(100 * m["done_min"] / m["min"]) if m["min"] else 0
        cls = "seg card" + (" late" if m["late"] else " today" if day_key(m["day"]) == today_md else "") + (" full" if m["n"] and m["done"] == m["n"] else "")
        P.append(f'<div class="{cls}" title="{e(m["goal"])}"><b>{m["id"]}</b><small>{e(m["day"])}</small>'
                 f'<small class="num">{m["done"]}/{m["n"]} ・ {mw}%</small><div class="fill"><i style="width:{mw}%"></i></div></div>')
    P.append("</div></section>")
    # 日ごとの横棒
    P.append('<section class="sec"><h2>日ごとのマス<small>札の長さは見込みの分。押すと中身が出る</small></h2><ul class="legend">'
             + "".join(f'<li><i class="k-{k}" style="background:var(--kc)"></i>{lab}</li>' for k, lab, _ in KINDS)
             + '<li>薄い札＝済み</li><li>太い枠＝★ 遅れてはいけない筋</li></ul><div class="lanes card">')
    for day in d["days"]:
        ts = [x for x in tasks if x["day"] == day]
        is_today = day_key(day) == today_md
        P.append(f'<div class="lane{" today" if is_today else ""}"><div class="d"><b>{e(day)}</b><span class="num">{sum(x["state"] == "済み" for x in ts)}/{len(ts)}</span></div><div class="track">')
        for x in ts:
            k, lab = kind_of(x["work"])
            cls = f'tag k-{k} s-{x["state"]}' + (" star" if x["star"] else "") + (" now" if x is cur else "")
            act = "" if x["actual"] is None else str(x["actual"])
            P.append(f'<button type="button" class="{cls}" style="--w:{x["minutes"]}" aria-pressed="false" aria-label="{x["id"]} {e(x["work"])}" title="{x["id"]} {e(x["work"])}"'
                     f' data-id="{x["id"]}" data-work="{e(x["work"])}" data-state="{x["state"]}" data-kind="{lab}" data-ms="{x["milestone"]}"'
                     f' data-min="{x["minutes"]}" data-act="{act}" data-commit="{e(x["commit"])}"{" data-star=\"1\"" if x["star"] else ""}></button>')
        P.append("</div></div>")
    P.append('<div class="detail" id="detail" aria-live="polite"><span class="empty">札を押すと、ここにそのマスの中身が出ます</span></div></div></section>')
    # 日ごとの箱
    P.append('<section class="sec"><h2>日ごとの箱</h2><div class="days">')
    for day in d["days"]:
        ts = [x for x in tasks if x["day"] == day]
        is_today = day_key(day) == today_md
        P.append(f'<details class="day card{" today" if is_today else ""}"{" open" if is_today else ""}><summary><b>{e(day)}</b>'
                 f'<small class="num">{sum(x["state"] == "済み" for x in ts)}/{len(ts)} マス ・ 見込み {sum(x["minutes"] for x in ts)} 分 ・ 実際 {sum(x["actual"] or 0 for x in ts)} 分</small></summary>'
                 '<div class="tbl"><table><thead><tr><th>状態</th><th>ID</th><th>作業</th><th>種類</th><th>目印</th><th>見込み</th><th>実際</th><th>コミット</th></tr></thead><tbody>')
        for x in ts:
            k, lab = kind_of(x["work"])
            P.append(f'<tr class="s-{x["state"]}"><td><span class="st s-{x["state"]}">{x["state"]}</span></td>'
                     f'<td class="n">{"<span class=\"star-mark\">★</span> " if x["star"] else ""}{x["id"]}</td><td class="w">{e(x["work"])}</td>'
                     f'<td><span class="kd k-{k}"><i></i>{lab}</span></td><td class="n">{x["milestone"]}</td><td class="n">{x["minutes"]}</td>'
                     f'<td class="n">{x["actual"] if x["actual"] is not None else "—"}</td><td class="n">{e(x["commit"])}</td></tr>')
        P.append("</tbody></table></div></details>")
    P.append(f"</div></section></div><script>{SCRIPT}</script></body></html>")
    return "\n".join(P) + "\n"


def mask_generated(s):
    """作った時刻は毎回変わるので、ずれの検査では見ない"""
    return re.sub(r"(<span class=\"num\" data-generated>)[^<]*", r"\1", s)


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
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    d = build((DOCS / "compass.md").read_text(encoding="utf-8"), (DOCS / "plan.md").read_text(encoding="utf-8"), now.date())
    d["now"] = now
    outputs = {DOCS / "progress.md": render_md(d), DOCS / "dashboard.html": render_html(d)}
    if "--check" in argv:
        # Windows では git が改行を CRLF にすることがあるので、改行の違いは見ない
        stale = [p.name for p, s in outputs.items()
                 if not p.exists() or mask_generated(p.read_text(encoding="utf-8").replace("\r\n", "\n")) != mask_generated(s)]
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
