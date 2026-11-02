// 署名の記録（051a・仕様 §6 署名の記録）。監修者が OK のカードのその版に署名すると、版・日付・中身のハッシュを
// 追記だけの監査の記録 ⑤ に残し、カードを署名済みにする。法律上の電子署名ではなく、社内の承認の記録。
// 監修者がその版を最初に開いた時刻を残し、署名までの分数（「1 枚 ○分」の元）も ⑤ に入れる。
// 署名のあとで中身を書き換えると、今の中身のハッシュが ⑤ のハッシュと合わなくなり、分かる。
import { canonical, sha256Hex } from "../shared/audit";
import type { CardBody } from "../shared/card";
import { appendAudit } from "./audit";
import { type CardRow, currentEvidence, getCard } from "./cards";
import type { Person } from "./people";

export const actorOf = (p: Person | null) => (p ? `${p.role}.${p.slot}` : "anon");

/** カードの中身のハッシュ（キーを並べた JSON の SHA-256） */
export const contentHash = (body: CardBody | string) => sha256Hex(canonical(typeof body === "string" ? JSON.parse(body) : body));

/** その版を最初に開いた時刻を残す（2 回目からは前の時刻のまま） */
export async function recordOpen(db: D1Database, tenantId: string, r: CardRow, actor: string, now = new Date()): Promise<string> {
  await db.prepare("INSERT OR IGNORE INTO card_opens (tenant_id, card_id, version, actor, opened_at) VALUES (?, ?, ?, ?, ?)").bind(tenantId, r.id, r.version, actor, now.toISOString()).run();
  const row = await db.prepare("SELECT opened_at FROM card_opens WHERE tenant_id = ? AND card_id = ? AND version = ? AND actor = ?").bind(tenantId, r.id, r.version, actor).first<{ opened_at: string }>();
  return row!.opened_at;
}

/** 署名の入力（051b）。タブレットとスマホは指で書いた線、パソコンは電子印鑑。どちらも画面が PNG にして送る */
export interface SignMark {
  kind: "finger" | "stamp";
  /** data:image/png;base64,… */
  png: string;
}
export const MARK_MAX = 200_000;

/** 署名の絵を確かめ、記録に残す形（種類・PNG のハッシュ・PNG）にする。だめなら理由を返す */
export async function markOf(m: unknown): Promise<{ kind: SignMark["kind"]; sha256: string; png: string } | string> {
  const x = m as Partial<SignMark> | null;
  if (!x || (x.kind !== "finger" && x.kind !== "stamp")) return "署名の入力（指か電子印鑑）が無い";
  if (typeof x.png !== "string" || !x.png.startsWith("data:image/png;base64,") || x.png.length > MARK_MAX) return "署名の絵が PNG ではないか、大きすぎる";
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(x.png.slice(22)), (ch) => ch.charCodeAt(0));
  } catch {
    return "署名の絵が base64 で読めない";
  }
  if (!(bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return "署名の絵が PNG ではない";
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
  return { kind: x.kind, sha256: sha, png: x.png };
}

export interface SignPayload {
  version: number;
  signed_at: string;
  content_sha256: string;
  opened_at: string | null;
  /** 開いてから署名までの分（切り上げ）。開いた記録が無ければ null */
  minutes: number | null;
  /** 署名の入力（051b） */
  mark: { kind: SignMark["kind"]; sha256: string; png: string };
}

export type SignResult = { ok: true; payload: SignPayload } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

export async function signCard(db: D1Database, tenantId: string, id: string, person: Person | null, version: unknown, mark: unknown, now = new Date()): Promise<SignResult> {
  if (person?.role !== "supervisor") return { ok: false, status: 403, error: "署名は監修者だけ" };
  const r = await getCard(db, tenantId, id);
  if (!r) return { ok: false, status: 404, error: "カードが無い" };
  if (version !== r.version) return { ok: false, status: 409, error: `署名する版が今の版（${r.version}）と違う。読み直して` };
  if (r.status !== "ok") return { ok: false, status: 409, error: `OK のカードだけに署名できる（今は ${r.status}）` };
  const ev = await currentEvidence(db, tenantId, r);
  if (!ev) return { ok: false, status: 409, error: "確認待ち: 確かめる AI の証拠が無い" };
  if (ev.dangerous) return { ok: false, status: 409, error: "危険の印: 直して確かめ直すまで署名できない" };
  const m = await markOf(mark);
  if (typeof m === "string") return { ok: false, status: 400, error: m };
  const actor = actorOf(person);
  const open = await db.prepare("SELECT opened_at FROM card_opens WHERE tenant_id = ? AND card_id = ? AND version = ? AND actor = ?").bind(tenantId, r.id, r.version, actor).first<{ opened_at: string }>();
  const payload: SignPayload = {
    version: r.version,
    signed_at: now.toISOString(),
    content_sha256: await contentHash(r.body),
    opened_at: open?.opened_at ?? null,
    minutes: open ? Math.max(1, Math.ceil((now.getTime() - Date.parse(open.opened_at)) / 60000)) : null,
    mark: m,
  };
  // 先に状態を移す（同じ版・OK のときだけ）。重なったら記録を足さない
  const res = await db.prepare("UPDATE cards SET status = 'signed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND status = 'ok' AND version = ?").bind(r.id, tenantId, r.version).run();
  if (!res.meta.changes) return { ok: false, status: 409, error: "ほかの操作と重なった。読み直して" };
  await appendAudit(db, tenantId, { card_id: r.id, kind: "sign", actor, payload });
  return { ok: true, payload };
}

/** 最後の署名と、今の中身のハッシュが合うか（署名のあとの書き換えが分かる） */
export async function signatureOf(db: D1Database, tenantId: string, r: CardRow) {
  const row = await db
    .prepare("SELECT actor, payload FROM audit_log WHERE tenant_id = ? AND card_id = ? AND kind = 'sign' ORDER BY created_at DESC, n DESC LIMIT 1")
    .bind(tenantId, r.id)
    .first<{ actor: string; payload: string }>();
  const now = await contentHash(r.body);
  if (!row) return { signed: false as const, content_sha256: now };
  const p = JSON.parse(row.payload) as SignPayload;
  return { signed: true as const, by: row.actor, ...p, content_sha256_now: now, matches: p.content_sha256 === now && p.version === r.version };
}
