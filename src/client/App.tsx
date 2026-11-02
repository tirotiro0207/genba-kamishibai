import { useEffect, useState } from "react";
import "./app.css";
import { AuditScreen } from "./audit/AuditScreen";
import { CardScreen } from "./card/CardScreen";
import { FixScreen } from "./fix/FixScreen";
import { FoldScreen } from "./fold/FoldScreen";
import { MakeScreen } from "./make/MakeScreen";
import { Slide } from "./motion/Slide";
import { PoseGallery } from "./picto/PoseGallery";
import { ReadScreen } from "./read/ReadScreen";
import { RouteScreen } from "./route/RouteScreen";
import { AnswerScreen } from "./trial/AnswerScreen";
import { GradeScreen } from "./trial/GradeScreen";
import { NewTrial } from "./trial/NewTrial";
import { TimeScreen } from "./trial/TimeScreen";

function useRoute() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const on = () => setH(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
}

export function App() {
  const r = useRoute();
  let body = <p>現場の紙芝居</p>;
  // #/t/<テナント>/trial/new ・ #/t/<テナント>/trial/<回>/time ・ #/t/<テナント>/trial/<回>/answer/<参加者> ・ #/t/<テナント>/trial/<回>/grade/<g1|g2>
  if (r[0] === "t" && r[2] === "trial") {
    const tenant = r[1];
    if (r[3] === "new") body = <NewTrial tenant={tenant} />;
    else if (r[4] === "time") body = <TimeScreen tenant={tenant} id={r[3]} />;
    else if (r[4] === "answer" && r[5]) body = <AnswerScreen tenant={tenant} id={r[3]} participant={r[5]} />;
    else if (r[4] === "grade" && (r[5] === "g1" || r[5] === "g2")) body = <GradeScreen tenant={tenant} id={r[3]} grader={r[5]} />;
  }
  // #/t/<テナント>/audit/<カード> ・ 監査の記録（監修者・教育担当）
  if (r[0] === "t" && r[2] === "audit" && r[3]) body = <AuditScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/card/<カード> ・ カードの画面（作る側・監修者。状態の帯つき）
  if (r[0] === "t" && r[2] === "card" && r[3]) body = <CardScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/route/<カード> ・ 経路の画面（監修者。部品 → 文 → 元の文）
  if (r[0] === "t" && r[2] === "route" && r[3]) body = <RouteScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/fix/<カード> ・ 枠と指示（監修者。直したい部分を枠で囲んで送る）
  if (r[0] === "t" && r[2] === "fix" && r[3]) body = <FixScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/fold/<カード> ・ 折りたたみ（元のページが積み重なり、1 枚・0 字にたたまれる）
  if (r[0] === "t" && r[2] === "fold" && r[3]) body = <FoldScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/read ・ 新入社員の閲覧（署名済みだけ）
  if (r[0] === "t" && r[2] === "read") body = <ReadScreen tenant={r[1]} />;
  // #/t/<テナント>/make ・ 入れる（032）→ 抜き出し（033）
  if (r[0] === "t" && r[2] === "make") body = <MakeScreen tenant={r[1]} />;
  if (r[0] === "picto" && r[1] === "poses") body = <PoseGallery />;
  // 画面を切り替えると、紙芝居の絵を抜くように今の画面が動く（076a）。同じ画面の中の段やカードは、それぞれの画面が動かす
  return (
    <main data-testid="app">
      <Slide k={r.slice(0, 4).join("/")}>{body}</Slide>
    </main>
  );
}
