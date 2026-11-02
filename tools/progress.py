"""軸（docs/compass.md）と作業の表（docs/plan.md）から、進み具合を作る。

    python tools/progress.py          # docs/progress.md と docs/dashboard.html を作り直す
    python tools/progress.py --check  # 作り直した中身とファイルがずれていたら 1 で終わる
    python tools/progress.py --done 000 --start 09:30  # マス 000 を済みにし、実際の分を始めた時刻から今までで数える（日本時間。日付つき 2026-11-03T09:30 も可）
    python tools/progress.py --done 000 10  # 分を数で渡す。どちらも、前の「直近」をそのマスのコミットの番号に書き換えてから作り直す
    python tools/progress.py --done 000 --start 09:30 --commit 9c45f00  # 「直近」を使わず、自分のコミットの番号を書く（スレッドが並んで動くとき）

実際の分の欄の「35（目安）」は、3 本のスレッドが並んで動いた 11/2 の分で、決まりの数え方と合わない値（数え直さない）。

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
# 進路図の筋（plan.md の「筋」の列の値 → 図の名前と色の名前）。上から質を上げる 3 本、その下に 2 本
LANES = {"ピクト": ("文字 → ピクトグラム", "pict"), "安全網": ("安全網", "safe"), "直し": ("直しと人の確認", "fix"),
         "折りたたみ": ("折りたたみ（情報量を保つ）", "fold"), "土台": ("土台と見せ方", "base")}
START_LABEL = "11/2 12:30"  # 会期の始まり（最初のコミットの時刻の下限と同じ）
GOAL_LABEL = "11/8 20:00"  # 提出の締め切り


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
        elif len(c) == 12 and re.match(r"^\d{3}[ab]?$", c[0]):
            if c[9] not in STATES:
                raise SystemExit(f"plan.md: {c[0]} の状態「{c[9]}」は 済み・途中・まだ のどれでもない")
            if c[8] not in LANES:
                raise SystemExit(f"plan.md: {c[0]} の筋「{c[8]}」は {'・'.join(LANES)} のどれでもない")
            tasks.append({"id": c[0], "work": c[1], "done": c[2].replace("`", ""), "check": c[3].replace("`", ""), "milestone": c[4], "minutes": int(c[6]),
                          "star": c[7] == "★", "lane": c[8], "state": c[9],
                          "actual": int(re.match(r"\d+", c[10]).group()) if re.match(r"^\d+(（目安）)?$", c[10]) else None,
                          "approx": c[10].endswith("（目安）"),
                          "commit": c[11], "day": section_day})
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
             "actual": sum(t["actual"] or 0 for t in tasks),
             "approx": sum(t["approx"] for t in tasks)}
    return {"compass": compass, "ms": ms_rows, "tasks": tasks, "days": days, "today": today,
            "left_today": left_today, "left_before": left_before, "total": total,
            "today_plan_min": sum(t["minutes"] for t in tasks if day_key(t["day"]) == today_key)}


def act_label(x):
    """実際の分の表示。目安の値には印を付ける"""
    return "" if x["actual"] is None else f"{x['actual']}{'（目安）' if x['approx'] else ''}"


def approx_note(t):
    return f"（目安を含む: {t['approx']} マス）" if t["approx"] else ""


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
          f"全体: {t['done']} / {t['n']} マス、{t['done_min']} / {t['min']} 分（見込みの分で {pct(t['done_min'], t['min'])}）。実際の分の合計 {t['actual']} 分{approx_note(t)}", "",
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
                     f"{act_label(x)} | {x['commit']} |")
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
--paper:#0d0d0e;--card:#1b1b1d;--ink:#ececee;--muted:#9d9da3;--line:#2f2f33;--track:#2a2a2e;
--now:#f2b23c;--now-soft:#3a2d12;--done:#5cc08a;--done-soft:#1a3224;--late:#ff7d70;--late-soft:#3d1c18;
--k-build:#7ea6d8;--k-video:#73c0ad;--k-submit:#ab92d6;--k-people:#d0a764;--shadow:none;color-scheme:dark}}
:root[data-theme="dark"]{
--paper:#0d0d0e;--card:#1b1b1d;--ink:#ececee;--muted:#9d9da3;--line:#2f2f33;--track:#2a2a2e;
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
.theme{font:inherit;font-size:var(--t-xs);color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer}
.theme:hover{border-color:var(--muted)}.theme:focus-visible{outline:2px solid var(--now);outline-offset:2px}
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
.detail dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--s-1) var(--s-3);margin:var(--s-1) 0}
.detail dt{color:var(--muted);font-size:var(--t-xs);font-weight:700;padding-top:2px}
.detail dd{margin:0;line-height:1.6}
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
  function bind(sel,id,first){
    var panel=document.getElementById(id);
    var tags=document.querySelectorAll(sel);
    if(!panel||!tags.length)return;
    var pinned=null;
    function show(t,pin){
      if(pin){pinned=t;tags.forEach(function(x){x.setAttribute("aria-pressed",x===t?"true":"false")})}
      var d=t.dataset;
      panel.innerHTML="";
      var h=document.createElement("div");h.className="h";
      var b=document.createElement("b");b.textContent=d.id;h.appendChild(b);
      var w=document.createElement("span");w.textContent=(d.star?"★ ":"")+d.work;h.appendChild(w);
      var m=document.createElement("div");m.className="meta num";
      m.textContent=d.state+" ・ "+d.kind+" ・ "+d.ms+" ・ 見込み "+d.min+" 分 ・ 実際 "+(d.act||"—")+" 分"+(d.commit?" ・ コミット "+d.commit:"");
      var l=document.createElement("dl");
      [["完了の条件",d.done],["確かめ方",d.check]].forEach(function(r){
        if(!r[1])return;
        var dt=document.createElement("dt");dt.textContent=r[0];
        var dd=document.createElement("dd");dd.textContent=r[1];
        l.appendChild(dt);l.appendChild(dd);
      });
      panel.appendChild(h);panel.appendChild(l);panel.appendChild(m);
    }
    tags.forEach(function(t){
      t.addEventListener("click",function(){show(t,true)});
      t.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();show(t,true)}});
      t.addEventListener("mouseenter",function(){show(t,false)});
      t.addEventListener("mouseleave",function(){if(pinned)show(pinned,false)});
    });
    var f=document.querySelector(first)||tags[0];
    if(f)show(f,true);
  }
  var tb=document.getElementById("theme"),root=document.documentElement;
  function label(){tb.textContent=root.dataset.theme==="dark"?"明るくする":"暗くする"}
  if(tb){label();tb.addEventListener("click",function(){root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";try{localStorage.setItem("theme",root.dataset.theme)}catch(e){}label()})}
  bind(".tag","detail",".tag.now");
  bind(".bx","route-detail",".bx.now");
  var sc=document.querySelector(".route-scroll"),nw=document.querySelector(".bx.now");
  if(sc&&nw&&sc.scrollWidth>sc.clientWidth){var r=nw.getBoundingClientRect(),q=sc.getBoundingClientRect();sc.scrollLeft=Math.max(0,r.left-q.left-sc.clientWidth/2)}
})();
"""


