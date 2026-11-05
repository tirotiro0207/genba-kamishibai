import { useEffect, useState } from "react";
import "./app.css";
import { AuditScreen } from "./audit/AuditScreen";
import { CardScreen } from "./card/CardScreen";
import { DemoScreen } from "./demo/DemoScreen";
import { TryScreen } from "./demo/TryScreen";
import { FixScreen } from "./fix/FixScreen";
import { FoldScreen } from "./fold/FoldScreen";
import { NewCardChat } from "./chat/NewCardChat";
import { HomeScreen } from "./home/HomeScreen";
import { IssueScreen } from "./issue/IssueScreen";
import { LoginScreen } from "./login/LoginScreen";
import { MakeScreen } from "./make/MakeScreen";
import { Slide } from "./motion/Slide";
import { PoseGallery } from "./picto/PoseGallery";
import { PoseScreen } from "./pose/PoseScreen";
import { QueueScreen } from "./queue/QueueScreen";
import { ReadScreen } from "./read/ReadScreen";
import { RouteScreen } from "./route/RouteScreen";
import { SignScreen } from "./sign/SignScreen";
import { StatsBar } from "./stats/StatsBar";
import { PinGate } from "./pin/TenantPin";
import { AnswerScreen } from "./trial/AnswerScreen";
import { ClocksScreen } from "./trial/ClocksScreen";
import { GradeScreen } from "./trial/GradeScreen";
import { MaterialSetup } from "./trial/MaterialSetup";
import { NewTrial } from "./trial/NewTrial";
import { ForecastScreen, PictureAnswerScreen } from "./trial/PicturesScreen";
import { SelfScreen } from "./trial/SelfScreen";
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
  // 何も無い URL は入口の画面（11/5 作者）。@ のあとに会社の名前を入れて進むか、ゲストで始める（#/demo）
  let body = r[0] === "" || r[0] === "login" ? <LoginScreen /> : <DemoScreen />;
  // #/demo は、公開デモの入口（093b。架空の会社だけ）
  // #/demo/time ・ #/demo/picture ・ 見る人が答える公開デモ（094）
  if (r[0] === "demo" && (r[1] === "time" || r[1] === "picture")) body = <TryScreen mode={r[1]} />;
  // #/t/<テナント>/trial/new ・ #/t/<テナント>/trial/<回>/time ・ #/t/<テナント>/trial/<回>/answer/<参加者> ・ #/t/<テナント>/trial/<回>/grade/<g1|g2>
  if (r[0] === "t" && r[2] === "trial") {
    const tenant = r[1];
    if (r[3] === "new") body = <NewTrial tenant={tenant} />;
    else if (r[4] === "time") body = <TimeScreen tenant={tenant} id={r[3]} />;
    // #/t/<テナント>/trial/<回>/clocks ・ 時計 2 つ（095）。回が sample なら作りものの数
    else if (r[4] === "clocks") body = <ClocksScreen tenant={tenant} id={r[3]} />;
    // #/t/<テナント>/trial/<回>/forecast ・ #/t/<テナント>/trial/<回>/pictures/<参加者> ・ 絵だけの 8 枚と教育担当の勘（059）
    else if (r[4] === "forecast") body = <ForecastScreen tenant={tenant} id={r[3]} />;
    else if (r[4] === "pictures" && r[5]) body = <PictureAnswerScreen tenant={tenant} id={r[3]} participant={r[5]} />;
    // #/t/<テナント>/trial/<回>/material ・ #/t/<テナント>/trial/<回>/self/<参加者> ・ ① の交差の回（11/5）
    else if (r[4] === "material") body = <MaterialSetup tenant={tenant} id={r[3]} />;
    else if (r[4] === "self" && r[5]) body = <SelfScreen tenant={tenant} id={r[3]} participant={r[5]} />;
    else if (r[4] === "answer" && r[5]) body = <AnswerScreen tenant={tenant} id={r[3]} participant={r[5]} />;
    else if (r[4] === "grade" && (r[5] === "g1" || r[5] === "g2")) body = <GradeScreen tenant={tenant} id={r[3]} grader={r[5]} />;
    // 会社のテナントでは、記録アプリも 2 段の PIN で入ってから開く（総点検の 2・3）。回答の記録の口は新入社員の役割では開かないので、作者・監修者・教育担当から選ぶ
    body = <PinGate tenant={tenant}>{body}</PinGate>;
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
  // #/t/<テナント>/pose/<カード> ・ 絵の部品を 1 つずつ動かす（監修者）
  if (r[0] === "t" && r[2] === "pose" && r[3]) body = <PoseScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/sign/<カード> ・ 署名の入力（監修者。指か電子印鑑）
  if (r[0] === "t" && r[2] === "sign" && r[3]) body = <SignScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/read ・ 新入社員の閲覧（署名済みだけ）
  if (r[0] === "t" && r[2] === "read") body = <ReadScreen tenant={r[1]} />;
  // #/t/<テナント>/issue ・ 発行の画面（監修者・教育担当。署名済みの一覧・止める・見た人・回収の知らせ・週の抜き取り）
  if (r[0] === "t" && r[2] === "issue") body = <IssueScreen tenant={r[1]} />;
  // #/t/<テナント>/home ・ ホーム（11/5。作る側が入って最初に来る。カードの管理とキャラクターの管理）
  if (r[0] === "t" && r[2] === "home") body = <HomeScreen tenant={r[1]} />;
  // #/t/<テナント>/new(/<チャット>) ・ 新しいカードを作るチャット（資料の添付と言葉の指示）
  if (r[0] === "t" && r[2] === "new") body = <NewCardChat tenant={r[1]} chatId={r[3]} />;
  // #/t/<テナント>/make ・ 入れる（032）→ 抜き出し（033）
  if (r[0] === "t" && r[2] === "make") body = <MakeScreen tenant={r[1]} />;
  // #/t/<テナント>/queue ・ 確認待ちの列（赤から先）と仕分けの一覧の入れ替え（061）
  if (r[0] === "t" && r[2] === "queue") body = <QueueScreen tenant={r[1]} />;
  if (r[0] === "picto" && r[1] === "poses") body = <PoseGallery />;
  // 作る側の画面の上には、いつも出しておく数字（048）。新入社員の閲覧と、試しの回の画面には出さない
  const maker = r[0] === "t" && ["card", "route", "fix", "fold", "make", "audit", "sign", "pose", "queue"].includes(r[2]);
  // 画面を切り替えると、紙芝居の絵を抜くように今の画面が動く（076a）。同じ画面の中の段やカードは、それぞれの画面が動かす
  return (
    <main data-testid="app">
      {maker && <StatsBar tenant={r[1]} />}
      <Slide k={r.slice(0, 4).join("/")}>{body}</Slide>
    </main>
  );
}
