import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { signRole } from "./people";

// ○× の組（093a）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => call(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const newCard = async (tenant = "practice") => ((await (await post(`/api/t/${tenant}/cards`, { card: sampleCard() })).json()) as { id: string }).id;

describe("○× の組", () => {
  it("○ と × の 2 枚を 1 組に結び、一覧に出る", async () => {
    const [good, bad] = [await newCard(), await newCard()];
    expect((await post("/api/t/practice/pairs", { good, bad })).status).toBe(201);
    const list = (await (await call("/api/t/practice/pairs")).json()) as { pairs: { good: string; bad: string }[] };
    expect(list.pairs).toContainEqual(expect.objectContaining({ good, bad }));
  });

  it("同じカード・無いカード・別の組に入ったカード・ほかのテナントのカードは結べない", async () => {
    const [a, b, c] = [await newCard(), await newCard(), await newCard()];
    expect((await post("/api/t/practice/pairs", { good: a, bad: a })).status).toBe(400);
    expect((await post("/api/t/practice/pairs", { good: a, bad: "nope" })).status).toBe(404);
    expect((await post("/api/t/practice/pairs", { good: a, bad: b })).status).toBe(201);
    expect((await post("/api/t/practice/pairs", { good: c, bad: b })).status).toBe(409);
    expect((await post("/api/t/practice/pairs", { good: a, bad: c })).status).toBe(409);
    const other = await newCard("demo");
    expect((await post("/api/t/practice/pairs", { good: c, bad: other })).status).toBe(404);
  });

  it("新入社員の役では結べない", async () => {
    const [good, bad] = [await newCard(), await newCard()];
    const role = await signRole(env.SESSION_SECRET, "practice", { role: "newhire", slot: 1 });
    expect((await post("/api/t/practice/pairs", { good, bad }, { "x-role": role })).status).toBe(403);
  });
});