def future_label(compass):
    """終点の先の箇条書きから「業界 3+・言葉 2」のような数を作る（・で区切った数。「など」があれば +）"""
    items = dict(compass).get("終点の先", [])
    parts = []
    for it in items:
        if ":" not in it:
            continue
        name, body = it.split(":", 1)
        seg = re.search(r"(?:から|始めて、)(.+)", body)
        text = seg.group(1) if seg else body
        n = text.count("・") + 1
        parts.append(f"{name.strip()} {n}{'+' if 'など' in text else ''}")
    return "・".join(parts)


def route_svg(d, cur):
    """始点から終点への進路図。縦が質、横が情報量。マスを筋の上に小さな箱で並べる"""
    e = html.escape
    W, H = 1000, 570
    O = (90, 500)  # 始点
    G = (800, 150)  # 終点
    dx, dy = G[0] - O[0], G[1] - O[1]
    L = (dx * dx + dy * dy) ** 0.5
    ux, uy = dx / L, dy / L  # 進む向き
    nx, ny = uy, -ux  # 左上へ向く法線
    offsets = {"pict": 112, "safe": 76, "fix": 40, "fold": -44, "base": -80}
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
    P = [f'<svg class="route-svg" viewBox="0 0 {W} {H}" role="img" aria-label="始点から終点への進路図">',
         '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
         '<path d="M0 0L10 5L0 10z" class="r-ink-fill"/></marker><marker id="ahb" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="22" markerHeight="22" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10z" class="r-ink-fill"/></marker>'
         '<marker id="ahm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
         '<path d="M0 0L10 5L0 10z" class="r-mut-fill"/></marker></defs>']
    # 軸
    P.append(f'<line x1="{O[0]}" y1="{O[1]}" x2="{O[0]}" y2="40" class="r-axis" marker-end="url(#ahm)"/>')
    P.append(f'<line x1="{O[0]}" y1="{O[1]}" x2="{G[0] + 70}" y2="{O[1]}" class="r-axis" marker-end="url(#ahm)"/>')
    P.append(f'<text x="{O[0] - 14}" y="52" class="r-axl" text-anchor="end">質</text>')
    P.append(f'<text x="{G[0] + 80}" y="{O[1] + 5}" class="r-axl">情報量</text>')
    P.append(f'<line x1="{G[0]}" y1="{O[1] - 6}" x2="{G[0]}" y2="{O[1] + 6}" class="r-tick"/>')
    P.append(f'<text x="{G[0]}" y="{O[1] + 28}" class="r-sm" text-anchor="middle">≈ 元の文</text>')
    P.append(f'<line x1="{G[0]}" y1="{G[1] + 16}" x2="{G[0]}" y2="{O[1] - 8}" class="r-guide"/>')
    # 終点の先
    fut = future_label(d["compass"])
    P.append(f'<line x1="{G[0] + 8}" y1="{G[1] - 14}" x2="{G[0] + 8}" y2="46" class="r-future" marker-end="url(#ahm)"/>')
    P.append(f'<text x="{G[0] + 20}" y="58" class="r-sm">質をもっと</text>')
    P.append(f'<line x1="{G[0] + 16}" y1="{G[1] + 4}" x2="{W - 30}" y2="{G[1] + 4}" class="r-future" marker-end="url(#ahm)"/>')
    P.append(f'<text x="{W - 30}" y="{G[1] - 26}" class="r-sm" text-anchor="end">ほかの場へ</text>')
    if fut:
        P.append(f'<text x="{W - 30}" y="{G[1] - 9}" class="r-xs" text-anchor="end">{e(fut)}</text>')
    # 筋と箱
    tasks = d["tasks"]
    for key, (label, cls) in LANES.items():
        off = offsets[cls]
        # 筋は軸の内側だけに引き、終点の手前で止める
        a0 = (O[0] + nx * off, O[1] + ny * off)
        t0 = max(30, (O[0] + 22 - a0[0]) / ux, (a0[1] - O[1] + 14) / -uy)
        t1 = min(L - 70, (G[0] + (40 if off < 0 else -8) - a0[0]) / ux, (a0[1] - 70) / -uy)
        a = (a0[0] + ux * t0, a0[1] + uy * t0)
        b = (a0[0] + ux * t1, a0[1] + uy * t1)
        P.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" class="r-lane l-{cls}"/>')
        ts = [x for x in tasks if x["lane"] == key]
        n = len(ts)
        seg = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        step = seg / max(n, 1)
        size = max(9, min(16, step * 0.72))
        for i, x in enumerate(ts):
            t = (i + 0.5) * step
            cx, cy = a[0] + ux * t, a[1] + uy * t
            h = size / 2
            k, kl = kind_of(x["work"])
            act = act_label(x)
            attrs = (f' data-id="{x["id"]}" data-work="{e(x["work"])}" data-state="{x["state"]}" data-kind="{e(label)}" data-ms="{x["milestone"]}"'
                     f' data-min="{x["minutes"]}" data-act="{act}" data-commit="{e(x["commit"])}" data-done="{e(x["done"])}" data-check="{e(x["check"])}"{" data-star=\"1\"" if x["star"] else ""}')
            P.append(f'<g class="bx pick l-{cls} s-{x["state"]}{" now" if x is cur else ""}" tabindex="0" role="button" aria-label="{x["id"]} {e(x["work"])}"{attrs}>'
                     f'<title>{x["id"]} {e(x["work"])}&#10;完了の条件: {e(x["done"])}</title>'
                     f'<rect x="{f(cx - h)}" y="{f(cy - h)}" width="{f(size)}" height="{f(size)}" rx="2.5"/>')
            if x["state"] == "済み":
                P.append(f'<path d="M{f(cx - h * 0.5)} {f(cy)}L{f(cx - h * 0.1)} {f(cy + h * 0.4)}L{f(cx + h * 0.55)} {f(cy - h * 0.45)}" class="r-check"/>')
            P.append("</g>")
            if x is cur:
                P.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(size * 0.95)}" class="r-now"/>')
                lx, ly = cx - nx * 0, cy - 26
                P.append(f'<g class="r-here"><line x1="{f(cx)}" y1="{f(cy - size)}" x2="{f(cx)}" y2="{f(ly + 6)}"/>'
                         f'<text x="{f(lx)}" y="{f(ly)}" text-anchor="middle">いまここ</text></g>')
    # 始点から終点への太い矢印（筋の上に重ねず、筋の間を通る）
    P.append(f'<line x1="{O[0] + 8}" y1="{O[1] - 8}" x2="{G[0] - 12}" y2="{G[1] + 10}" class="r-main" marker-end="url(#ahb)"/>')
    P.append(f'<circle cx="{O[0]}" cy="{O[1]}" r="9" class="r-pt"/><circle cx="{O[0]}" cy="{O[1]}" r="3.5" class="r-pt-in"/>')
    P.append(f'<circle cx="{G[0]}" cy="{G[1]}" r="9" class="r-pt"/><circle cx="{G[0]}" cy="{G[1]}" r="3.5" class="r-pt-in"/>')
    P.append(f'<text x="{O[0]}" y="{O[1] + 30}" class="r-lbl" text-anchor="middle">始点</text>'
             f'<text x="{O[0]}" y="{O[1] + 48}" class="r-xs num" text-anchor="middle">{START_LABEL}</text>')
    P.append(f'<text x="{G[0] + 16}" y="{G[1] + 34}" class="r-lbl">終点</text>'
             f'<text x="{G[0] + 16}" y="{G[1] + 52}" class="r-xs num">{GOAL_LABEL}</text>')
    P.append("</svg>")
    return "".join(P)


