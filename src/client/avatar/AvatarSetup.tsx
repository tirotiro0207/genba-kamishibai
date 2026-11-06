// キャラクターを作る画面（11/5 作者）。まだ自分のキャラクターを持っていない人が、発行の管理に入る前に 1 回だけ通る。
// 上の切り替え（デフォルト・カスタム）を 1 枚のカードで包み、初めはデフォルト。デフォルトはキャラクターを真ん中に出し、その下の「このキャラクターで進める」で決める。
// カスタムにすると、キャラクターが左へ寄り、右に部品のタブ（髪・輪郭・目・まつげ・眉・眼鏡・ひげ・肌）が出る。
// タブの中は部品の一覧で、押すと選べる。大きさのある部品（目・輪郭）は、一覧の下に「小 ━━ 大」のつまみを出す。髪には大きさを付けない。
// 輪郭の大きさは、人形の部品（avatar.ts）の FACE_OPTIONS に faceSize があるときだけ出る。口は選ばない（表情とあいうえおで描く側が決める。11/5 作者）
import { useMemo, useState } from "react";
import { FACE_OPTIONS, type FaceParts } from "../../shared/picto/avatar";
import { characterSvg, type Hair } from "../../shared/picto/character";
import { STANDING } from "../../shared/picto/skeleton";
import { type Avatar, DEFAULT_AVATAR, HAIRS, saveAvatar } from "./store";
import "./avatar.css";

const HAIR_LABEL: Record<string, string> = {
  bob: "おかっぱ", short: "ショート", bun: "おだんご", long: "ロング", ponytail: "ポニーテール", buzz: "坊主", sidePart: "七三",
  curly: "くせ毛", twoBlock: "ツーブロック", mash: "マッシュ", centerPart: "センター分け", slickBack: "オールバック", shortBob: "ショートボブ",
  braids: "三つ編み", twinTails: "ツインテール", skinhead: "スキンヘッド", softMohawk: "ソフトモヒカン", wolf: "ウルフ", halfUp: "ハーフアップ",
};
const LABEL: Record<string, string> = {
  standard: "ふつう", round: "まる", slim: "ほそ", square: "しかく",
  oval: "たまご", slit: "糸目", up: "つり目", down: "たれ目",
  none: "なし", flick: "1 本", three: "3 本",
  flat: "まっすぐ", arch: "アーチ", angled: "つり眉",
  white: "白", light: "うす灰", mustache: "口ひげ",
};
const labelOf = (key: string, v: string) => (key === "glasses" ? { none: "なし", round: "まる", square: "しかく" }[v] : LABEL[v]) ?? v;

const OPTS = FACE_OPTIONS as unknown as Record<string, readonly string[]>;
interface Tab {
  key: "hair" | keyof FaceParts;
  label: string;
  /** 大きさのつまみ（FaceParts の欄。値は小さい順） */
  size?: string;
}
const TABS: Tab[] = (
  [
    { key: "hair", label: "髪" },
    { key: "face", label: "輪郭", size: "faceSize" },
    { key: "eyeShape", label: "目", size: "eyeSize" },
    { key: "lashes", label: "まつげ" },
    { key: "brows", label: "眉" },
    { key: "glasses", label: "眼鏡" },
    { key: "beard", label: "ひげ" },
    { key: "skin", label: "肌" },
  ] as Tab[]
).map((t) => (t.size && !OPTS[t.size] ? { ...t, size: undefined } : t));

/**
 * 全身の枠（背の高さ 434 で描く）。髪 19 × 輪郭 4 × 大きさ 3 の全部を測った外接の箱（x −95〜96・y −45〜434。scratch/body-bbox.ts）に、
 * 線の太さの分の余白を足した。初めは上を −20 にしていて、くせ毛・ソフトモヒカン・おだんごの頭が切れた（11/5 作者）
 */
const BODY_VIEW = "-110 -58 220 506";
/** 部品の一覧の小さな絵（胸から上）。上は全身と同じく一番高い髪まで入れる */
const HEAD_VIEW = "-82 -54 164 164";

const draw = (a: Avatar) =>
  characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: "right", view: "front", role: "new", headwear: "none", hair: a.hair, face: a.face });

