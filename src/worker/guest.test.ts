import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "./index";

// ゲストで動作確認する（11/7）。本番の公開の置き場（PUBLIC_DEMO）でも、ゲストの置き場は作る側の操作が通り、ほかの練習用は見るだけのまま
const pub = (path: string, init?: RequestInit, ip = "203.0.113.7") => app.request(path, { ...init, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(init?.headers ?? {}) } }, { ...env, PUBLIC_DEMO: "1" });

describe("ゲストの置き場（11/7）", () => {
  it("置き場を作って作者の役で入り、公開の置き場でもチャットを始められる", async () => {
    const g = (await (await pub("/api/guest", { method: "POST" }, "203.0.113.10")).json()) as { tenant: string };
    expect(g.tenant).toMatch(/^guest-[0-9a-f]{12}$/);
    const { token } = (await (await pub(`/api/t/${g.tenant}/login`, { method: "POST", body: JSON.stringify({ role: "author", slot: 1 }) })).json()) as { token: string };
    const chat = await pub(`/api/t/${g.tenant}/chats`, { method: "POST", body: "{}", headers: { "x-role": token } });
    expect(chat.status).toBe(201);
    // ゲストでない練習用は、公開の置き場では今までどおり見るだけ
    expect((await pub("/api/t/practice/chats", { method: "POST", body: "{}" })).status).toBe(403);
  });

  it("置き場を作るのは同じ所から 1 日 5 回まで", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 5; i++) expect((await pub("/api/guest", { method: "POST" }, ip)).status).toBe(201);
    expect((await pub("/api/guest", { method: "POST" }, ip)).status).toBe(429);
  });

  it("Claude を呼ぶ口は同じ所から 1 日 20 回まで数える", async () => {
    const ip = "203.0.113.30";
    const g = (await (await pub("/api/guest", { method: "POST" }, ip)).json()) as { tenant: string };
    // 中身の無い送信（400）でも、呼ぶ口として数える
    for (let i = 0; i < 20; i++) expect((await pub(`/api/t/${g.tenant}/extract`, { method: "POST", body: "{}" }, ip)).status).not.toBe(429);
    expect((await pub(`/api/t/${g.tenant}/extract`, { method: "POST", body: "{}" }, ip)).status).toBe(429);
  });
});
