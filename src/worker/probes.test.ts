import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { OPEN_PROBES, probePath } from "../shared/probes";
import app from "./index";

// 本番の見回りの口（src/shared/probes.ts）の期待の番号を、手元の Worker（公開の置き場の設定）で確かめる。見回りが本番で NG を出す前に、期待が間違っていないことを見る
describe("本番の見回りの口の一覧", () => {
  // 本番には会社のテナントがある。手元の試験の置き場にも作っておく
  beforeAll(async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO tenants (id, kind, name, pin_hash) VALUES ('company', 'company', '会社', 'aa:bb')").run();
  });
  for (const p of OPEN_PROBES) {
    it(p.name, async () => {
      const init: RequestInit = { method: p.method, headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: p.body === undefined ? undefined : JSON.stringify(p.body) };
      const res = await app.request(probePath(p), init, { ...env, PUBLIC_DEMO: "1" });
      expect(p.status, `${p.method} ${probePath(p)} は ${res.status}`).toContain(res.status);
    });
  }
});