function Figure({ a, view, className }: { a: Avatar; view: string; className?: string }) {
  const svg = useMemo(() => draw(a), [a]);
  return <svg className={className} viewBox={view} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * edit はホームの「キャラクターの管理」から開くとき。今のキャラクターから始め、決めるボタンは「保存する」。
 * 今のキャラクターがデフォルトと同じならデフォルト、違えばカスタムの側で開く
 */
export function AvatarSetup({ tenant, role, onDone, initial, edit = false }: { tenant: string; role: string; onDone: (a: Avatar) => void; initial?: Avatar; edit?: boolean }) {
  const same = !initial || JSON.stringify(initial) === JSON.stringify(DEFAULT_AVATAR);
  const [mode, setMode] = useState<"default" | "custom">(same ? "default" : "custom");
  const [custom, setCustom] = useState<Avatar>(initial ?? DEFAULT_AVATAR);
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const shown = mode === "default" ? DEFAULT_AVATAR : custom;

  const choices = tab.key === "hair" ? HAIRS : OPTS[tab.key];
  const current = tab.key === "hair" ? custom.hair : (custom.face as unknown as Record<string, string>)[tab.key];
  const set = (v: string) =>
    setCustom((c) => (tab.key === "hair" ? { ...c, hair: v as Hair } : { ...c, face: { ...c.face, [tab.key]: v } as FaceParts }));
  const sizes = tab.size ? OPTS[tab.size] : null;
  const sizeAt = sizes ? Math.max(0, sizes.indexOf((custom.face as unknown as Record<string, string>)[tab.size!] ?? "m")) : 0;
  const setSize = (i: number) => setCustom((c) => ({ ...c, face: { ...c.face, [tab.size!]: sizes![i] } as FaceParts }));

  const go = () => {
    saveAvatar(tenant, role, shown);
    onDone(shown);
  };

  return (
    <div className="av" data-testid="avatar-setup">
      {!edit && <h1>あなたのキャラクター</h1>}
      <div className="av-card">
        <div className="av-seg" role="tablist" aria-label="キャラクターの作り方">
          {(["default", "custom"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} data-testid={`avatar-mode-${m}`}>
              {m === "default" ? "デフォルト" : "カスタム"}
            </button>
          ))}
        </div>
        <div className={`av-body ${mode}`}>
          <div className="av-stage">
            <Figure a={shown} view={BODY_VIEW} className="av-figure" />
          </div>
          {mode === "custom" && (
            <div className="av-panel" data-testid="avatar-panel">
              <div className="av-tabs" role="tablist" aria-label="部品">
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab.key === t.key} className={tab.key === t.key ? "on" : ""} onClick={() => setTab(t)} data-testid={`avatar-tab-${t.key}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="av-grid" role="listbox" aria-label={tab.label}>
                {choices.map((v) => {
                  const a = tab.key === "hair" ? { ...custom, hair: v as Hair } : { ...custom, face: { ...custom.face, [tab.key]: v } as FaceParts };
                  return (
                    <button key={v} role="option" aria-selected={current === v} className={current === v ? "on" : ""} onClick={() => set(v)} data-testid={`avatar-opt-${v}`}>
                      <Figure a={a} view={HEAD_VIEW} />
                      <span>{tab.key === "hair" ? HAIR_LABEL[v] ?? v : labelOf(tab.key, v)}</span>
                    </button>
                  );
                })}
              </div>
              {sizes && (
                <label className="av-size">
                  <span>小</span>
                  <input
                    type="range"
                    min={0}
                    max={sizes.length - 1}
                    step={1}
                    value={sizeAt}
                    onChange={(e) => setSize(Number(e.target.value))}
                    aria-label={`${tab.label}の大きさ`}
                    data-testid="avatar-size"
                  />
                  <span>大</span>
                </label>
              )}
            </div>
          )}
        </div>
        <button className="big go av-go" onClick={go} data-testid="avatar-go">
          {edit ? "保存する" : mode === "default" ? "デフォルトのキャラクターで進める" : "このキャラクターで進める"}
        </button>
      </div>
    </div>
  );
}
