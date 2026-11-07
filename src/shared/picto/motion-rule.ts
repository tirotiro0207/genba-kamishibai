// 動きの決まり（10 関節のうち 7 つは手本のまま、動かすのは 3 つまで ±30 度）の警告（11/7 作者: エラーで止めず、警告にする）。
// validateMotion には入れない。保存も作り直しも止めない。監修者が見る画面で「決まりから外れた姿勢が N 人」と小さく出すために使う。
import type { MotionJson } from "./motion";
import { derivedFrom } from "./poses";

/** 決まりから外れた姿勢 1 人分。keyframe はキーフレームの番号、figure はそのキーフレームの何人目か */
export interface MotionRuleWarning { keyframe: number; figure: number; role: string }

/** 動きのどのキーフレームの誰が、名前の付いた姿勢のどれからも派生と言えない（決まりから外れた）かの一覧。空なら全員が決まりの中 */
export function motionRuleWarnings(m: MotionJson): MotionRuleWarning[] {
  const out: MotionRuleWarning[] = [];
  const ks = Array.isArray(m?.keyframes) ? m.keyframes : [];
  ks.forEach((k, i) => {
    (Array.isArray(k?.figures) ? k.figures : []).forEach((f, j) => {
      if (f?.angles && derivedFrom(f.angles).base === undefined) out.push({ keyframe: i, figure: j, role: f.role });
    });
  });
  return out;
}

/** 画面に出す一言。外れが無ければ空 */
export const motionRuleLine = (w: readonly MotionRuleWarning[]): string => (w.length ? `決まりから外れた姿勢が ${w.length} 人` : "");
