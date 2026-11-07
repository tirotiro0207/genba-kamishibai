import { describe, expect, it } from "vitest";
import { OPEN_PROBES } from "../src/shared/probes";
import { runProbes } from "../scripts/smoke-prod";

// 本番の見回り（028b）の口の一覧。本番には流さず、作りものの fetch で、期待の番号を見分けられることと、MCP・ゲスト・採点・アセット・朝礼を含むことを確かめる
describe("本番の見回りの口", () => {
  it("採点・ゲスト・アセット・朝礼・MCP の口を含み、書き込む口は閉じていることを期待する", () => {
    const joined = OPEN_PROBES.map((p) => p.path).join(" ");
    for (const part of ["/scoring", "guest-", "/assets", "/issue/morning", "/mcp/"]) expect(joined).toContain(part);
    for (const p of OPEN_PROBES.filter((x) => x.method === "POST" && !x.path.startsWith("/mcp/"))) expect(p.status).toEqual([403]);
  });

  it("期待の番号と違えば NG にし、demo 以外のテナントには触らない", async () => {
    const urls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => (urls.push(url), new Response("{}", { status: url.includes("/scoring/translate") ? 200 : OPEN_PROBES.find((p) => p.method === init?.method && url.endsWith(p.path.replace("TENANT", "demo")))?.status[0] ?? 500 }))) as unknown as typeof fetch;
    const r = await runProbes("https://x.test", OPEN_PROBES, fake);
    expect(r.filter((x) => !x.ok).map((x) => x.name)).toEqual([OPEN_PROBES.find((p) => p.path.endsWith("/scoring/translate"))!.name]);
    expect(urls.every((u) => u.startsWith("https://x.test/"))).toBe(true);
    expect(urls.some((u) => u.includes("/t/company/"))).toBe(false);
  });
});
