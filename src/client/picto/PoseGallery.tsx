// 姿勢の一覧のページ（016a〜）。名前の付いた姿勢を右向きと左向きで並べる
import { POSE_NAMES, POSES } from "../../shared/picto/poses";
import { renderFrame } from "../../shared/picto/scene";

const LABEL: Record<string, string> = { stand: "立つ", point: "指差す", squat: "しゃがむ", raise_hand: "手を挙げる" };

export function PoseGallery() {
  return (
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
  );
}
