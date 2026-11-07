import { Fragment, type ReactNode, useEffect, useState } from "react";
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
import { ScoreScreen } from "./score/ScoreScreen";
import { RouteScreen } from "./route/RouteScreen";
import { SignScreen } from "./sign/SignScreen";
import { StudentScreen } from "./student/StudentScreen";
import { StatsBar } from "./stats/StatsBar";
import { PIN_LOST } from "./events";
import { ENTRY, NEWHIRE, PinGate, REVIEWERS, roleKey, STAFF, SUPERVISORS, TenantPin } from "./pin/TenantPin";
import { ScreenGuard } from "./Safe";
import { AnswerScreen } from "./trial/AnswerScreen";
import { ClocksScreen } from "./trial/ClocksScreen";
import { GradeScreen } from "./trial/GradeScreen";
import { MaterialSetup } from "./trial/MaterialSetup";
import { NewTrial } from "./trial/NewTrial";
import { ForecastScreen, PictureAnswerScreen } from "./trial/PicturesScreen";
import { SelfScreen } from "./trial/SelfScreen";
import { TimeScreen } from "./trial/TimeScreen";
import { TrialsScreen } from "./trial/TrialsScreen";

/** 役割のしるし（テナント.役割.番号.…）から役割を読む。しるしが無ければ null */
export function myRole(tenant: string): string | null {
  try {
    return sessionStorage.getItem(roleKey(tenant))?.split(".")[1] ?? null;
  } catch {
    return null;
  }
}

function BackBar({ tenant, over }: { tenant: string; over: boolean }) {
  const student = myRole(tenant) === "newhire";
  // 見る側（11/7）は、署名済みのカードを見る画面に戻る
  const to = `#/t/${encodeURIComponent(tenant)}/${student ? "read" : "home"}`;
  return (
    <nav className={over ? "back-bar over" : "back-bar"} data-testid="back-bar">
      <a href={to} data-testid="back-home">
        {student ? "← カードを みる" : "← ホーム"}
      </a>
    </nav>
  );
}

/** 画面ごとに、PIN の画面で選べる役割 */
function rolesFor(r: string[]) {
  if (r[2] === "read" || r[2] === "student") return NEWHIRE;
  if (r[2] === "sign") return SUPERVISORS;
  if (r[2] === "issue") return REVIEWERS;
  if (r[2] === "home" || (r[2] === "trial" && (r[4] === "self" || r[4] === "pictures"))) return ENTRY;
  return STAFF;
}

/**
 * 入ったしるしが切れた・無いときの救い（総点検の直し）。どの画面でも、API が「PIN で入ってください」「役割で入ってください」を
 * 返したら（events.ts の pinLost）、その場で PIN の画面に戻し、入り直したら今の画面を最初から読み直す。
 * 新しいタブでの直リンクや、期限切れのあとに赤字で止まる行き止まりを無くす
 */
function PinRescue({ tenant, roles, children }: { tenant: string | null; roles: readonly { value: string; label: string }[]; children: ReactNode }) {
  const [lost, setLost] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    setLost(false);
    if (!tenant) return;
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === tenant) setLost(true);
    };
    addEventListener(PIN_LOST, on);
    return () => removeEventListener(PIN_LOST, on);
  }, [tenant]);
  if (lost && tenant)
    return (
      <TenantPin
        tenant={tenant}
        roles={roles}
        onDone={() => {
          setLost(false);
          setN((x) => x + 1);
        }}
      />
    );
  return <Fragment key={n}>{children}</Fragment>;
}

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
    // 新入社員が受ける画面（① と絵のテスト）は、新入社員も選べる（11/6）
    body = <PinGate tenant={tenant} roles={r[4] === "self" || r[4] === "pictures" ? ENTRY : undefined}>{body}</PinGate>;
  }
  // #/t/<テナント>/audit/<カード> ・ 監査の記録（監修者・教育担当）
  if (r[0] === "t" && r[2] === "audit" && r[3]) body = <AuditScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/card/<カード> ・ カードの画面（作る側・監修者。状態の帯つき）
  if (r[0] === "t" && r[2] === "card" && r[3]) body = <CardScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/route/<カード> ・ 経路の画面（監修者。部品 → 文 → 元の文）
  if (r[0] === "t" && r[2] === "route" && r[3]) body = <RouteScreen tenant={r[1]} cardId={r[3]} />;
  // #/t/<テナント>/fix/<カード> ・ 枠と指示（監修者。直したい部分を枠で囲んで送る）
  if (r[0] === "t" && r[2] === "fix" && r[3]) body = <FixScreen tenant={r[1]} cardId={r[3]} initial={r[4] === "words" || r[4] === "touch" || r[4] === "ask" ? r[4] : undefined} />;
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
  // #/t/<テナント>/student ・ 新入社員だけが見る画面（11/6 作者。ID と PIN で入る）
  if (r[0] === "t" && r[2] === "student") body = <StudentScreen tenant={r[1]} />;
  // #/t/<テナント>/trials ・ 試しの回の一覧（11/6。ホームから押してたどり着く）
  if (r[0] === "t" && r[2] === "trials") body = <TrialsScreen tenant={r[1]} />;
  // #/t/<テナント>/score(/author|/supervisor) ・ 試しの答えの 10 段階の採点（11/7 作者。左に作者・右に監修者のタブ）
  if (r[0] === "t" && r[2] === "score") body = <ScoreScreen tenant={r[1]} grader={r[3] === "author" || r[3] === "supervisor" ? r[3] : undefined} />;
  // #/picto/poses ・ 開発用の姿勢の一覧（どの画面からもリンクしない。姿勢の試験 e2e/poses.spec.ts が開く）
  if (r[0] === "picto" && r[1] === "poses") body = <PoseGallery />;
  // 作る側の画面の上には、いつも出しておく数字（048）。新入社員の閲覧と、試しの回の画面には出さない
  const maker = r[0] === "t" && ["card", "route", "fix", "fold", "make", "audit", "sign", "pose", "queue"].includes(r[2]);
  // 戻る帯（11/6 作者「ホームに戻るとか、ボタンを押していって、そこにたどり着く経路」）。ホームと新入社員の画面には出さない。
  // 新入社員が受けている途中（① と絵のテスト・② の答え）にも出さない（終わりの画面に戻るボタンを置く）
  // 見る側の人が署名済みのカードを見ている画面（read）にも出さない（そこが見る側のホーム。11/7）
  const viewerHome = r[2] === "read" && r[0] === "t" && myRole(r[1]) === "newhire";
  const back = r[0] === "t" && !!r[2] && !["home", "student"].includes(r[2]) && !viewerHome && !(r[2] === "trial" && ["self", "pictures", "answer"].includes(r[4]));
  // 画面を切り替えると、紙芝居の絵を抜くように今の画面が動く（076a）。同じ画面の中の段やカードは、それぞれの画面が動かす
  return (
    <main data-testid="app">
      {back && <BackBar tenant={r[1]} over={maker} />}
      {maker && <StatsBar tenant={r[1]} />}
      <Slide k={r.slice(0, 4).join("/")}>
        {/* 画面の中で投げられても白くしない（描けない古いカードなど）。画面を変えると守りも新しくなる */}
        <ScreenGuard key={r.slice(0, 4).join("/")} home={r[0] === "t" ? `#/t/${encodeURIComponent(r[1])}/home` : "#/"}>
          <PinRescue tenant={r[0] === "t" ? r[1] : null} roles={rolesFor(r)}>
            {body}
          </PinRescue>
        </ScreenGuard>
      </Slide>
    </main>
  );
}
