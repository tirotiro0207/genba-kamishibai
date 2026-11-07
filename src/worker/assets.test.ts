import type Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASSET_LIST } from "../shared/picto/asset-catalog";
import { faceSvg, DEFAULT_FACE } from "../shared/picto/avatar";
import { outfitTorso } from "../shared/picto/outfit";
import { cleanAssetSvg, placeOverride, propOverride, sanitizePropSvg, setPropOverrides, clearPropOverrides } from "../shared/picto/prop-override";
import { propPreviewSvg } from "../shared/picto/prop-preview";
import { propsSvg } from "../shared/picto/props";
import { ASSET_FACE_MODEL, ASSET_MODEL, assets } from "./assets";
import { setClientFactory } from "./claude-client";
import type { Env } from "./env";
import { type PeopleVars, personGuard, signRole } from "./people";
import { tenantGuard } from "./tenant";

// 本体の入口（index.ts）に付ける前でも確かめられるように、同じ関所を並べた小さな入口で呼ぶ
const app = new Hono<{ Bindings: Env; Variables: PeopleVars }>();
app.use("/api/t/:tenant/*", tenantGuard);
app.use("/api/t/:tenant/*", personGuard);
app.route("/api/t/:tenant/assets", assets);
const call = (path: string, init?: RequestInit) => app.fetch(new Request(`http://local${path}`, init), env);
const base = "/api/t/practice/assets";
const as = async (role: "author" | "supervisor" | "trainer" | "newhire") => ({ "x-role": await signRole("test-secret", "practice", { role, slot: 1 }) });
const json = (method: string, body: unknown, h: Record<string, string>): RequestInit => ({ method, headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });

const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
/** 次に Claude の偽物が返す中身（テストごとに差し替える） */
let reply: () => unknown = () => ({ svg: DRAWN, note: "箱を四角にした" });
const DRAWN = '<rect x="20" y="20" width="60" height="60" rx="8" fill="#bfbfbf" stroke="#000000" stroke-width="3" onclick="alert(1)"/><script>alert(1)</script><text x="1" y="1">字</text>';

