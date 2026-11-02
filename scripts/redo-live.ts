// その 1 枚だけ作り直す（044b）を、手元の Worker（鍵は .dev.vars）で本物の API に 1 回流す。
// 見本のカードを作り、1 コマ目の盤を枠で囲んだ依頼を ④ に残し、作り直しを呼ぶ。費用は手元の D1 の呼び出しの記録から読む。
//
//   npx tsx scripts/redo-live.ts [http://localhost:5179]
import { sampleCard } from "../tests/fixtures/card";

const base = `${process.argv[2] ?? "http://localhost:5179"}/api/t/practice/cards`;
const post = async (path: string, body: unknown) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const card = sampleCard();
const { id } = (await post("", { card })) as { id: string };
const { n } = (await post(`/${id}/fix`, { frame: 0, box: { x: 0.66, y: 0.52, w: 0.18, h: 0.16 }, text: "盤をもう少し人に近づけて、少し大きくしたい" })) as { n: number };
const t0 = Date.now();
const out = (await post(`/${id}/redo`, { n })) as { version: number; body: typeof card; redo: { parts: string[]; count: number; left: number } };
const sec = (Date.now() - t0) / 1000;
const k = (b: typeof card) => (b.motion.kind === "keyframes" ? b.motion.json.keyframes[0] : null)!;
console.log(`カード ${id}・版 ${out.version}・選んだ部品 ${out.redo.parts.join(",")}・${sec.toFixed(1)} 秒`);
console.log(`盤 前 x=${k(card).props[1].x} y=${k(card).props[1].y} size=${k(card).props[1].size} → 後 x=${k(out.body).props[1].x} y=${k(out.body).props[1].y} size=${k(out.body).props[1].size}`);
console.log(`人と検電器は元のまま: ${JSON.stringify(k(card).figures) === JSON.stringify(k(out.body).figures) && JSON.stringify(k(card).props[0]) === JSON.stringify(k(out.body).props[0])}`);
