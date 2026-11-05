// 自分のキャラクターの置き場（11/5）。今は端末のブラウザ（localStorage）に、テナントと役ごとに置く。
// 読めない・書けない端末（プライベートの窓など）では、毎回キャラクターを作る画面が出るだけで、先へは進める
import { DEFAULT_FACE, type FaceParts } from "../../shared/picto/avatar";
import type { Hair } from "../../shared/picto/character";

export interface Avatar {
  hair: Hair;
  face: FaceParts;
}
export const DEFAULT_AVATAR: Avatar = { hair: "bob", face: DEFAULT_FACE };

const key = (tenant: string, role: string) => `avatar:${tenant}:${role}`;

export function loadAvatar(tenant: string, role: string): Avatar | null {
  try {
    const s = localStorage.getItem(key(tenant, role));
    if (!s) return null;
    const a = JSON.parse(s) as Partial<Avatar>;
    return { hair: a.hair ?? DEFAULT_AVATAR.hair, face: { ...DEFAULT_FACE, ...a.face } };
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