def route_section(d, cur):
    e = html.escape
    tasks = d["tasks"]
    P = ['<section class="sec route"><h2>進路図<small>始点から終点へ</small></h2><p class="route-lead">縦が質、横が情報量。箱が 1 つのマスで、塗られた箱が済み。終点の先の点線は、会期のあとに足すものと広げる先。箱に指を置くか押すと中身が出る。</p><div class="card route-card">',
         '<ul class="legend route-legend">'
         + "".join(f'<li><i class="l-{c}"></i>{e(lab)}</li>' for lab, c in LANES.values())
         + '<li><i class="lg-done"></i>済み</li><li><i class="lg-todo"></i>まだ</li></ul>',
         '<p class="route-hint">図は横に動かせます</p>',
         f'<div class="route-scroll">{route_svg(d, cur)}</div>',
         '<div class="detail" id="route-detail" aria-live="polite"><span class="empty">箱に指を置くか押すと、ここにそのマスの中身が出ます</span></div>',
         '<dl class="route-key"><div><dt>縦（質）</dt><dd>伝わるか。3 本の筋で上げる: 文字 → ピクトグラム・安全網・直しと人の確認。</dd></div>'
         '<div><dt>横（情報量）</dt><dd>元の文から、経路つきでカードに持ってこられた量。終点は「カード ≈ 元の文」。ピクトグラムにしても情報は減らず、折りたたんでいるだけで、部品を開けば元の条文に戻れる。これを進めるのが「折りたたみ」の筋。</dd></div></dl>',
         '<div class="lane-bars">']
    for key, (label, cls) in LANES.items():
        ts = [x for x in tasks if x["lane"] == key]
        done = sum(x["state"] == "済み" for x in ts)
        w = round(100 * done / len(ts)) if ts else 0
        P.append(f'<div class="lb"><span class="lb-name"><i class="l-{cls}"></i>{e(label)}</span><span class="num lb-n">{done} / {len(ts)}</span>'
                 f'<div class="lb-bar"><i class="l-{cls}" style="width:{w}%"></i></div></div>')
    P.append("</div></div></section>")
    return "".join(P)


