import type Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeOverride, propOverride, sanitizePropSvg, setPropOverrides, clearPropOverrides } from "../shared/picto/prop-override";
import { propPreviewSvg } from "../shared/picto/prop-preview";
import { propsSvg } from "../shared/picto/props";
import { ASSET_MODEL, assets } from "./assets";
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
const DRAWN = '<rect x="20" y="20" width="60" height="60" rx="8" fill="#bfbfbf" stroke="#000000" stroke-width="3" onclick="alert(1)"/><script>alert(1)</script><text x="1" y="1">字</text>';

describe("アセット（小物の差し替え）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          sent.push(p);
          return { model: ASSET_MODEL, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ svg: DRAWN, note: "箱を四角にした" }) }], usage: { input_tokens: 100, output_tokens: 50 } } as unknown as Anthropic.Message;
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
});
