// 主な姿勢（016a〜）。骨格の角度に名前を付けておき、キーフレームや角度の係はこの名前から始める。
import { L, NECK_LEN, NECK_X, SPOT, type View } from "./body";
import { type Bone, STANDING } from "./skeleton";

export type Angles = Record<Bone, number>;
const pose = (a: Partial<Angles>): Angles => ({ ...STANDING, ...a });

export const POSES = {
  /** 立つ */
  stand: pose({ arm_near_upper: 14, arm_near_lower: 8, arm_far_upper: -12, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 指差す（手前の腕を前へまっすぐ） */
  point: pose({ arm_near_upper: 90, arm_near_lower: 0, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** しゃがむ */
  squat: pose({ torso: 22, neck: -5, leg_near_upper: 100, leg_near_lower: -140, leg_far_upper: 98, leg_far_lower: -140, arm_near_upper: 75, arm_near_lower: 15, arm_far_upper: 65, arm_far_lower: 20 }),
  /** 手を挙げる */
  raise_hand: pose({ arm_near_upper: 150, arm_near_lower: 5, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 歩く */
  walk: pose({ torso: 6, arm_near_upper: -30, arm_near_lower: 25, arm_far_upper: 35, arm_far_lower: 25, leg_near_upper: 22, leg_near_lower: -4, leg_far_upper: -18, leg_far_lower: -12 }),
  /** 倒れる（後ろへ倒れかかる。あごを引き、腕を前へ出してバランスを取ろうとする） */
  fall: pose({ torso: -30, neck: 10, arm_near_upper: 80, arm_near_lower: 20, arm_far_upper: 100, arm_far_lower: 10, leg_near_upper: 45, leg_near_lower: -20, leg_far_upper: 20, leg_far_lower: -5 }),
  /** 申し出る（少し前へ出て、手前の手を前に上げる） */
  report: pose({ torso: 10, neck: -5, arm_near_upper: 115, arm_near_lower: 20, arm_far_upper: 10, arm_far_lower: 30, leg_near_upper: 18, leg_far_upper: -12, leg_far_lower: -10 }),
  /** 手元（手前の手を胸の前へ。手元のアップに使う） */
  hands: pose({ torso: 15, neck: 25, arm_near_upper: 55, arm_near_lower: 60, arm_far_upper: 45, arm_far_lower: 70, leg_near_upper: 5, leg_far_upper: -5 }),
  // 基本の動作（11/5〜）。腕の角度は胴に対する値なので、腕を真下へ垂らすときは胴の傾きと同じ数にする
  /** 持ち上げる（ひざを曲げて腰を落とし、両手を足元の物へ下ろす） */
  lift: pose({ torso: 28, neck: 10, arm_near_upper: 36, arm_near_lower: 18, arm_far_upper: 32, arm_far_lower: 22, leg_near_upper: 78, leg_near_lower: -100, leg_far_upper: 77, leg_far_lower: -101 }),
  /** 運ぶ（物を胸の前に抱えて歩く） */
  carry: pose({ torso: 4, neck: 5, arm_near_upper: 48, arm_near_lower: 52, arm_far_upper: 44, arm_far_lower: 58, leg_near_upper: 20, leg_near_lower: -6, leg_far_upper: -14, leg_far_lower: -10 }),
  /** 押す（前へ体を預け、両腕を前へ伸ばす。前の足を曲げ、後ろの足を伸ばす） */
  push: pose({ torso: 24, neck: -12, arm_near_upper: 104, arm_near_lower: 6, arm_far_upper: 100, arm_far_lower: 10, leg_near_upper: 32, leg_near_lower: -34, leg_far_upper: -24, leg_far_lower: -2 }),
  /** 引く（体を後ろへ引き、ひじを体の横へ引きつけて、手は胸の前でつかむ。前の足で踏ん張る） */
  pull: pose({ torso: -12, neck: 8, arm_near_upper: -12, arm_near_lower: 90, arm_far_upper: -16, arm_far_lower: 94, leg_near_upper: 30, leg_near_lower: -4, leg_far_upper: -12, leg_far_lower: -28 }),
  /** 座る（腰かけて、両手をももに置く。いすは小物で足す） */
  sit: pose({ torso: 4, neck: 4, arm_near_upper: 2, arm_near_lower: 63, arm_far_upper: 6, arm_far_lower: 58, leg_near_upper: 90, leg_near_lower: -90, leg_far_upper: 90, leg_far_lower: -92 }),
  /** ひざをつく（手前のひざを床につき、奥の足を前へ立てる） */
  kneel: pose({ torso: 4, neck: 12, arm_near_upper: 30, arm_near_lower: 30, arm_far_upper: 43, arm_far_lower: 0, leg_near_upper: -6, leg_near_lower: -84, leg_far_upper: 90, leg_far_lower: -90 }),
  /** 見上げる（顔を上へ向け、胴も少し反らす） */
  look_up: pose({ torso: -6, neck: -36, arm_near_upper: 2, arm_near_lower: 8, arm_far_upper: -12, arm_far_lower: 6, leg_near_upper: 4, leg_far_upper: -4 }),
  /** 見下ろす（足元をのぞき込む） */
  look_down: pose({ torso: 12, neck: 45, arm_near_upper: 20, arm_near_lower: 10, arm_far_upper: 6, arm_far_lower: 8, leg_near_upper: 4, leg_far_upper: -4 }),
  /** おじぎ（腰から前へ倒し、腕は体の横に垂らす） */
  bow: pose({ torso: 40, neck: 12, arm_near_upper: 42, arm_near_lower: 4, arm_far_upper: 38, arm_far_lower: 4 }),
  /** 手を振る（手前の腕を上げ、ひじから先を立てる） */
  wave: pose({ arm_near_upper: 135, arm_near_lower: 40, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 止める（手前の手を前へ出して立て、手のひらを相手に向ける） */
  stop: pose({ torso: -3, arm_near_upper: 72, arm_near_lower: 50, arm_far_upper: -8, arm_far_lower: 10, leg_near_upper: 10, leg_far_upper: -8 }),
  /** 指で確かめる（足元や手元の物を指差して見る） */
  check: pose({ torso: 12, neck: 30, arm_near_upper: 68, arm_near_lower: 0, arm_far_upper: 10, arm_far_lower: 12, leg_near_upper: 6, leg_far_upper: -6 }),
  /** はしごを上る（両手を上の段へ、手前の足を次の段へ上げる） */
  climb: pose({ torso: 6, neck: -18, arm_near_upper: 160, arm_near_lower: 18, arm_far_upper: 120, arm_far_lower: 40, leg_near_upper: 80, leg_near_lower: -100, leg_far_upper: 2, leg_far_lower: -12 }),
  /** 電話する（手前の手を耳に当てる） */
  phone: pose({ neck: 6, arm_near_upper: 118, arm_near_lower: 140, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 書く（奥の手で板を持ち、手前の手で書く。うつむいて手元を見る） */
  write: pose({ torso: 10, neck: 32, arm_near_upper: 58, arm_near_lower: 66, arm_far_upper: 42, arm_far_lower: 92, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 足元を指差す（腕を伸ばして斜め下を差し、うつむく） */
  point_down: pose({ torso: 6, neck: 30, arm_near_upper: 46, arm_near_lower: 0, arm_far_upper: -4, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
  /** 頭の上で作業する（両腕を上げ、上を見る） */
  reach_up: pose({ neck: -25, arm_near_upper: 160, arm_near_lower: 10, arm_far_upper: 152, arm_far_lower: 16, leg_near_upper: 5, leg_far_upper: -5 }),
  /** つまずく（前へ倒れかかり、腕を前へ出す。後ろの足が浮く） */
  trip: pose({ torso: 30, neck: -10, arm_near_upper: 110, arm_near_lower: 10, arm_far_upper: 95, arm_far_lower: 20, leg_near_upper: 25, leg_near_lower: -15, leg_far_upper: -35, leg_far_lower: -40 }),
  /** 走る（体を前へ倒し、ひじを曲げて腕を前後に大きく振る） */
  run: pose({ torso: 14, neck: -4, arm_near_upper: -30, arm_near_lower: 85, arm_far_upper: 60, arm_far_lower: 75, leg_near_upper: 55, leg_near_lower: -70, leg_far_upper: -30, leg_far_lower: -65 }),
  // 11/6 現場のヒアリングから足した 2 つ
  /** 倒れて横になる（床にうつぶせに横たわる。胴を前へ 90 度倒し、足を後ろへまっすぐ伸ばし、腕は体に沿わせる） */
  lie_down: pose({ torso: 90, neck: -10, arm_near_upper: 0, arm_near_lower: 0, arm_far_upper: -5, arm_far_lower: 0, leg_near_upper: -90, leg_near_lower: 0, leg_far_upper: -88, leg_far_lower: 0 }),
  /** 口の前に人差し指を立てる「シー」（口外禁止）。指は characterSvg の finger で立てる。手は向きごとに口の前へ置く（PLACED・BY_VIEW） */
  shush: pose({ arm_near_upper: 40, arm_near_lower: 130, arm_far_upper: -10, arm_far_lower: 10, leg_near_upper: 5, leg_far_upper: -5 }),
} satisfies Record<string, Angles>;

export type PoseName = keyof typeof POSES;
export const POSE_NAMES = Object.keys(POSES) as PoseName[];

/**
 * キャラクターを作る画面の見本の姿勢（A ポーズ。製品仕様 §14）。腕はまっすぐ下ろして体から少し開き、足も少し開く。
 * 正面は左右で同じ角度に開く（rig が正面の奥の手足の向きを裏返すので、角度は同じ数でよい）。
 * 斜めと真横は向きを裏返さないので、外へ開く向きが奥と手前で逆になる。真横はほぼまっすぐ下ろす。
 * POSES には入れない（カードの姿勢の名前の一覧に混ぜない）
 */
export const A_POSE: Record<View, Angles> = {
  front: pose({ arm_near_upper: 16, arm_far_upper: 16, leg_near_upper: 6, leg_far_upper: 6 }),
  quarter: pose({ arm_near_upper: 10, arm_far_upper: -10, leg_near_upper: 4, leg_far_upper: -4 }),
  side: pose({ arm_near_upper: 3, arm_far_upper: -3, leg_near_upper: 2, leg_far_upper: -2 }),
};

/**
 * 元の姿勢から少しだけ変える（角度を足す）。動きのキーフレームを、名前の付いた姿勢から作るときに使う。
 * 変える関節は 3 つまで、1 つ ±30 度まで（動きの決まり。derivedFrom で確かめられる）
 */
export const vary = (src: PoseName | Angles, delta: Partial<Angles>): Angles => {
  const a = typeof src === "string" ? POSES[src] : src;
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v + (delta[k as Bone] ?? 0)])) as Angles;
};

// ---- 動きの決まり（11/5 作者）: 名前の付いた姿勢を土台にし、少しだけ派生させる ----

/** 土台から動かさない関節の数（10 のうち 7）。残りの 3 つまでを動かしてよい（7 対 3） */
export const FIXED_MIN = 7;
/** 動かす関節の 1 つあたりの幅（度） */
export const FREE_MAX = 30;
/** 土台と同じとみなすずれ（度） */
const SAME = 1;

/** どの姿勢を土台に、どの関節をどれだけ動かしたか。土台にできる姿勢が無ければ base は undefined */
export interface Derivation { base?: PoseName; moved: Partial<Angles>; worst: number }

/**
 * 角度が、名前の付いた姿勢のどれかから派生した形かを調べる（動きの決まり）。
 * 決まり: 土台の姿勢の関節のうち 7 つ以上はそのまま、動かす関節は 3 つまで、それぞれ ±30 度まで。
 * 当てはまる姿勢が複数あれば、動かした量の合計がいちばん小さいものを返す
 */
export function derivedFrom(a: Angles): Derivation {
  let best: Derivation & { sum: number } = { moved: {}, worst: Infinity, sum: Infinity };
  for (const name of POSE_NAMES) {
    const base = POSES[name];
    const moved: Partial<Angles> = {};
    let worst = 0, sum = 0;
    for (const b of Object.keys(base) as Bone[]) {
      const d = a[b] - base[b];
      if (Math.abs(d) > SAME) { moved[b] = d; worst = Math.max(worst, Math.abs(d)); sum += Math.abs(d); }
    }
    if (Object.keys(moved).length > 10 - FIXED_MIN || worst > FREE_MAX) continue;
    if (sum < best.sum) best = { base: name, moved, worst, sum };
  }
  return { base: best.base, moved: best.moved, worst: best.base ? best.worst : Infinity };
}

/**
 * 動きの大きい姿勢。正面では前後の動きが縮んで読めないので、斜めか真横で描く。
 * 正面は、立つ・待つ・向き合って話す・手を挙げるなど、その場で止まっている場面に使う（11/5 作者）
 */
export const MOVING_POSES: ReadonlySet<PoseName> = new Set<PoseName>(["walk", "run", "fall", "trip", "push", "pull", "lift", "carry", "climb", "squat", "kneel", "sit", "bow", "lie_down"]);

/** 姿勢を描く向きを選ぶ。動きの大きい姿勢で正面を頼まれたら斜めにする */
export const viewFor = (name: PoseName, wanted: View = "quarter"): View => (wanted === "front" && MOVING_POSES.has(name) ? "quarter" : wanted);

// ---- 向きごとの角度（正面は 3 次元の向きから写す） ----

/** 手足の 1 段の名前 */
export type Seg = Exclude<Bone, "torso" | "neck">;
/** 手足の見かけの長さの倍率（正面で前後へ振った手足は短く見える）。無い段は 1 */
export type Lengths = Partial<Record<Seg, number>>;
/** 描く向きの角度と見かけの長さ。characterSvg に angles と len として渡す */
export interface ViewPose { angles: Angles; len: Lengths; shade?: LegShade }
/** 奥にある足の影の濃さ（0 で影なし、1 で今までの奥の足の色）。無い足は 0 */
export type LegShade = Partial<Record<"far" | "near", number>>;
/**
 * 奥の足の影（11/5 作者）。奥行きが出る向きほど濃くする: 斜め 0.35、真横 0.75。
 * 正面はふつう影を付けないが、足が前後に開く姿勢（歩く・走る・倒れる）は、後ろへ振った足に斜めと同じ影を付ける
 */
export function legShade(a: Angles, view: View): LegShade {
  if (view === "quarter") return { far: 0.35 };
  if (view === "side") return { far: 0.75 };
  const d = a.leg_near_upper - a.leg_far_upper;
  return Math.abs(d) < 20 ? {} : d > 0 ? { far: 0.35 } : { near: 0.35 };
}

const DEG = Math.PI / 180;
/** 正面で手足をもともと外へ開く角度（度）。腕は体の横から少し離し、足はほぼまっすぐ下ろす（大きく開くとがに股に見えた） */
const OPEN = { arm: 10, leg: 3 };
/**
 * 姿勢ごとの外への開き（度。正で外、負で体の中心の側）。正面の見え方を決める。
 * 倒れる: 腕を横へ広げてバランスを崩す（真上に挙げるとバンザイに見えた）
 */
const SPREAD: Partial<Record<PoseName, Partial<Record<Seg, number>>>> = {
  push: { arm_near_upper: 14, arm_far_upper: 14, arm_near_lower: 4, arm_far_lower: 4 },
  fall: { arm_near_upper: 72, arm_far_upper: 64, arm_near_lower: 80, arm_far_lower: 70, leg_near_upper: 12, leg_far_upper: 6 },
  climb: { arm_near_upper: 22, arm_far_upper: 22, arm_near_lower: 6, arm_far_lower: 10 },
  wave: { arm_near_upper: 40, arm_near_lower: 0 },
  // 指差す・確かめるは、カメラを向いた腕が短い切れ端になって読めなかったので、斜め外へ開いて見せる
  point: { arm_near_upper: 45, arm_near_lower: 45 },
  check: { arm_near_upper: 28, arm_near_lower: 28 },
  point_down: { arm_near_upper: 30, arm_near_lower: 30 },
  reach_up: { arm_near_upper: 18, arm_far_upper: 18, arm_near_lower: 4, arm_far_lower: 4 },
  trip: { arm_near_upper: 22, arm_far_upper: 22 },
  // しゃがむ・持ち上げるはひざを外へ開く（正面でももが体の前に重なって見えなくなるのを防ぐ）
  squat: { leg_near_upper: 30, leg_far_upper: 30, leg_near_lower: 6, leg_far_lower: 6 },
  lift: { leg_near_upper: 18, leg_far_upper: 18, leg_near_lower: 4, leg_far_lower: 4 },
  raise_hand: { arm_near_upper: 16, arm_near_lower: 10 },
};

/** 前へ theta、外へ alpha 振った長さ 1 の手足を、正面へ写した向き（真下 0、外へ正の度）と見かけの長さ */
const seen = (theta: number, alpha: number): [number, number] => {
  const x = Math.sin(alpha * DEG), y = Math.cos(alpha * DEG) * Math.cos(theta * DEG);
  return [Math.atan2(x, y) / DEG, Math.max(0.12, Math.hypot(x, y))];
};

/**
 * 足の写し方。カメラの方（前）や後ろへ向いた足は、正面へ写した縦の長さ y がほぼ 0 になり、外への開き x のわずかな値だけで
 * 真横や上へ向いてしまう（しゃがむ・座るの正面で、ももが横へ折れて見えた）。y を 0.35 で下から押さえて、ももは下か斜め下へ向ける。
 * 見かけの長さも 0.3 より短くしない
 */
const seenLeg = (theta: number, alpha: number): [number, number] => {
  const x = Math.sin(alpha * DEG), y = Math.cos(alpha * DEG) * Math.cos(theta * DEG);
  return [Math.atan2(x, Math.max(0.35, y)) / DEG, Math.max(0.3, Math.hypot(x, y))];
};

/**
 * 正面の前腕。ひじを 40 度より曲げた前腕は、3 次元の向きのうち、縦の分（cos）はそのまま、横に寝た分（sin）を前と体の中心の側に分ける。
 * 手が体の前へ出るほど（前への出 z が大きいほど）、手を胸の前（肩から体の中心へ 38 寄った所）へ寄せる。
 * 曲げた角度の割合で寄せる前の式では、手が肩の真下に残り、ひじだけ張って見えた。後ろへ振った腕は寄せない
 */
function forearm(upper: number, bend: number, pu: number, ku: number): [number, number] {
  const th = upper + bend;
  const z = L.upperArm * Math.sin(upper * DEG) + L.lowerArm * Math.sin(th * DEG);
  const elbowOut = L.upperArm * ku * Math.sin(pu * DEG);
  const vy = Math.cos(th * DEG), h = Math.abs(Math.sin(th * DEG));
  // 手の横の行き先（肩から外へ正）。寄せない腕は、肩の外への開き（OPEN.arm）くらい外へ向ける
  const pull = z > 0 && bend >= 40;
  const want = pull ? (-38 * Math.min(1, z / 50) - elbowOut) / L.lowerArm : Math.sin(OPEN.arm * DEG) * h;
  const side = Math.max(-h, Math.min(h, want));
  return [Math.atan2(side, vy) / DEG, Math.max(0.12, Math.hypot(side, vy))];
}

/**
 * 横から見た角度（POSES の数）を、正面で描く角度と見かけの長さにする。
 * 手足は 3 次元で「前へ振った角度（横から見た角度）」と「外への開き（SPREAD）」の向きに置き、正面へ写す。
 * 前後へ振った手足は短く見える（len）。ひじを曲げた前腕は、曲げた分だけ体の中心へ寄る（手が胸やおなかの前へ来る）。
 * 胴と首の傾きは angles にそのまま残す（characterSvg が正面では胴を縦に縮め、顔の向きを上下にずらす）
 */
function frontOf(a: Angles, spread: Partial<Record<Seg, number>> = {}): ViewPose {
  const out = { ...a };
  const len: Lengths = {};
  for (const s of ["near", "far"] as const) {
    const up = `arm_${s}_upper` as const, lo = `arm_${s}_lower` as const;
    const au = spread[up] ?? OPEN.arm;
    // 上腕の見かけの長さは 0.3 より短くしない（押すの正面で、カメラを向いた腕が消えて手が肩に付いた）
    const [pu, ku0] = seen(a[up] - a.torso, au);
    const ku = Math.max(0.3, ku0);
    const [pl, kl] = spread[lo] !== undefined ? seen(a[up] + a[lo] - a.torso, spread[lo]) : forearm(a[up] - a.torso, a[lo], pu, ku);
    out[up] = pu; out[lo] = pl - pu; len[up] = ku; len[lo] = kl;
    const tu = `leg_${s}_upper` as const, tl = `leg_${s}_lower` as const;
    const lu = spread[tu] ?? OPEN.leg;
    const [qu, mu] = seenLeg(a[tu], lu);
    // すねが後ろへ 60 度より向く足（ひざをつく・走る後ろの足）は、すねを真上へ短く立て、ももの後ろに隠す（characterSvg が靴を後ろに描く）
    const [ql, ml] = a[tu] + a[tl] <= -60 ? [180, 0.3] : seenLeg(a[tu] + a[tl], spread[tl] ?? lu);
    out[tu] = qu; out[tl] = ql - qu; len[tu] = mu; len[tl] = ml;
  }
  return { angles: out, len };
}

type ArmKey = `arm_${"near" | "far"}_${"upper" | "lower"}`;
/**
 * 手を体のある場所へ届ける角度（2 本の骨の届き方）。view で描くときの肩から target（胴の座標。腰が原点、y は下が正）へ手を置く。
 * elbow: 1 でひじを外（正面は体の外、斜めと真横は後ろ）へ張る、-1 で内へ。返す角度は characterSvg の rig にそのまま渡せる数
 */
export function reach(view: View, side: "near" | "far", target: [number, number], elbow: 1 | -1 = 1): Partial<Record<ArmKey, number>> {
  const i = side === "far" ? 0 : 1;
  const sign = view === "front" && i === 0 ? 1 : -1;
  const [sx, sy] = [SPOT[view].arm[i], -L.torso + L.shoulderDrop];
  const [dx, dy] = [target[0] - sx, target[1] - sy];
  const a = L.upperArm, b = L.lowerArm;
  const d = Math.min(a + b - 1, Math.max(Math.abs(a - b) + 1, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const turn = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  // 外へ張る向き: 正面は画面の外側（肩の x の向き）、斜めと真横は後ろ（画面の左）
  const outward = view === "front" ? Math.sign(sx) : -1;
  const cands = [base + turn, base - turn].map((t) => [sx + a * Math.cos(t), sy + a * Math.sin(t)] as const);
  const [ex, ey] = cands.sort((p, q) => (q[0] - p[0]) * outward * elbow)[0];
  const [hx, hy] = [sx + d * Math.cos(base), sy + d * Math.sin(base)];
  // 下向きの線を時計回りに r 回すと (−sin r, cos r) を向く
  const ru = Math.atan2(-(ex - sx), ey - sy) / DEG;
  const rl = Math.atan2(-(hx - ex), hy - ey) / DEG - ru;
  return { [`arm_${side}_upper`]: ru / sign, [`arm_${side}_lower`]: rl / sign };
}

/**
 * ひじと手を置く場所を決めて、その向きで描く腕の角度と見かけの長さにする（胴の座標。腰が原点、y は下が正）。
 * ひじがカメラの方へ出る腕は、上腕が短く見える（len）。正面以外の手前の腕に使う
 */
function place(view: Exclude<View, "front">, elbow: [number, number], hand: [number, number]): { angles: Partial<Angles>; len: Lengths } {
  const [sx, sy] = [SPOT[view].arm[1], -L.torso + L.shoulderDrop];
  const ru = Math.atan2(-(elbow[0] - sx), elbow[1] - sy) / DEG;
  const rl = Math.atan2(-(hand[0] - elbow[0]), hand[1] - elbow[1]) / DEG - ru;
  // 手前の腕は rig で向きが裏返る（-1）ので、符号を戻す
  return {
    angles: { arm_near_upper: -ru, arm_near_lower: -rl },
    len: { arm_near_upper: Math.hypot(elbow[0] - sx, elbow[1] - sy) / L.upperArm, arm_near_lower: Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]) / L.lowerArm },
  };
}

/**
 * 顔の横の見える耳の位置（電話を当てる所）。胴の座標で、首を傾けない立ち姿のとき。
 * 耳の印（avatar.ts の EAR_MARK、頭の原点から y −32）に首の横の位置（NECK_X）を足した所。正面は顔の縁の外の耳たぶへ少し出す
 * （顔の内側に置くと、手が頬や目の上に来て、目をこすっているように見えた）
 */
const EAR_AT: Record<View, [number, number]> = { front: [54, -190], quarter: [-29, -190], side: [1, -190] };
/** 口の位置（胴の座標。立ち姿・首を傾けないとき）。頭の原点（y −158）から口の y −14、横は口のまん中に首の横の位置を足した所 */
const MOUTH_AT: Record<View, [number, number]> = { front: [0, -172], quarter: [26, -172], side: [38.5, -172] };

/**
 * 向きごとに手で決めた形（3 次元から写すだけでは不自然になるもの）。
 * 斜め: 手前の腕は肩が向きと逆の側（画面の左）にあるので、前へ振り上げると胸や顔を横切る。止めるは奥の手を前へ出し、手前の腕は下ろす。
 * 挙げる・振る手は真上から少し後ろへ立てて、顔を隠さない。
 * 電話は手を見える耳へ届ける（腕の角度のままだと、手が口の前に来た）
 */
const BY_VIEW: Partial<Record<PoseName, Partial<Record<View, Partial<Angles>>>>> = {
  stop: { quarter: { arm_near_upper: 12, arm_near_lower: 8, arm_far_upper: 72, arm_far_lower: 50 } },
  phone: { front: reach("front", "near", EAR_AT.front) },
  // シー: 手を口の少し下に置き、立てた指が唇の前を通る
  shush: { front: reach("front", "near", [MOUTH_AT.front[0], MOUTH_AT.front[1] + 16]) },
  raise_hand: { quarter: { arm_near_upper: 184, arm_near_lower: 0 } },
  // 頭の上の作業は、斜めと真横で手前の腕を真上より少し後ろへ立てて、顔を隠さない
  reach_up: { quarter: { arm_near_upper: 184, arm_near_lower: 0 }, side: { arm_near_upper: 194, arm_near_lower: 0 } },
  wave: { quarter: { arm_near_upper: 200, arm_near_lower: -24 } },
};

/**
 * ひじと手の場所で決めた腕（角度と見かけの長さ）。BY_VIEW のあとに当てる。
 * 電話: 斜めと真横は、ひじを体の前（正面から 45 度ほど）へ出し、胸の前から耳へ手を上げる。
 * ひじを後ろへ張ると、腕を頭の後ろへ回したように見えた（11/5 作者）。ひじがカメラの方へ出る分、上腕は短く見える
 */
const PLACED: Partial<Record<PoseName, Partial<Record<Exclude<View, "front">, { angles: Partial<Angles>; len: Lengths }>>>> = {
  shush: {
    quarter: place("quarter", [-2, -118], [MOUTH_AT.quarter[0] + 4, MOUTH_AT.quarter[1] + 16]),
    side: place("side", [26, -120], [MOUTH_AT.side[0] + 8, MOUTH_AT.side[1] + 16]),
  },
  phone: {
    quarter: place("quarter", [-6, -140], [EAR_AT.quarter[0], EAR_AT.quarter[1] + 4]),
    side: place("side", [30, -142], [EAR_AT.side[0], EAR_AT.side[1] + 6]),
  },
};

/**
 * 姿勢をその向きで描く角度と見かけの長さにする。斜めと真横は角度のまま、正面は 3 次元の向きから写す（frontOf）。
 * BY_VIEW に手で決めた形があれば、その段は上書きして見かけの長さを 1 に戻す。
 * characterSvg に渡すときはこれを通す（POSES の数は横から見た角度なので、正面にそのまま渡すと手足が左右で同じ側へ傾く）。
 * 返す角度は描くためのもので、validateFigure の範囲に入らないことがある
 */
export function poseAngles(src: PoseName | Angles, view: View): ViewPose {
  const name = typeof src === "string" ? src : undefined;
  const a = name ? POSES[name] : (src as Angles);
  const base: ViewPose = { ...(view === "front" ? frontOf(a, name ? SPREAD[name] : undefined) : { angles: a, len: {} }), shade: legShade(a, view) };
  const placed = name && view !== "front" ? PLACED[name]?.[view] : undefined;
  const hand = name ? BY_VIEW[name]?.[view] : undefined;
  if (!hand && !placed) return base;
  const len = { ...base.len };
  for (const k of Object.keys(hand ?? {})) delete len[k as Seg];
  return { angles: { ...base.angles, ...hand, ...placed?.angles }, len: { ...len, ...placed?.len }, shade: base.shade };
}

// ---- 棒人間（姿勢の土台を見るための絵） ----

type Pt = [number, number];
export interface StickJoints {
  hip: Pt;
  chest: Pt;
  neck: Pt;
  head: Pt;
  /** [奥, 手前] */
  shoulder: [Pt, Pt];
  elbow: [Pt, Pt];
  hand: [Pt, Pt];
  hipJoint: [Pt, Pt];
  knee: [Pt, Pt];
  ankle: [Pt, Pt];
}

/** 正面で、胴が前後へ傾いた分だけ縦に縮む倍率（characterSvg と同じ）。傾きの見た目どおりの cos では浅いおじぎが立ち姿と見分けにくかったので、1.5 倍の角度で縮める */
export const torsoScale = (deg: number) => Math.max(0.5, Math.cos(Math.min(90, Math.abs(deg) * 1.5) * DEG));

/**
 * 描く向きの角度を、characterSvg の rig と同じ読み方で関節の位置にする（右向き・腰が原点・単位は背の高さ 434 の中の値、y は下が正）。
 * 正面は胴と首を傾けず、手足の角度を「外へ開く」向きに読む（画面の左の手足は時計回り、右は反時計回り）。胴は前後の傾きの分だけ縦に縮む
 */
export function stickJoints(p: ViewPose, view: View): StickJoints {
  const { angles: a, len } = p;
  const front = view === "front";
  const torso = front ? 0 : a.torso;
  const neck = front ? 0 : a.neck;
  const kT = front ? torsoScale(a.torso) : 1;
  const dir = (deg: number, l: number): Pt => [-Math.sin(deg * DEG) * l, Math.cos(deg * DEG) * l];
  const add = (q: Pt, r: Pt): Pt => [q[0] + r[0], q[1] + r[1]];
  const inTorso = (q: Pt): Pt => [q[0] * Math.cos(torso * DEG) - q[1] * Math.sin(torso * DEG), q[0] * Math.sin(torso * DEG) + q[1] * Math.cos(torso * DEG)];
  const sign = (i: number) => (front && i === 0 ? 1 : -1);
  const sides = ["far", "near"] as const;
  const k = (s: Seg) => len[s] ?? 1;
  const shoulder = sides.map((_, i) => inTorso([SPOT[view].arm[i], -L.torso * kT + L.shoulderDrop])) as [Pt, Pt];
  const elbow = sides.map((s, i) => add(shoulder[i], dir(torso + sign(i) * a[`arm_${s}_upper`], L.upperArm * k(`arm_${s}_upper`)))) as [Pt, Pt];
  const hand = sides.map((s, i) => add(elbow[i], dir(torso + sign(i) * (a[`arm_${s}_upper`] + a[`arm_${s}_lower`]), L.lowerArm * k(`arm_${s}_lower`)))) as [Pt, Pt];
  const hipJoint = sides.map((_, i) => [SPOT[view].leg[i], 0] as Pt) as [Pt, Pt];
  const knee = sides.map((s, i) => add(hipJoint[i], dir(sign(i) * a[`leg_${s}_upper`], L.thigh * k(`leg_${s}_upper`)))) as [Pt, Pt];
  const ankle = sides.map((s, i) => add(knee[i], dir(sign(i) * (a[`leg_${s}_upper`] + a[`leg_${s}_lower`]), L.shin * k(`leg_${s}_lower`)))) as [Pt, Pt];
  const neckPt = inTorso([NECK_X[view], -L.torso * kT - L.headUp - NECK_LEN.b]);
  const head = add(neckPt, inTorso(dir(180 + neck, 36)));
  return { hip: [0, 0], chest: inTorso([0, -L.torso * kT]), neck: neckPt, head, shoulder, elbow, hand, hipJoint, knee, ankle };
}

/**
 * 骨だけの棒人間（g 1 つ）。姿勢が人として自然か（体の軸・ひじとひざの向き・左右の手足）を見るための絵。
 * いちばん低い足首（靴底の分 L.sole を足す）を y 0 に、腰を x 0 に置く。奥の手足は灰色、手前は黒
 */
export function stickSvg(p: ViewPose, view: View): string {
  const j = stickJoints(p, view);
  const low = Math.max(j.ankle[0][1], j.ankle[1][1]) + L.sole;
  const f = (q: Pt) => `${Math.round(q[0])} ${Math.round(q[1] - low)}`;
  const line = (pts: Pt[], c: string) => `<path d="M${pts.map(f).join("L")}" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dot = (q: Pt, c: string) => `<circle cx="${f(q).split(" ")[0]}" cy="${f(q).split(" ")[1]}" r="9" fill="${c}"/>`;
  const limbs = (i: number, c: string) =>
    line([j.shoulder[i], j.elbow[i], j.hand[i]], c) + line([j.hipJoint[i], j.knee[i], j.ankle[i]], c) + dot(j.elbow[i], c) + dot(j.knee[i], c);
  const [hx, hy] = f(j.head).split(" ");
  return `<g data-part="stick">${limbs(0, "#999")}` +
    line([j.hip, j.chest, j.neck], "#000") + line([j.shoulder[0], j.shoulder[1]], "#000") + line([j.hipJoint[0], j.hipJoint[1]], "#000") +
    `<circle cx="${hx}" cy="${hy}" r="36" fill="#fff" stroke="#000" stroke-width="10"/>${limbs(1, "#000")}</g>`;
}
