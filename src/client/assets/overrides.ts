// テナントで決めた小物の差し替え（11/7）を読み込んで、絵を描く側に登録する。テナントに入ったとき・差し替えを決めたときに呼ぶ。
// 読めないとき（役割がまだ無い・回線が切れた）は元の絵のまま描く
import { clearPropOverrides, setPropOverrides } from "../../shared/picto/prop-override";
import { authHeaders } from "../pin/TenantPin";

let loaded: string | null = null;

/** そのテナントの差し替えを読み込む。force が無ければ同じテナントは 1 回だけ */
export async function loadPropOverrides(tenant: string, force = false): Promise<void> {
  if (!force && loaded === tenant) return;
  // まだ役割で入っていなければ読まない（PIN の画面の前に 401・403 を出さない。入ったあとの画面の移りで読み直す）
  const headers = authHeaders(tenant);
  if (!headers["x-role"]) return;
  try {
    const res = await fetch(`/api/t/${encodeURIComponent(tenant)}/assets/active`, { headers });
    if (!res.ok) {
      clearPropOverrides();
      loaded = null;
      return;
    }
    const b = (await res.json()) as { overrides?: Record<string, string> };
    setPropOverrides(b.overrides ?? {});
    loaded = tenant;
  } catch {
    clearPropOverrides();
    loaded = null;
  }
}
