// 監査の記録（020）。1 枚のカードについて ①元の文のどこから ②作る AI が何をしたか ③確かめる AI の判定と理由
// ④人が直した内容と理由 ⑤誰がいつどの版に署名したか を、追記だけの 1 本の記録で順に追う。
// 各行は 1 つ前の行のハッシュを含めてハッシュを取る（ハッシュの連鎖）。途中を書き換えるか消すと検証が落ちる。

/** 記録の種類。①〜⑤ と、状態の移り・AI 下書きの判定・消したことの印 */
export const AUDIT_KINDS = ["source", "make", "verify", "edit", "sign", "status", "ai_draft", "erase"] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** ①〜⑤ の番号（画面で順に並べるため） */
export const AUDIT_STEP: Partial<Record<AuditKind, number>> = { source: 1, make: 2, verify: 3, edit: 4, sign: 5 };

export interface AuditEntry {
  tenant_id: string;
  chain: string;
  n: number;
  card_id: string | null;
  kind: AuditKind;
  /** 誰が（役割か仕組みの名前） */
  actor: string;
  payload: unknown;
  created_at: string;
  prev_hash: string;
  hash: string;
}

/** 連鎖の最初の行の prev_hash */
export const GENESIS = "0".repeat(64);

/** キーを並べた JSON（同じ中身なら同じ文字列） */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type AuditDraft = Omit<AuditEntry, "hash">;

export const entryHash = (e: AuditDraft) =>
  sha256Hex(canonical({ tenant_id: e.tenant_id, chain: e.chain, n: e.n, card_id: e.card_id, kind: e.kind, actor: e.actor, payload: e.payload, created_at: e.created_at, prev_hash: e.prev_hash }));

/** 1 本の連鎖（n の順）を確かめる。壊れていたら最初に壊れた n と理由を返す */
export async function verifyChain(rows: AuditEntry[]): Promise<{ ok: true; count: number } | { ok: false; at: number; reason: string }> {
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.n !== i + 1) return { ok: false, at: i + 1, reason: "行が抜けている" };
    if (r.prev_hash !== prev) return { ok: false, at: r.n, reason: "前の行のハッシュと合わない" };
    if ((await entryHash(r)) !== r.hash) return { ok: false, at: r.n, reason: "中身が書き換えられている" };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
