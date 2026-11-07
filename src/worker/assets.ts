// アセット（小物・服・表情）の差し替えの API（11/7 作者「アセットが見れるところ・プロンプトで編集・画像を添付して直す」。服と表情も同じ口）。/api/t/:tenant/assets。
// 作者か監修者が、アセット 1 つに「直したいこと」を書き（現場の写真や手描きを添えてもよい）、Claude に直した絵を作らせる。
// 小物は SVG 1 枚、服は 3 つの向きの SVG（胴の座標）、表情は決まった部品の組み合わせ（JSON）。大元の決まりは shared/picto/asset-rules.ts
// 作った絵は版として追記だけで残し、「この絵にする」でそのテナントの差し替えに決める。元の絵や前の版にいつでも戻せる。
// 差し替えは署名済みのカードの見た目も変えるので、決めるのは作者か監修者だけ。教育担当は見るだけ。新入社員は差し替えの絵を読むだけ
import { Hono } from "hono";
import { guardedCall } from "../shared/claude";
import { type AssetDef, ASSET_LIST, assetDef, faceBaseJson, GROUP_JA, wearPromptSvgs } from "../shared/picto/asset-catalog";
import { BROW_Y, MOUTH_WIDTH, MOUTH_WIDTH_MAX, normalizeRig, RIG_EYES, RIG_MOUTH, stringifyFace, stringifyWear, VIEWS, wearFrame } from "../shared/picto/asset-rules";
import { cleanAssetSvg } from "../shared/picto/prop-override";
import { propBaseSquareSvg } from "../shared/picto/prop-preview";
import { D1CallLog } from "./api-log";
import { claudeClient, dayBudget } from "./claude-client";
import type { Env } from "./env";
import type { PeopleVars } from "./people";
import { actorOf } from "./sign";

export const assets = new Hono<{ Bindings: Env; Variables: PeopleVars }>();

/** 絵を直すモデル。SVG の形の細かさは上のモデルのほうがよい（1 回の上限 1 USD の中に収まる） */
export const ASSET_MODEL = "claude-opus-5-5";
/** 表情の組み合わせを選ぶのは SVG を描くより軽い仕事なので、下のモデルで足りる */
export const ASSET_FACE_MODEL = "claude-sonnet-5-5";
const IMAGE_MAX = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const PROMPT_MAX = 2000;

type Who = "edit" | "view" | "read" | "none";
/** 作者・監修者は直して決める。教育担当は見るだけ。新入社員は差し替えの絵を読むだけ（カードを描くため） */
function who(c: { var: PeopleVars }): Who {
  const r = c.var.person?.role;
  if (r === "author" || r === "supervisor") return "edit";
  if (r === "trainer") return "view";
  if (r === "newhire") return "read";
  // 練習用・架空の会社で役割を選ばずに来たときは見るだけ
  return c.var.tenant.kind === "company" ? "none" : "view";
}

interface VersionRow {
  seq: number;
  kind: string;
  svg: string;
  prompt: string;
  image_key: string | null;
  from_seq: number | null;
  actor: string;
  created_at: string;
}

/** 小物ごとに今使っている版（最後の行）。元の絵に戻したものは入らない */
async function activeMap(db: D1Database, tenantId: string): Promise<Map<string, VersionRow>> {
  const { results } = await db
    .prepare(
      "SELECT v.seq, v.kind, v.svg, v.prompt, v.image_key, v.from_seq, v.actor, v.created_at FROM asset_active a JOIN asset_versions v ON v.seq = a.version_seq WHERE a.tenant_id = ?1 AND a.seq IN (SELECT max(seq) FROM asset_active WHERE tenant_id = ?1 GROUP BY kind)",
    )
    .bind(tenantId)
    .all<VersionRow>();
  return new Map(results.map((r) => [r.kind, r]));
}

/**
 * 署名済みのカードのうち、そのアセットを使っている枚数（差し替えると見た目が変わる枚数）。
 * 小物は body の "kind"、表情は body の "expression"（face_… の名前で数える）。服は数え方が決まっていないので数えない
 */
