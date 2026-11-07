import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addCompanyWords } from "./company-words";
import { signRole } from "./people";

// 会社の言葉の画面の口（11/7）: 監修者だけが一覧を見られ、消せる。ほかの役割と役割なしは 403、ほかの会社の言葉は見えない・消せない
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const as = async (r: "supervisor" | "author" | "trainer" | "newhire" | null, tenant = "practice") =>
  ({ "content-type": "application/json", ...(r ? { "x-role": await signRole("test-secret", tenant, { role: r, slot: 1 }) } : {}) }) as Record<string, string>;
const url = "/api/t/practice/words";
const del = async (who: Parameters<typeof as>[0], body: unknown) => call(url, { method: "DELETE", headers: await as(who), body: JSON.stringify(body) });

describe("会社の言葉の口", () => {
  it("監修者は 200 で一覧を見られ、ほかの役割と役割なしは 403", async () => {
    await addCompanyWords(env.DB, "practice", [{ kind: "rephrase", phrase: "ブレーカー", prefer: "主幹" }], "edit", "c1");
    const ok = await call(url, { headers: await as("supervisor") });
    expect(ok.status).toBe(200);
    const { words } = (await ok.json()) as { words: { kind: string; phrase: string; prefer: string; hits: number }[] };
    expect(words).toContainEqual(expect.objectContaining({ kind: "rephrase", phrase: "ブレーカー", prefer: "主幹", hits: 1 }));
    for (const who of ["author", "trainer", "newhire", null] as const) {
      expect((await call(url, { headers: await as(who) })).status, String(who)).toBe(403);
      expect((await del(who, { kind: "rephrase", phrase: "ブレーカー", prefer: "主幹" })).status, `del ${who}`).toBe(403);
    }
    // 403 のときは消えていない
    expect((await env.DB.prepare("SELECT count(*) AS n FROM company_words WHERE tenant_id = 'practice' AND phrase = 'ブレーカー'").first<{ n: number }>())!.n).toBe(1);
  });

  it("消したら一覧から消える。同じ行をもう一度消すと 404、種類が違えば 400", async () => {
    await addCompanyWords(env.DB, "practice", [{ kind: "avoid", phrase: "絶対に", prefer: "" }], "edit", "c2");
    expect((await del("supervisor", { kind: "avoid", phrase: "絶対に", prefer: "" })).status).toBe(200);
    const { words } = (await (await call(url, { headers: await as("supervisor") })).json()) as { words: { phrase: string }[] };
    expect(words.map((w) => w.phrase)).not.toContain("絶対に");
    expect((await del("supervisor", { kind: "avoid", phrase: "絶対に", prefer: "" })).status).toBe(404);
    expect((await del("supervisor", { kind: "x", phrase: "絶対に", prefer: "" })).status).toBe(400);
    expect((await del("supervisor", { kind: "avoid", phrase: 1, prefer: "" })).status).toBe(400);
  });

  it("ほかの会社の言葉は見えず、消せない", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name) VALUES ('words-other', 'demo', 'ほかの会社')").run();
    await addCompanyWords(env.DB, "words-other", [{ kind: "call", phrase: "他社の言葉", prefer: "từ khác" }], "glossary", "c3");
    const { words } = (await (await call(url, { headers: await as("supervisor") })).json()) as { words: { phrase: string }[] };
    expect(words.map((w) => w.phrase)).not.toContain("他社の言葉");
    expect((await del("supervisor", { kind: "call", phrase: "他社の言葉", prefer: "từ khác" })).status).toBe(404);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM company_words WHERE tenant_id = 'words-other'").first<{ n: number }>())!.n).toBe(1);
  });
});
