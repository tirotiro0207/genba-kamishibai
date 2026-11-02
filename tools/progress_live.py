"""進み具合の画面を、作業の表が変わるたびに作り直して見せる手元のサーバー。

    python tools/progress_live.py          # http://127.0.0.1:5180/ で開く
    python tools/progress_live.py 5181     # 番号を変えるとき

ファイルには書かない（docs/dashboard.html はそのまま）。開くたびに plan.md と compass.md から作り、
画面は 3 秒ごとに表の更新の印を尋ねて、変わっていたら読み直す。標準ライブラリだけで動く。
"""
import datetime
import html
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import progress

WATCH = [progress.DOCS / "plan.md", progress.DOCS / "compass.md"]
JST = datetime.timezone(datetime.timedelta(hours=9))

# 表の更新の印が変わったら、スクロールの位置と押したマスを残して読み直す
RELOAD = """<script>
(function(){
  var stamp=null;
  try{var s=JSON.parse(sessionStorage.getItem("live")||"null");if(s){window.scrollTo(0,s.y);var t=s.id&&document.querySelector('.tag[data-id="'+s.id+'"]');if(t)t.click()}}catch(e){}
  function tick(){
    fetch("/stamp",{cache:"no-store"}).then(function(r){return r.text()}).then(function(v){
      if(stamp===null){stamp=v;return}
      if(v!==stamp){
        var p=document.querySelector('.tag[aria-pressed="true"]');
        try{sessionStorage.setItem("live",JSON.stringify({y:window.scrollY,id:p?p.dataset.id:null}))}catch(e){}
        location.reload();
      }
    }).catch(function(){});
  }
  tick();setInterval(tick,3000);
})();
</script>"""


def stamp():
    # 日付も入れる。日が変わると「今日」の印が動くため
    now = datetime.datetime.now(JST)
    return f"{now:%Y-%m-%d}|" + "|".join(str(p.stat().st_mtime_ns) for p in WATCH)


def page():
    now = datetime.datetime.now(JST)
    try:
        d = progress.build(WATCH[1].read_text(encoding="utf-8"), WATCH[0].read_text(encoding="utf-8"), now.date())
        d["now"] = now
        body = progress.render_html(d)
    except BaseException as ex:  # 表を書きかけのときは止まらずに知らせ、直るのを待つ
        body = f'<!doctype html><meta charset="utf-8"><p style="font:16px sans-serif;padding:16px">表を読めませんでした（書きかけかもしれません）: {html.escape(str(ex))}</p>'
    return body.replace("</body>", RELOAD + "</body>")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/stamp"):
            out, kind = stamp(), "text/plain"
        elif self.path in ("/", "/index.html"):
            out, kind = page(), "text/html"
        else:
            self.send_error(404)
            return
        b = out.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
    print(f"進み具合: http://127.0.0.1:{port}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