describe("アセット（小物の差し替え）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          return { model: p.model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply()) }], usage: { input_tokens: 100, output_tokens: 50 } } as unknown as Anthropic.Message;
        },
      },
    })),
  );
  afterAll(() => {
    setClientFactory(null);
    clearPropOverrides();
  });

  it("使ってよい要素と属性だけを残す", () => {
    const s = sanitizePropSvg(DRAWN);
    expect(s).toContain("<rect");
    expect(s).not.toMatch(/script|onclick|<text|字/);
    expect(sanitizePropSvg('<image href="x.png"/><g fill="url(#a)"></g>')).toBe("");
  });

  it("登録した差し替えを、カードの小物の絵に使う。身に着けた物は差し替えない", () => {
    setPropOverrides({ toolbox: '<rect x="0" y="0" width="100" height="100" fill="#bfbfbf" stroke="#000000"/>' });
    const out = propsSvg([{ kind: "toolbox", at: { x: 0.5, y: 0.9 }, size: 0.2 }], [], 500);
    expect(out).toContain('data-override="toolbox"');
    expect(propPreviewSvg("toolbox", null)).not.toContain("data-override");
    expect(propOverride("toolbox")).toBeTruthy();
    // 床に置く物は正方形の下の真ん中が置き場所
    expect(placeOverride("<g/>", [100, 150], 100, 1, true)).toContain("translate(100 50)");
    clearPropOverrides();
  });

  it("作者が直して決め、元に戻せる。版は追記だけで残る", async () => {
    const a = await as("author");
    const res = await call(`${base}/toolbox/fix`, json("POST", { prompt: "四角い箱にする", image: { media_type: "image/png", data: btoa("\x89PNG\r\n\x1a\nxx") } }, a));
    expect(res.status).toBe(201);
    const v = (await res.json()) as { seq: number; svg: string; note: string };
    expect(v.svg).toContain("<rect");
    expect(v.svg).not.toContain("script");
    const msg = sent.at(-1)!;
    expect(msg.model).toBe(ASSET_MODEL);
    const content = msg.messages[0].content as { type: string; text?: string }[];
    expect(content[0].type).toBe("image");
    expect(content[1].text).toContain("四角い箱にする");
    expect(content[1].text).toContain('viewBox="0 0 100 100"');

    // 決める前は差し替えに入っていない
    expect(((await (await call(`${base}/active`, { headers: a })).json()) as { overrides: Record<string, string> }).overrides.toolbox).toBeUndefined();
    expect((await call(`${base}/toolbox/choose`, json("POST", { version: v.seq }, a))).status).toBe(201);
    // 新入社員もカードを描くために差し替えを読める
    const nh = await as("newhire");
    expect(((await (await call(`${base}/active`, { headers: nh })).json()) as { overrides: Record<string, string> }).overrides.toolbox).toContain("<rect");
    // 元の絵に戻す
    expect((await call(`${base}/toolbox/choose`, json("POST", { version: null }, a))).status).toBe(201);
    expect(((await (await call(`${base}/active`, { headers: a })).json()) as { overrides: Record<string, string> }).overrides.toolbox).toBeUndefined();
    const vs = (await (await call(`${base}/toolbox/versions`, { headers: a })).json()) as { active: number | null; versions: { seq: number; image: boolean }[] };
    expect(vs.active).toBeNull();
    expect(vs.versions[0]).toMatchObject({ seq: v.seq, image: true });
    expect((await call(`${base}/toolbox/image/${v.seq}`, { headers: a })).status).toBe(200);
    await expect(env.DB.prepare("UPDATE asset_versions SET svg = '' WHERE seq = ?").bind(v.seq).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM asset_active WHERE kind = 'toolbox'").run()).rejects.toThrow(/append only/);
  });

  it("教育担当は見るだけ、新入社員は一覧も見られない。知らない小物・空の指示・ほかの小物の版は断る", async () => {
    const t = await as("trainer");
    expect((await call(base, { headers: t })).status).toBe(200);
    expect((await call(`${base}/toolbox/fix`, json("POST", { prompt: "x" }, t))).status).toBe(403);
    expect((await call(`${base}/toolbox/choose`, json("POST", { version: null }, t))).status).toBe(403);
    expect((await call(base, { headers: await as("newhire") })).status).toBe(403);
    const s = await as("supervisor");
    expect((await call(`${base}/nothing/fix`, json("POST", { prompt: "x" }, s))).status).toBe(404);
    expect((await call(`${base}/toolbox/fix`, json("POST", { prompt: " " }, s))).status).toBe(400);
    const v = (await (await call(`${base}/cone/fix`, json("POST", { prompt: "背を高く" }, s))).json()) as { seq: number };
    expect((await call(`${base}/toolbox/choose`, json("POST", { version: v.seq }, s))).status).toBe(400);
    const list = (await (await call(base, { headers: s })).json()) as { can_edit: boolean; assets: { kind: string; versions: number }[] };
    expect(list.can_edit).toBe(true);
    expect(list.assets.find((x) => x.kind === "cone")?.versions).toBeGreaterThanOrEqual(1);
  });

  it("一覧は小物・服・表情の順で、部類と日本語の名前がつく。服の枚数は数えず、表情は署名済みのカードの expression を数える", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO cards (id, tenant_id, body, status) VALUES (?, 'practice', ?, 'signed')").bind(id, '{"frames":[{"people":[{"expression":"anger"}]}]}').run();
    const s = await as("supervisor");
    const list = (await (await call(base, { headers: s })).json()) as { groups: Record<string, string>; assets: { kind: string; group: string; name: string; signed: number | null }[] };
    expect(list.assets.map((x) => x.kind)).toEqual(ASSET_LIST.map((x) => x.kind));
    expect(list.assets.every((x) => x.name)).toBe(true);
    const order = list.assets.map((x) => x.group);
    expect(order.indexOf("wear")).toBeGreaterThan(order.lastIndexOf("prop"));
    expect(order.indexOf("face")).toBeGreaterThan(order.lastIndexOf("wear"));
    expect(list.assets.find((x) => x.kind === "wear_chef_jacket")).toMatchObject({ group: "wear", signed: null });
    expect(list.assets.find((x) => x.kind === "face_anger")?.signed).toBeGreaterThanOrEqual(1);
    expect(list.assets.find((x) => x.kind === "face_joy")?.signed).toBe(0);
    expect(list.groups).toEqual({ prop: "小物", wear: "服", face: "表情" });
  });

  it("服: 3 つの向きを直し、灰色にして保存し、決めると胴の服の層が入れ替わる。1 つでも形が無い向きがあれば 502", async () => {
    const a = await as("author");
    const red = '<path d="M-40 -140H40V20H-40Z" fill="TONE" stroke="#ff0000" stroke-width="5"/><circle cx="0" cy="-100" r="6" fill="rgb(0,0,255)"/><script>x</script>';
    reply = () => ({ front: red, quarter: red.replace("-140", "-139"), side: red.replace("-140", "-138"), note: "襟を立てた" });
    const res = await call(`${base}/wear_jacket/fix`, json("POST", { prompt: "襟を立てて" }, a));
    expect(res.status).toBe(201);
    const v = (await res.json()) as { seq: number; kind: string; svg: string; note: string };
    const msg = sent.at(-1)!;
    expect(msg.model).toBe(ASSET_MODEL);
    // SDK は流し読みでない呼び出しで約 21,333 を超える長さを、呼ぶ前に止める（11/7 本番で止まった）
    expect(msg.max_tokens).toBeLessThanOrEqual(21333);
    const text = (msg.messages[0].content as { type: string; text?: string }[])[0].text!;
    // 元の 3 つの向きの SVG のコードを、胴の座標と枠の viewBox のまま渡す。服の主な塗りは TONE
    expect(text).toContain('viewBox="-66 -175 132 315"');
    expect(text).toContain('viewBox="-50 -175 100 315"');
    expect(text).toContain('fill="TONE"');
    expect(text).toContain("襟を立てて");
    const saved = JSON.parse(v.svg) as Record<"front" | "quarter" | "side", string>;
    for (const view of ["front", "quarter", "side"] as const) {
      expect(saved[view]).not.toMatch(/script|#ff0000|rgb\(/);
      expect(saved[view]).toContain('fill="TONE"');
      expect([...saved[view].matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].every((m) => m[1].slice(1, 3) === m[1].slice(3, 5) && m[1].slice(3, 5) === m[1].slice(5))).toBe(true);
    }
    expect(saved.quarter).toContain("-139");
    expect((await call(`${base}/wear_jacket/choose`, json("POST", { version: v.seq }, a))).status).toBe(201);
    const nh = await as("newhire");
    const active = ((await (await call(`${base}/active`, { headers: nh })).json()) as { overrides: Record<string, string> }).overrides;
    expect(JSON.parse(active.wear_jacket)).toEqual(saved);
    // 画面は /active をそのまま登録する。登録すると、その服だけ胴の層が入れ替わる（TONE はその服の明るさに）
    setPropOverrides(active);
    const worn = outfitTorso("quarter", { wear: [{ kind: "jacket", tone: "#abc" }, { kind: "polo" }] });
    expect(worn).toContain('id="part_jacket"><svg x="-66"');
    expect(worn).toContain("-139");
    expect(worn).toContain('fill="#abc"');
    expect(worn).not.toContain("TONE");
    expect(worn).toContain('id="part_polo"><rect');
    clearPropOverrides();
    // 直す 2 回目は、いま使っている版の 3 つの向きから始める
    reply = () => ({ front: red, quarter: red, side: red, note: "もう 1 回" });
    await call(`${base}/wear_jacket/fix`, json("POST", { prompt: "もう少し" }, a));
    expect((sent.at(-1)!.messages[0].content as { text?: string }[])[0].text).toContain("-139");
    expect((await call(`${base}/wear_jacket/choose`, json("POST", { version: null }, a))).status).toBe(201);

    // 形が無い向きが 1 つでもあれば 502（空・使えない要素だけ）
    for (const bad of [{ side: "" }, { front: "<script>x</script>" }, { quarter: '<text x="1" y="1">字</text>' }]) {
      reply = () => ({ front: red, quarter: red, side: red, note: "x", ...bad });
      const r = await call(`${base}/wear_coat/fix`, json("POST", { prompt: "長く" }, a));
      expect(r.status).toBe(502);
      expect(((await r.json()) as { error: string }).error).toContain("直した服に形が無い向きがあった");
    }
    expect((await call(`${base}/wear_nothing/fix`, json("POST", { prompt: "x" }, a))).status).toBe(404);
  });

  it("表情: 部品の組み合わせを直し、幅に収めて保存し、決めると顔がその組み合わせで描かれる", async () => {
    const a = await as("author");
    reply = () => ({ face: { eyes: "bogus", brows: { inner: -99, outer: -60 }, mouth: "smallO", mouthWidth: 9 }, note: "口を閉じた" });
    const res = await call(`${base}/face_anger/fix`, json("POST", { prompt: "怒りを弱く、口は閉じて", image: { media_type: "image/png", data: btoa("\x89PNG\r\n\x1a\nxx") } }, a));
    expect(res.status).toBe(201);
    const v = (await res.json()) as { seq: number; svg: string };
    expect(sent.at(-1)!.model).toBe(ASSET_FACE_MODEL);
    const asked = sent.at(-1)!.messages[0].content as { type: string; text?: string }[];
    expect(asked[0].type).toBe("image");
    // 今の怒りの組み合わせから始める
    expect(asked[1].text).toContain('"mouth":"shout"');
    expect(JSON.parse(v.svg)).toEqual({ eyes: "open", brows: { inner: -54, outer: -54 }, mouth: "smallO", mouthWidth: 1.4 });
    expect((await call(`${base}/face_anger/choose`, json("POST", { version: v.seq }, a))).status).toBe(201);
    const active = ((await (await call(`${base}/active`, { headers: a })).json()) as { overrides: Record<string, string> }).overrides;
    expect(active.face_anger).toBe(v.svg);
    const before = faceSvg("front", DEFAULT_FACE, 0, { expression: "anger" });
    const joy = faceSvg("front", DEFAULT_FACE, 0, { expression: "joy" });
    setPropOverrides(active);
    expect(faceSvg("front", DEFAULT_FACE, 0, { expression: "anger" })).not.toBe(before);
    // 差し替えていない表情は今のまま
    expect(faceSvg("front", DEFAULT_FACE, 0, { expression: "joy" })).toBe(joy);
    clearPropOverrides();
    expect(faceSvg("front", DEFAULT_FACE, 0, { expression: "anger" })).toBe(before);

    // 2 回目は、いま使っている版の組み合わせから直す
    reply = () => ({ face: { eyes: "open", brows: "own", mouth: "flat", mouthWidth: 1 }, note: "x" });
    await call(`${base}/face_anger/fix`, json("POST", { prompt: "もう少し" }, a));
    expect((sent.at(-1)!.messages[0].content as { text?: string }[])[0].text).toContain('"mouthWidth":1.4');
    // 組み合わせが読めなければ 502。元に戻す
    reply = () => ({ face: "怒る", note: "x" });
    expect((await call(`${base}/face_sad/fix`, json("POST", { prompt: "x" }, a))).status).toBe(502);
    expect((await call(`${base}/face_anger/choose`, json("POST", { version: null }, a))).status).toBe(201);
    expect((await call(`${base}/face_nothing/fix`, json("POST", { prompt: "x" }, a))).status).toBe(404);
  });

  it("服・表情の choose は、ほかのアセットの版を断り、教育担当と新入社員は決められない。灰色に直す仕上げは小物にもかかる", async () => {
    const a = await as("author");
    reply = () => ({ svg: '<rect x="1" y="1" width="9" height="9" fill="#ff8800" stroke="blue"/>', note: "x" });
    const p = (await (await call(`${base}/cone/fix`, json("POST", { prompt: "色を付けて" }, a))).json()) as { seq: number; svg: string };
    expect(p.svg).not.toMatch(/#ff8800|blue/);
    expect(cleanAssetSvg(p.svg)).toBe(p.svg);
    expect((await call(`${base}/wear_jacket/choose`, json("POST", { version: p.seq }, a))).status).toBe(400);
    expect((await call(`${base}/face_joy/choose`, json("POST", { version: p.seq }, await as("trainer")))).status).toBe(403);
    expect((await call(`${base}/wear_jacket/fix`, json("POST", { prompt: "x" }, await as("newhire")))).status).toBe(403);
  });
});
