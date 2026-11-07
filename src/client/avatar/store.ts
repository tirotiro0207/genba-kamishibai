// 自分のキャラクターの置き場（11/5）。今は端末のブラウザ（localStorage）に、テナントと役ごとに置く。
// 読めない・書けない端末（プライベートの窓など）では、毎回キャラクターを作る画面が出るだけで、先へは進める
import { DEFAULT_FACE, FACE_OPTIONS, type FaceParts } from "../../shared/picto/avatar";
import type { Hair } from "../../shared/picto/character";
import { TRACED_HAIRS } from "../../shared/picto/hair-traced";

export interface Avatar {
  hair: Hair;
  face: FaceParts;
  /** 業種（11/7。industry-drafts.ts の番号）。今は電気工事（01）だけ選べる */
  industry?: string;
}
/** 今選べる業種（11/7 作者: ほかの業種は鍵をかけて、電気工事だけ） */
export const OPEN_INDUSTRIES: readonly string[] = ["01"];
export const DEFAULT_AVATAR: Avatar = { hair: "bob", face: DEFAULT_FACE };
/** 選べる髪（キャラクターを作る画面の一覧と同じ） */
export const HAIRS: readonly Hair[] = ["bob", ...TRACED_HAIRS];

/**
 * 置いてあった値を、今の髪・顔の一覧に合わせる。一覧に無い値（古い版で選んだ部品・壊れた値）は既定に戻す。
 * 一覧に無い値をそのまま描くと、ホームの顔の絵が例外で落ちる・肌の色が抜ける
 */
export function normalizeAvatar(a: unknown): Avatar {
  const o = (a && typeof a === "object" ? a : {}) as { hair?: unknown; face?: unknown };
  const hair = (HAIRS as readonly unknown[]).includes(o.hair) ? (o.hair as Hair) : DEFAULT_AVATAR.hair;
  const saved = (o.face && typeof o.face === "object" ? o.face : {}) as Record<string, unknown>;
  const face = { ...DEFAULT_FACE };
  for (const k of Object.keys(FACE_OPTIONS) as (keyof FaceParts)[]) {
    if ((FACE_OPTIONS[k] as readonly unknown[]).includes(saved[k])) (face as Record<string, unknown>)[k] = saved[k];
  }
  const industry = typeof (o as { industry?: unknown }).industry === "string" && OPEN_INDUSTRIES.includes((o as { industry: string }).industry) ? (o as { industry: string }).industry : undefined;
  return industry ? { hair, face, industry } : { hair, face };
}

const key = (tenant: string, role: string) => `avatar:${tenant}:${role}`;

export function loadAvatar(tenant: string, role: string): Avatar | null {
  try {
    const s = localStorage.getItem(key(tenant, role));
    if (!s) return null;
    return normalizeAvatar(JSON.parse(s));
  } catch {
    return null;
  }
}

export function saveAvatar(tenant: string, role: string, a: Avatar) {
  try {
    localStorage.setItem(key(tenant, role), JSON.stringify(a));
  } catch {
    /* 置けない端末では次も作る画面が出る */
  }
}
