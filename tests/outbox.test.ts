// 送れていない答えの置き場: 4xx は止めて理由を残し、5xx と通信切れだけ送り直す
import { describe, expect, it } from "vitest";
import { drainOutbox, isFinalError, retryDelay } from "../src/client/trial/outbox";

const fail = (status?: number, message = "x") => Object.assign(new Error(message), status === undefined ? {} : { status });

describe("outbox", () => {
  it("409 は届いている扱い、400・403 は止めて理由を残し、500 と通信切れは送り直しに回す", async () => {
    const items = ["ok", "dup", "bad", "deny", "boom", "net"];
    const send = async (e: string) => {
      if (e === "dup") throw fail(409);
      if (e === "bad") throw fail(400, "答えが空");
      if (e === "deny") throw fail(403, "PIN が違う");
      if (e === "boom") throw fail(500);
      if (e === "net") throw new TypeError("Failed to fetch");
    };
    const r = await drainOutbox(items, send);
    expect(r.delivered).toEqual(["ok", "dup"]);
    expect([...r.blocked]).toEqual([["bad", "答えが空"], ["deny", "PIN が違う"]]);
    expect(r.retry).toBe(true);
  });
  it("止めたものは次の回で送らない", async () => {
    let calls = 0;
    const skip = new Map([["bad", "答えが空"]]);
    const r = await drainOutbox(["bad"], async () => void calls++, skip);
    expect(calls).toBe(0);
    expect(r.blocked.get("bad")).toBe("答えが空");
    expect(r.retry).toBe(false);
  });
  it("408・429 は待てば通るので送り直す。間隔は伸びて 1 分で止まる", () => {
    expect(isFinalError(fail(429))).toBe(false);
    expect(isFinalError(fail(408))).toBe(false);
    expect(isFinalError(fail(404))).toBe(true);
    expect(isFinalError(fail(503))).toBe(false);
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([4000, 8000, 16000, 32000, 60000]);
  });
});
