// 用語表とカードの「言葉」の欄の照合（056）。食い違いを 1 件ずつ返す。
// ① 用語の日本語（読み仮名を除いたもの、か読み仮名）が、そのカードの文か「言葉」の欄に出てくる
// ② 用語のベトナム語の言い方（「/」「,」で区切った候補のどれか。括弧の中は除く）が、そのカードの「言葉」の欄のベトナム語に出てくる
// ③ 同じ日本語の用語に、カードによって違うベトナム語が付いていない
import type { CardBody } from "../card";

export interface GlossaryRow {
  ja: string;
  vi: string;
  card_id: string;
}

export interface Mismatch {
  kind: "ja" | "vi" | "differs";
  ja: string;
  card_id: string;
  detail: string;
}

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const lower = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ");

/** 「体調不良（たいちょうふりょう）」→ 本体「体調不良」と読み「たいちょうふりょう」 */
export function splitJa(ja: string): { base: string; reading: string | null } {
  const m = ja.normalize("NFKC").match(/^(.*?)\(([^)]*)\)(.*)$/);
  if (!m) return { base: squash(ja), reading: null };
  return { base: squash(m[1] + m[3]), reading: squash(m[2]) };
}

/** 「bút thử điện / máy dò điện áp」→ ["bút thử điện", "máy dò điện áp"]。括弧の中は除く */
export function viOptions(vi: string): string[] {
  return vi
    .normalize("NFC")
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .split(/[\/,、]/)
    .map((x) => lower(x).trim())
    .filter(Boolean);
}

export function checkGlossary(cards: { id: string; body: CardBody }[], rows: GlossaryRow[]): Mismatch[] {
  const out: Mismatch[] = [];
  const byId = new Map(cards.map((c) => [c.id, c.body]));
  for (const r of rows) {
    const body = byId.get(r.card_id);
    if (!body) continue;
    const jaText = squash([...body.statements.map((s) => s.text), body.rule, body.why, body.words?.ja ?? ""].join("\n"));
    const { base, reading } = splitJa(r.ja);
    if (!jaText.includes(base) && !(reading && jaText.includes(reading))) out.push({ kind: "ja", ja: r.ja, card_id: r.card_id, detail: "カードの文にも「言葉」の欄にも出てこない" });
    const viText = lower(body.words?.vi ?? "");
    if (!viOptions(r.vi).some((o) => viText.includes(o))) out.push({ kind: "vi", ja: r.ja, card_id: r.card_id, detail: `「${r.vi}」が「言葉」の欄のベトナム語に出てこない` });
  }
  const byJa = new Map<string, GlossaryRow[]>();
  for (const r of rows) {
    const k = splitJa(r.ja).base;
    byJa.set(k, [...(byJa.get(k) ?? []), r]);
  }
  for (const [k, rs] of byJa) {
    const vis = [...new Set(rs.map((r) => r.vi.normalize("NFC").trim()))];
    if (vis.length > 1) out.push({ kind: "differs", ja: k, card_id: rs.map((r) => r.card_id).join(","), detail: `カードによってベトナム語が違う: ${vis.join(" ／ ")}` });
  }
  return out;
}
