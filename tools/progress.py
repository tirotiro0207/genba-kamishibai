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
                        "min": sum(t["minutes"] for t in ts), "done_min": sum(t["minutes"] for t in done)})
    today_key = (today.month, today.day)
    left_today = [t for t in tasks if t["state"] != "済み" and day_key(t["day"]) == today_key]
    left_before = [t for t in tasks if t["state"] != "済み" and day_key(t["day"]) < today_key]
    total = {"n": len(tasks), "done": sum(t["state"] == "済み" for t in tasks),
             "min": sum(t["minutes"] for t in tasks),
             "done_min": sum(t["minutes"] for t in tasks if t["state"] == "済み"),
             "actual": sum(t["actual"] or 0 for t in tasks)}
    return {"compass": compass, "ms": ms_rows, "tasks": tasks, "days": days, "today": today,
            "left_today": left_today, "left_before": left_before, "total": total}


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


CSS = """
:root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#6b6a66;--line:#e2e0da;--card:#ffffff;
--done:#2f7d4f;--done-bg:#e3f1e7;--doing:#a86a00;--doing-bg:#fbefd6;--todo:#8a8983;--todo-bg:#f0efeb;--star:#c0392b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161615;--fg:#ecebe6;--mut:#a3a29c;--line:#2d2c2a;--card:#1f1f1d;
--done:#6fc28f;--done-bg:#1d3326;--doing:#e0a845;--doing-bg:#3a2d14;--todo:#8a8983;--todo-bg:#262624;--star:#ff7a6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px}
.mut{color:var(--mut);font-size:13px}.axis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card b{display:block;margin-bottom:4px}
.card p{margin:0;font-size:13px;color:var(--mut)}.bar{height:8px;background:var(--todo-bg);border-radius:4px;overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;background:var(--done)}.ms{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.ms .n{font-variant-numeric:tabular-nums;font-size:13px}.day{margin-top:20px}.day h3{font-size:15px;margin:0 0 8px}
.tasks{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.t{border-radius:8px;padding:8px 10px;border:1px solid var(--line);background:var(--todo-bg);font-size:13px}
.t.s-済み{background:var(--done-bg);border-color:var(--done)}.t.s-途中{background:var(--doing-bg);border-color:var(--doing)}
.t.star{border-width:2px}.t .h{display:flex;gap:6px;align-items:baseline}.t .id{font-weight:700;font-variant-numeric:tabular-nums}
.t .st{margin-left:auto;font-size:12px}.s-済み .st{color:var(--done)}.s-途中 .st{color:var(--doing)}.s-まだ .st{color:var(--todo)}
.t .sm{color:var(--star);font-weight:700}.t .m{color:var(--mut);font-size:12px;font-variant-numeric:tabular-nums}
ul.left{padding-left:18px}.legend span{margin-right:12px}
"""


def render_html(d):
    e = html.escape
    t = d["total"]
    P = ['<!doctype html><html lang="ja"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         f"<title>進み具合</title><style>{CSS}</style></head><body><main>",
         "<h1>進み具合</h1>",
         f'<p class="mut">tools/progress.py が plan.md と compass.md から作る（手で書かない）。作った日: {d["today"]:%Y-%m-%d}（日本時間）</p>',
         "<h2>軸</h2><div class=\"axis\">"]
    for title, items in d["compass"]:
        P.append(f'<div class="card"><b>{e(title)}</b>' + "".join(f"<p>{e(i)}</p>" for i in items) + "</div>")
    P.append("</div><h2>目印ごとの進み具合</h2>")
    P.append(f'<p class="mut">全体: {t["done"]} / {t["n"]} マス、{t["done_min"]} / {t["min"]} 分（{pct(t["done_min"], t["min"])}）。実際の分の合計 {t["actual"]} 分</p><div class="ms">')
    for m in d["ms"]:
        w = round(100 * m["done_min"] / m["min"]) if m["min"] else 0
        P.append(f'<div class="card"><b>{m["id"]}　{e(m["day"])}</b><div class="n">{m["done"]} / {m["n"]} マス　{m["done_min"]} / {m["min"]} 分</div>'
                 f'<div class="bar"><i style="width:{w}%"></i></div></div>')
    P.append('</div><h2>日ごとの全マス</h2><p class="mut legend"><span>■ 済み（緑）</span><span>■ 途中（黄）</span><span>■ まだ（灰）</span><span style="color:var(--star)">★ 一番遅れてはいけない筋</span></p>')
    for day in d["days"]:
        ts = [x for x in d["tasks"] if x["day"] == day]
        P.append(f'<section class="day"><h3>{e(day)}（{sum(x["state"] == "済み" for x in ts)} / {len(ts)} マス）</h3><div class="tasks">')
        for x in ts:
            star = '<span class="sm">★</span>' if x["star"] else ""
            act = x["actual"] if x["actual"] is not None else "—"
            com = f" ・ {e(x['commit'])}" if x["commit"] else ""
            P.append(f'<div class="t s-{x["state"]}{" star" if x["star"] else ""}"><div class="h">{star}<span class="id">{x["id"]}</span>'
                     f'<span class="st">{x["state"]}</span></div><div>{e(x["work"])}</div>'
                     f'<div class="m">見込み {x["minutes"]} 分 ・ 実際 {act} 分 ・ {x["milestone"]}{com}</div></div>')
        P.append("</div></section>")
    P.append(f'<h2>今日の残り（{d["today"].month}/{d["today"].day}）</h2>')
    if d["left_before"]:
        P.append(f'<p>前の日から残っているもの: {len(d["left_before"])} マス、{sum(x["minutes"] for x in d["left_before"])} 分</p><ul class="left">')
        P += [f'<li>{"★ " if x["star"] else ""}{x["id"]} {e(x["work"])}（{e(x["day"])}・{x["minutes"]} 分）</li>' for x in d["left_before"]]
        P.append("</ul>")
    P.append(f'<p>今日のもの: {len(d["left_today"])} マス、{sum(x["minutes"] for x in d["left_today"])} 分</p><ul class="left">')
    P += [f'<li>{"★ " if x["star"] else ""}{x["id"]} {e(x["work"])}（{x["state"]}・{x["minutes"]} 分）</li>' for x in d["left_today"]]
    P.append("</ul></main></body></html>")
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