async function signedUses(db: D1Database, tenantId: string): Promise<Map<string, number>> {
  const { results } = await db.prepare("SELECT body FROM cards WHERE tenant_id = ? AND status = 'signed'").bind(tenantId).all<{ body: string }>();
  const out = new Map<string, number>();
  for (const r of results) {
    const kinds = new Set([...r.body.matchAll(/"kind"\s*:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
    for (const m of r.body.matchAll(/"expression"\s*:\s*"([a-z]+)"/g)) kinds.add(`face_${m[1]}`);
    for (const k of kinds) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** 一覧: 小物・服・表情の種類（group と画面の名前つき）・今の差し替え・版の数・使っている署名済みのカードの枚数（服は数えないので null） */
assets.get("/", async (c) => {
  const w = who(c);
  if (w === "none" || w === "read") return c.json({ error: "アセットは作る側の役割で見る" }, 403);
  const [active, uses, counts] = await Promise.all([
    activeMap(c.env.DB, c.var.tenant.id),
    signedUses(c.env.DB, c.var.tenant.id),
    c.env.DB.prepare("SELECT kind, count(*) AS n FROM asset_versions WHERE tenant_id = ? GROUP BY kind").bind(c.var.tenant.id).all<{ kind: string; n: number }>(),
  ]);
  const n = new Map(counts.results.map((r) => [r.kind, r.n]));
  return c.json({
    can_edit: w === "edit",
    groups: GROUP_JA,
    assets: ASSET_LIST.map(({ kind, group, name }) => {
      const a = active.get(kind);
      return { kind, group, name, active: a ? { seq: a.seq, svg: a.svg } : null, versions: n.get(kind) ?? 0, signed: group === "wear" ? null : (uses.get(kind) ?? 0) };
    }),
  });
});

/** 今決まっている差し替えだけ（カードを描く前に読み込む）。役割の誰でも読める */
assets.get("/active", async (c) => {
  if (who(c) === "none") return c.json({ error: "役割で入ってください" }, 403);
  const active = await activeMap(c.env.DB, c.var.tenant.id);
  return c.json({ overrides: Object.fromEntries([...active].map(([k, v]) => [k, v.svg])) });
});

/** 版の一覧（新しい順）と、今使っている版 */
assets.get("/:kind/versions", async (c) => {
  const w = who(c);
  if (w === "none" || w === "read") return c.json({ error: "アセットは作る側の役割で見る" }, 403);
  const kind = c.req.param("kind");
  if (!assetDef(kind)) return c.json({ error: "知らないアセット" }, 404);
  const { results } = await c.env.DB.prepare("SELECT seq, kind, svg, prompt, image_key, from_seq, actor, created_at FROM asset_versions WHERE tenant_id = ? AND kind = ? ORDER BY seq DESC").bind(c.var.tenant.id, kind).all<VersionRow>();
  const last = await c.env.DB.prepare("SELECT version_seq, actor, created_at FROM asset_active WHERE tenant_id = ? AND kind = ? ORDER BY seq DESC LIMIT 1").bind(c.var.tenant.id, kind).first<{ version_seq: number | null; actor: string; created_at: string }>();
  return c.json({ kind, active: last?.version_seq ?? null, versions: results.map((r) => ({ ...r, image: !!r.image_key, image_key: undefined })) });
});

/** 添付した画像を見る */
assets.get("/:kind/image/:seq", async (c) => {
  const w = who(c);
  if (w === "none" || w === "read") return c.json({ error: "アセットは作る側の役割で見る" }, 403);
  const r = await c.env.DB.prepare("SELECT image_key FROM asset_versions WHERE tenant_id = ? AND kind = ? AND seq = ?").bind(c.var.tenant.id, c.req.param("kind"), Number(c.req.param("seq"))).first<{ image_key: string | null }>();
  const obj = r?.image_key ? await c.env.FILES.get(r.image_key) : null;
  if (!obj) return c.json({ error: "画像が無い" }, 404);
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, no-store" } });
});

const FIX_SCHEMA = {
  type: "object",
  properties: { svg: { type: "string" }, note: { type: "string" } },
  required: ["svg", "note"],
  additionalProperties: false,
};
const WEAR_SCHEMA = {
  type: "object",
  properties: { front: { type: "string" }, quarter: { type: "string" }, side: { type: "string" }, note: { type: "string" } },
  required: ["front", "quarter", "side", "note"],
  additionalProperties: false,
};
const FACE_SCHEMA = {
  type: "object",
  properties: {
    face: {
      type: "object",
      properties: {
        eyes: { type: "string", enum: [...RIG_EYES] },
        brows: {
          anyOf: [
            { type: "string", enum: ["own", "raised"] },
            { type: "object", properties: { inner: { type: "number" }, outer: { type: "number" } }, required: ["inner", "outer"], additionalProperties: false },
          ],
        },
        mouth: { type: "string", enum: [...RIG_MOUTH] },
        mouthWidth: { type: "number" },
      },
      required: ["eyes", "brows", "mouth", "mouthWidth"],
      additionalProperties: false,
    },
    note: { type: "string" },
  },
  required: ["face", "note"],
  additionalProperties: false,
};

const SYSTEM_COMMON = [
  "絵柄の決まり: 縁は黒（#000000）で、今の絵の縁と同じ太さ。塗りは白（#ffffff）と灰色だけ（R=G=B の色。#d9d9d9・#bfbfbf・#8c8c8c・#595959 など）。赤は使わない。角とつなぎ目は丸く（stroke-linejoin と stroke-linecap は round）。",
  "文字・数字・ロゴ・影・グラデーション・画像は描かない。使ってよい要素は g・path・rect・circle・ellipse・line・polyline・polygon だけ。",
  "写真や手描きの画像が付いていれば、その形を手がかりにする。ただし絵柄の決まりは守り、写真のような細かさにはしない。遠くから見て一目で分かる形にする。",
];
export const ASSET_SYSTEM = [
  "安全のピクトグラム（文字の無い絵のカード）に使う小物の絵を、頼まれたとおりに直す。",
  "渡す絵は 0〜100 の正方形（viewBox=\"0 0 100 100\"）に描いた今の絵。直した絵も同じ正方形に、同じ置き方で描く: 床に置く物は正方形の下の辺が床、ほかは正方形の真ん中が置き場所。",
  ...SYSTEM_COMMON,
  "svg には <svg> の外枠を付けずに中身だけを入れる。note には何を直したかを日本語で 1〜2 文で書く。",
].join("\n");

const frameText = (v: (typeof VIEWS)[number]) => {
  const f = wearFrame(v);
  return `x ${f.x}〜${f.x + f.w}・y ${f.y}〜${f.y + f.h}`;
};
export const WEAR_SYSTEM = [
  "安全のピクトグラム（文字の無い絵のカード）の人が着る服の絵を、頼まれたとおりに直す。",
  "服は人の胴の座標で描く。原点が腰で、胴の上の端が y −142、下の端が y 20。向きは front（正面）・quarter（斜め）・side（真横）の 3 つで、3 つとも直す。",
  `渡す 3 枚の絵の viewBox が、その向きで見せる枠: front は ${frameText("front")}、quarter は ${frameText("quarter")}、side は ${frameText("side")}。この座標と枠のまま直す。枠の外は描いても切り落とされる。`,
  "体・腕・脚・顔は元のまま別に描く。直すのは胴の服の層だけ。服の下の体は描かない。",
  "服の主な塗りは、色の名前 TONE のまま fill に書く（その服の明るさに置き換わる）。そのほかの塗りは白か灰色（R=G=B）。",
  "3 つの向きで、同じ服に見えるようにする。真横は胴の幅が片側 30、正面と斜めは片側 46。",
  ...SYSTEM_COMMON,
  "front・quarter・side には、それぞれ <svg> の外枠を付けずに中身だけを入れる。note には何を直したかを日本語で 1〜2 文で書く。",
].join("\n");
export const FACE_SYSTEM = [
  "安全のピクトグラム（文字の無い絵のカード）の人の表情を、頼まれたとおりに直す。",
  "表情は絵ではなく、決まった部品の組み合わせ（face）で決める。顔の形・大きさ・向き・眼鏡・ひげのどれと組んでも成り立つように、この中から選ぶ:",
  `- eyes: ${RIG_EYES.join("・")}。open は顔の部品で選んだ目、closedArc は閉じて上へ丸い弧（喜ぶ）、pinched は強く閉じた「＞ ＜」（痛い）、wide は丸く大きく見開く（驚く）。`,
  `- brows: own（顔の部品で選んだ眉）・raised（丸く上げた眉）、または { inner, outer } の数 2 つ。数は眉の鼻の側の端と外の端の高さ（y）。${BROW_Y[0]}〜${BROW_Y[1]} の間（小さいほど上）。鼻の側を下げると怒り、上げると悲しみ・困る。`,
  `- mouth: ${RIG_MOUTH.join("・")}。smile は笑い、openSmile は開けて笑う、shout はどなる、frown はへの字、flat は横にまっすぐ、smallO は小さい「お」、wave は波、clench は歯を食いしばる。`,
  `- mouthWidth: 口の横幅の倍率。${MOUTH_WIDTH[0]}〜${MOUTH_WIDTH[1]}。1 が今の幅（shout だけは ${MOUTH_WIDTH_MAX.shout} まで）。`,
  "渡す今の組み合わせ（JSON）を、頼まれたとおりに直す。直す所だけ変え、ほかは今のまま。note には何を直したかを日本語で 1〜2 文で書く。",
].join("\n");

/**
 * 1 回に頼む長さの上限。SDK は流し読み（stream）でない呼び出しで 60*60*max/128000 秒が 10 分を超えると、呼ぶ前に止める（約 21,333）。
 * 11/7 本番で服の直しを 24000 にして止まったので、ここで上限にそろえる
 */
export const MAX_TOKENS_NO_STREAM = 21000;

/** Claude を呼ぶ。鍵が無ければ null */
const callClaude = (env: Env, def: AssetDef, system: string, model: string, schema: object, max: number, content: unknown[]) => {
  const client = claudeClient(env);
  if (!client) return null;
  return guardedCall(
    { client, log: new D1CallLog(env.DB), dayBudgetUsd: dayBudget(env) },
    {
      purpose: "app",
      label: def.group === "prop" ? "アセットの直し" : `アセットの直し（${GROUP_JA[def.group]}）`,
      params: {
        model,
        max_tokens: Math.min(max, MAX_TOKENS_NO_STREAM),
        system,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content }],
      } as unknown as Parameters<typeof guardedCall>[1]["params"],
    },
  );
};

/** 直す: 今の絵（差し替えがあればその絵）と、指示と、添付の画像から、Claude に直した絵を作らせて、版として残す（まだ決めない） */
assets.post("/:kind/fix", async (c) => {
  if (who(c) !== "edit") return c.json({ error: "アセットを直すのは作者か監修者" }, 403);
  const kind = c.req.param("kind");
  const def = assetDef(kind);
  if (!def) return c.json({ error: "知らないアセット" }, 404);
  const b = await c.req.json<{ prompt?: unknown; image?: { media_type?: unknown; data?: unknown }; from?: unknown }>().catch(() => ({}) as Record<string, never>);
  const prompt = typeof b.prompt === "string" ? b.prompt.trim().slice(0, PROMPT_MAX) : "";
  if (!prompt) return c.json({ error: "直したいことを書いてください" }, 400);
  let image: { type: string; bytes: Uint8Array; b64: string } | null = null;
  if (b.image) {
    const type = typeof b.image.media_type === "string" ? b.image.media_type : "";
    const data = typeof b.image.data === "string" ? b.image.data : "";
    if (!IMAGE_TYPES[type]) return c.json({ error: "画像は png・jpg・webp" }, 400);
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    if (!bytes.length || bytes.length > IMAGE_MAX) return c.json({ error: "画像は 5 MB まで" }, 400);
    image = { type, bytes, b64: data };
  }
  // 直す元: 指定の版、無ければ今使っている版、それも無ければ元の絵
  const fromSeq = typeof b.from === "number" ? b.from : (await activeMap(c.env.DB, c.var.tenant.id)).get(kind)?.seq ?? null;
  let saved: string | undefined;
  if (fromSeq !== null) {
    const v = await c.env.DB.prepare("SELECT svg FROM asset_versions WHERE tenant_id = ? AND kind = ? AND seq = ?").bind(c.var.tenant.id, kind, fromSeq).first<{ svg: string }>();
    if (!v) return c.json({ error: "直す元の版が無い" }, 400);
    saved = v.svg;
  }
  const content: unknown[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.type, data: image.b64 } });
  const ask = `直してほしいこと:\n${prompt}`;
  let call: ReturnType<typeof callClaude>;
  if (def.group === "wear") {
    const src = wearPromptSvgs(def.garment!, saved);
    const text = VIEWS.map((v) => `${v} の今の絵:\n${src[v]}`).join("\n\n");
    content.push({ type: "text", text: `服の種類: ${kind}（${def.name}）\n\n${text}\n\n${ask}` });
    call = callClaude(c.env, def, WEAR_SYSTEM, ASSET_MODEL, WEAR_SCHEMA, MAX_TOKENS_NO_STREAM, content);
  } else if (def.group === "face") {
    content.push({ type: "text", text: `表情: ${kind}（${def.name}）\n\n今の組み合わせ:\n${faceBaseJson(def.expression!, saved)}\n\n${ask}` });
    call = callClaude(c.env, def, FACE_SYSTEM, ASSET_FACE_MODEL, FACE_SCHEMA, 2000, content);
  } else {
    const current = saved === undefined ? propBaseSquareSvg(kind as never) : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${saved}</svg>`;
    content.push({ type: "text", text: `小物の種類: ${kind}\n\n今の絵:\n${current}\n\n${ask}` });
    call = callClaude(c.env, def, ASSET_SYSTEM, ASSET_MODEL, FIX_SCHEMA, 16000, content);
  }
  if (!call) return c.json({ error: "Claude の鍵が無い" }, 503);
  const msg = await call;
  const out = msg.content.find((x) => x.type === "text");
  let got: Record<string, unknown> = {};
  try {
    got = JSON.parse(out && out.type === "text" ? out.text : "{}") as Record<string, unknown>;
  } catch {
    return c.json({ error: "直した絵を読めなかった" }, 502);
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let svg: string;
  if (def.group === "wear") {
    const shapes = { front: cleanAssetSvg(str(got.front)), quarter: cleanAssetSvg(str(got.quarter)), side: cleanAssetSvg(str(got.side)) };
    if (!shapes.front || !shapes.quarter || !shapes.side) return c.json({ error: "直した服に形が無い向きがあった。指示を変えてもう一度" }, 502);
    svg = stringifyWear(shapes);
  } else if (def.group === "face") {
    const rig = got.face && typeof got.face === "object" ? normalizeRig(got.face) : null;
    if (!rig) return c.json({ error: "直した表情を読めなかった。指示を変えてもう一度" }, 502);
    svg = stringifyFace(rig);
  } else {
    svg = cleanAssetSvg(str(got.svg));
    if (!svg) return c.json({ error: "直した絵に形が無かった。指示を変えてもう一度" }, 502);
  }
  let imageKey: string | null = null;
  if (image) {
    imageKey = `t/${c.var.tenant.id}/assets/${kind}/${crypto.randomUUID()}.${IMAGE_TYPES[image.type]}`;
    await c.env.FILES.put(imageKey, image.bytes, { httpMetadata: { contentType: image.type } });
  }
  const row = await c.env.DB.prepare("INSERT INTO asset_versions (tenant_id, kind, svg, prompt, image_key, from_seq, actor) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq, created_at")
    .bind(c.var.tenant.id, kind, svg, prompt, imageKey, fromSeq, actorOf(c.var.person))
    .first<{ seq: number; created_at: string }>();
  return c.json({ seq: row!.seq, kind, svg, note: str(got.note).slice(0, 400), from: fromSeq }, 201);
});

/** 決める・戻す: version に版の番号を渡すとその版を使う。null なら元の絵に戻す（どちらも追記） */
assets.post("/:kind/choose", async (c) => {
  if (who(c) !== "edit") return c.json({ error: "差し替えを決めるのは作者か監修者" }, 403);
  const kind = c.req.param("kind");
  if (!assetDef(kind)) return c.json({ error: "知らないアセット" }, 404);
  const b = await c.req.json<{ version?: unknown }>().catch(() => ({}) as { version?: unknown });
  const version = b.version === null ? null : Number(b.version);
  if (version !== null) {
    if (!Number.isInteger(version)) return c.json({ error: "version は版の番号か null" }, 400);
    const v = await c.env.DB.prepare("SELECT 1 FROM asset_versions WHERE tenant_id = ? AND kind = ? AND seq = ?").bind(c.var.tenant.id, kind, version).first();
    if (!v) return c.json({ error: "この小物の版ではない" }, 400);
  }
  await c.env.DB.prepare("INSERT INTO asset_active (tenant_id, kind, version_seq, actor) VALUES (?, ?, ?, ?)").bind(c.var.tenant.id, kind, version, actorOf(c.var.person)).run();
  const signed = assetDef(kind)?.group === "wear" ? null : (await signedUses(c.env.DB, c.var.tenant.id)).get(kind) ?? 0;
  return c.json({ kind, active: version, signed }, 201);
});

// 版と記録は追記だけ
assets.on(["PUT", "PATCH", "DELETE"], ["/:kind", "/:kind/*"], (c) => c.json({ error: "アセットの版は追記だけ" }, 405));
