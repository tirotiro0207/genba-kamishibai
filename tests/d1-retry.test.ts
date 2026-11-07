import { describe, expect, it } from "vitest";
import { isRetrySafe } from "../src/node/d1-node";

// 本番の D1 に送り直してよい文か（二重に書かない文だけ）
describe("isRetrySafe", () => {
  it("SELECT は送り直してよい", () => {
    expect(isRetrySafe("SELECT id FROM cards WHERE tenant = 'a'")).toBe(true);
  });

  it("WHERE 付きで、前の値から足し引きしない UPDATE は送り直してよい", () => {
    expect(isRetrySafe("UPDATE x SET state = 1 WHERE a = 2")).toBe(true);
  });

  it("前の値に足す UPDATE は送り直さない", () => {
    expect(isRetrySafe("UPDATE night_drafts SET attempts = attempts + 1 WHERE id = 'r1'")).toBe(false);
  });

  it("INSERT・WHERE の無い UPDATE・2 文は送り直さない", () => {
    expect(isRetrySafe("INSERT INTO x (a) VALUES (1)")).toBe(false);
    expect(isRetrySafe("UPDATE x SET state = 1")).toBe(false);
    expect(isRetrySafe("SELECT 1;\nDELETE FROM x WHERE a = 1")).toBe(false);
  });
});
