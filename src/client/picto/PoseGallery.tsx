// 姿勢の一覧のページ（016a〜）。名前の付いた姿勢を右向きと左向きで並べる
import { POSE_NAMES, POSES } from "../../shared/picto/poses";
import { type Frame, placePair, renderFrame } from "../../shared/picto/scene";

const LABEL: Record<string, string> = { stand: "立つ", point: "指差す", squat: "しゃがむ", raise_hand: "手を挙げる", walk: "歩く", fall: "倒れる", report: "申し出る", hands: "手元" };

const P = (x: number, name: keyof typeof POSES, facing: "left" | "right" = "right") => ({ x, height: 0.55, facing, angles: POSES[name] });
const [far0, far1] = placePair(0.6);
const [near0, near1] = placePair(0.25);

/** 視線・距離・強調・手元のアップの見本 */
const STAGING: [string, string, Frame][] = [
  ["gaze-down", "視線（下へ）", { figures: [{ ...P(0.4, "stand"), gaze: { angle: -40, length: 0.6 } }] }],
  ["distance-far", "距離（離れる）", { figures: [P(far0, "stand"), P(far1, "stand", "left")] }],
  ["distance-near", "距離（近い）", { figures: [P(near0, "report"), P(near1, "stand", "left")] }],
  ["emph-thick", "強調（太さ）", { figures: [{ ...P(0.3, "point"), emphasis: ["thick"] }, P(0.72, "stand", "left")] }],
  ["emph-large", "強調（大きさ）", { figures: [{ ...P(0.3, "point"), emphasis: ["large"] }, P(0.72, "stand", "left")] }],
  ["emph-dark", "強調（明暗）", { figures: [{ ...P(0.3, "point"), emphasis: ["dark"] }, P(0.72, "stand", "left")] }],
  ["emph-frame", "強調（枠）", { figures: [{ ...P(0.3, "point"), emphasis: ["frame"] }, P(0.72, "stand", "left")] }],
  ["zoom-hands", "手元のアップ", { figures: [P(0.5, "hands")], zoom: { figure: 0, joint: "hand_near", factor: 2.5 } }],
];

export function PoseGallery() {
  return (
    <>
    <h2>姿勢</h2>
    <div className="gallery" data-testid="pose-gallery">
      {POSE_NAMES.map((name) =>
        (["right", "left"] as const).map((facing) => (
          <figure key={`${name}-${facing}`} data-testid={`pose-${name}-${facing}`}>
            <div className="frame" dangerouslySetInnerHTML={{ __html: renderFrame({ figures: [{ x: 0.5, height: 0.62, facing, angles: POSES[name] }] }, 240).svg }} />
            <figcaption>
              {LABEL[name] ?? name}（{facing === "right" ? "右向き" : "左向き"}）
            </figcaption>
          </figure>
        )),
      )}
    </div>
    <h2>コマの演出</h2>
    <div className="gallery" data-testid="staging-gallery">
      {STAGING.map(([id, label, frame]) => (
        <figure key={id} data-testid={`staging-${id}`}>
          <div className="frame" dangerouslySetInnerHTML={{ __html: renderFrame(frame, 240).svg }} />
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
    </>
  );
}