ROUTE_CSS = """
:root{--l-pict:#3f6ea6;--l-safe:#2f8a80;--l-fix:#7657a3;--l-fold:#9c7432;--l-base:#837e76}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--l-pict:#7ea6d8;--l-safe:#6cc4b8;--l-fix:#ab92d6;--l-fold:#d0a764;--l-base:#a9a9af}}
:root[data-theme="dark"]{--l-pict:#7ea6d8;--l-safe:#6cc4b8;--l-fix:#ab92d6;--l-fold:#d0a764;--l-base:#a9a9af}
.l-pict{--lc:var(--l-pict)}.l-safe{--lc:var(--l-safe)}.l-fix{--lc:var(--l-fix)}.l-fold{--lc:var(--l-fold)}.l-base{--lc:var(--l-base)}
.route-lead{margin:calc(-1 * var(--s-2)) 0 0;font-size:var(--t-sm);color:var(--muted);max-width:60em}
.route-card{padding:var(--s-4);display:flex;flex-direction:column;gap:var(--s-3)}
.route-legend i{background:var(--lc)}
.route-legend .lg-done{background:var(--ink)}.route-legend .lg-todo{background:transparent;border:1.5px solid var(--ink)}
.route-scroll{overflow-x:auto}.route-hint{display:none;margin:0;font-size:var(--t-xs);color:var(--muted)}
.route-svg{display:block;width:100%;height:auto}
.route-svg text{font-family:var(--body);fill:var(--ink)}
.r-axis{stroke:var(--muted);stroke-width:2}.r-tick{stroke:var(--muted);stroke-width:2}
.r-guide{stroke:var(--line);stroke-width:1.5;stroke-dasharray:3 5}
.r-future{stroke:var(--muted);stroke-width:2;stroke-dasharray:6 6;fill:none}
.r-ink-fill{fill:var(--ink)}.r-mut-fill{fill:var(--muted)}
.r-axl{font-size:17px;font-weight:700}.r-lbl{font-size:16px;font-weight:700}.r-sm{font-size:14px}
.route-svg .r-xs{font-size:12px;fill:var(--muted)}
.r-main{stroke:var(--ink);stroke-width:7;stroke-linecap:round;opacity:.9}
.r-pt{fill:var(--card);stroke:var(--ink);stroke-width:3}.r-pt-in{fill:var(--ink)}
.r-lane{stroke:var(--lc);stroke-width:2;stroke-dasharray:2 5;opacity:.7}
.bx{cursor:pointer;outline:none}
.bx rect{fill:var(--card);stroke:var(--lc);stroke-width:2}
.bx.s-済み rect{fill:var(--lc)}
.bx.s-途中 rect{fill:var(--now-soft);stroke:var(--now)}
.bx[data-star] rect{stroke-width:3}
.r-check{fill:none;stroke:var(--card);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.bx[aria-pressed="true"] rect,.bx:focus-visible rect{stroke:var(--ink);stroke-width:3.5}
.r-now{fill:none;stroke:var(--now);stroke-width:3;pointer-events:none}
.r-here line{stroke:var(--now);stroke-width:2}.r-here text{font-size:13px;font-weight:700;fill:var(--now)}
.route-key{margin:0;display:grid;gap:var(--s-1);font-size:var(--t-sm)}
.route-key div{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:var(--s-2)}
.route-key dt{font-weight:700}.route-key dd{margin:0;color:var(--muted)}
.lane-bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--s-3)}
.lb{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s-1) var(--s-2);align-items:baseline;min-width:0}
.lb-name{font-size:var(--t-xs);display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-name i{flex:none;width:10px;height:10px;border-radius:2px;background:var(--lc)}
.lb-n{font-size:var(--t-xs);color:var(--muted)}
.lb-bar{grid-column:1/-1;height:4px;border-radius:2px;background:var(--track);overflow:hidden}
.lb-bar i{display:block;height:100%;background:var(--lc)}
@media (max-width:560px){.route-key div{grid-template-columns:1fr}.route-svg{min-width:720px}.route-hint{display:block}}
@media (prefers-reduced-motion:no-preference){.bx rect{transition:stroke-width .12s ease}}
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
    P = ['<!doctype html><html lang="ja" data-theme="dark"><head><meta charset="utf-8">',
         '<script>try{var m=localStorage.getItem("theme");if(m==="light"||m==="dark")document.documentElement.dataset.theme=m}catch(e){}</script>',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         f"<title>現場の紙芝居 進み具合</title>{FONTS}<style>{CSS}{ROUTE_CSS}</style></head><body><div class=\"wrap\">",
         f'<header class="top"><h1>現場の紙芝居　進み具合</h1><p>plan.md から自動で作成 ・ <span class="num" data-generated>{d["now"]:%Y-%m-%d %H:%M}</span>（日本時間）</p><button type="button" class="theme" id="theme" aria-label="明るい画面と暗い画面を切り替える">明るくする</button></header>']
    # いま
    P.append(f'<section class="now card{" over" if over else ""}"><div>')
    if cur:
        P.append(f'<div class="label">いま</div><h2><span class="id">{cur["id"]}</span>{e(cur["work"])}</h2>')
        if nxt:
            P.append(f'<p class="next">次: <b class="num">{nxt["id"]}</b> {e(nxt["work"])}</p>')
    else:
        P.append('<div class="label">いま</div><h2>全部のマスが済んだ</h2>')
    P.append(f'</div><div class="rest"><div class="label">今日の残り（{today_label}）</div><b>{left_min}<span>分</span></b></div></section>')
    P.append(route_section(d, cur))
    # 数字 4 枚
    w = round(100 * t["done_min"] / t["min"]) if t["min"] else 0
    P.append('<section class="stats">'
             f'<div class="stat card"><span class="label">済んだマス／全部</span><b>{t["done"]}<span>/ {t["n"]}</span></b></div>'
             f'<div class="stat card"><span class="label">見積もりの分での進み</span><b>{pct(t["done_min"], t["min"])}</b><div class="bar"><i style="width:{w}%"></i></div></div>'
             f'<div class="stat card"><span class="label">実際の分{approx_note(t)}</span><b>{t["actual"]}<span>分</span></b></div>'
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
    P.append('<section class="sec"><h2>日ごとのマス<small>札の長さは見込みの分。指を置くか押すと中身が出る</small></h2><ul class="legend">'
             + "".join(f'<li><i class="k-{k}" style="background:var(--kc)"></i>{lab}</li>' for k, lab, _ in KINDS)
             + '<li>薄い札＝済み</li><li>太い枠＝★ 遅れてはいけない筋</li></ul><div class="lanes card">')
    for day in d["days"]:
        ts = [x for x in tasks if x["day"] == day]
        is_today = day_key(day) == today_md
        P.append(f'<div class="lane{" today" if is_today else ""}"><div class="d"><b>{e(day)}</b><span class="num">{sum(x["state"] == "済み" for x in ts)}/{len(ts)}</span></div><div class="track">')
        for x in ts:
            k, lab = kind_of(x["work"])
            cls = f'tag k-{k} s-{x["state"]}' + (" star" if x["star"] else "") + (" now" if x is cur else "")
            act = act_label(x)
            P.append(f'<button type="button" class="{cls}" style="--w:{x["minutes"]}" aria-pressed="false" aria-label="{x["id"]} {e(x["work"])}" title="{x["id"]} {e(x["work"])}&#10;完了の条件: {e(x["done"])}"'
                     f' data-id="{x["id"]}" data-work="{e(x["work"])}" data-state="{x["state"]}" data-kind="{lab}" data-ms="{x["milestone"]}"'
                     f' data-min="{x["minutes"]}" data-act="{act}" data-commit="{e(x["commit"])}" data-done="{e(x["done"])}" data-check="{e(x["check"])}"{" data-star=\"1\"" if x["star"] else ""}></button>')
        P.append("</div></div>")
    P.append('<div class="detail" id="detail" aria-live="polite"><span class="empty">札に指を置くか押すと、ここにそのマスの中身が出ます</span></div></div></section>')
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
                     f'<td class="n">{act_label(x) or "—"}</td><td class="n">{e(x["commit"])}</td></tr>')
        P.append("</tbody></table></div></details>")
    P.append(f"</div></section></div><script>{SCRIPT}</script></body></html>")
    return "\n".join(P) + "\n"


def mask_generated(s):
    """作った時刻は毎回変わるので、ずれの検査では見ない"""
    return re.sub(r"(<span class=\"num\" data-generated>)[^<]*", r"\1", s)


def own_commit(task_id):
    """件名の頭がそのマスの番号とコロン（「037:」「002・002b:」）の、いちばん新しいコミット。「109 の直し:」のような続きは選ばない。
    HEAD をそのまま使うと、間に別のコミットが挟まったときに次のコミットの番号が入る（11/2 に 12 行ずれた）。
    当たるコミットが無ければ HEAD を使い、そのことを知らせる"""
    import subprocess
    log = subprocess.run(["git", "log", "--format=%h %s"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    for line in log.splitlines():
        h, _, subject = line.partition(" ")
        head = re.match(r"^(\d{3}[ab]?(?:・\d{3}[ab]?)*):", subject)
        if head and task_id in head.group(1).split("・"):
            return h
    h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    print(f"{task_id}: 件名の頭に「{task_id}:」のあるコミットが無いので、HEAD（{h}）を書いた。違えば plan.md を直す", file=sys.stderr)
    return h


def minutes_since(start, now):
    """始めた時刻（「09:30」なら今日、「2026-11-03T09:30」も可。日本時間）から now までの分。切り上げ"""
    jst = now.tzinfo
    if re.match(r"^\d{1,2}:\d{2}$", start):
        hh, mm = map(int, start.split(":"))
        t0 = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    else:
        t0 = datetime.datetime.fromisoformat(start)
        t0 = t0.replace(tzinfo=jst) if t0.tzinfo is None else t0
    if t0 > now:
        raise SystemExit(f"始めた時刻 {start} が今より後")
    return max(1, -(-int((now - t0).total_seconds()) // 60))


def check_commit(h):
    """渡されたコミットの番号が本当にあるか。短い番号にそろえて返す"""
    import subprocess
    r = subprocess.run(["git", "rev-parse", "--short", "--verify", "--quiet", f"{h}^{{commit}}"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"コミット {h} が無い")
    return r.stdout.strip()


def mark_done(task_id, minutes, commit=None):
    """plan.md の 1 行を済みにする。前に済ませたマスの「直近」は、そのマスの番号が件名の頭にあるコミットの番号に書き換える。
    commit を渡せば「直近」ではなくその番号を書く。スレッドが並んで動くときは、間に相手のコミットが挟まるのでこちらを使う"""
    path = DOCS / "plan.md"
    out, found = [], False
    for line in path.read_text(encoding="utf-8").split("\n"):
        c = cells(line) if line.startswith("|") else []
        if len(c) == 12 and re.match(r"^\d{3}[ab]?$", c[0]):
            if c[11] == "直近":
                c[11] = own_commit(c[0])
            if c[0] == task_id:
                c[9], c[10], c[11], found = "済み", str(minutes), commit or "直近", True
            line = "| " + " | ".join(c) + " |"
        out.append(line)
    if not found:
        raise SystemExit(f"plan.md に {task_id} が無い")
    path.write_text("\n".join(out), encoding="utf-8", newline="\n")


def main(argv):
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    if "--done" in argv:
        i = argv.index("--done")
        if "--start" in argv:
            minutes = minutes_since(argv[argv.index("--start") + 1], now)
        else:
            minutes = int(argv[i + 2])
        commit = check_commit(argv[argv.index("--commit") + 1]) if "--commit" in argv else None
        mark_done(argv[i + 1], minutes, commit)
        argv = [a for a in argv if a != "--check"]
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
