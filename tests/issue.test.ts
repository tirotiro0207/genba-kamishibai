import { describe, expect, it } from "vitest";
import { isoWeek, pickSample, reviewerFor, SAMPLE_SIZE } from "../src/shared/issue";

describe("週の抜き取りの決まり（088）", () => {
  it("日本時間の ISO 週で数える（月曜始まり・年またぎ・日本時間の日付変わり）", () => {
    expect(isoWeek(new Date("2026-11-03T03:00:00Z"))).toBe("2026-W45");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2021-01-03T00:00:00Z"))).toBe("2020-W53");
    // 日曜の日本時間 23:30（UTC 14:30）はまだ前の週、月曜の日本時間 0:30（UTC 15:30）から次の週
    expect(isoWeek(new Date("2026-11-01T14:30:00Z"))).toBe("2026-W44");
    expect(isoWeek(new Date("2026-11-01T15:30:00Z"))).toBe("2026-W45");
  });

  const ids = Array.from({ length: 12 }, (_, i) => `card-${i}`);

  it("同じ種と同じカードなら、並びが違っても同じ 2 枚。重ならない", async () => {
    const a = await pickSample(ids, "seed-a");
    expect(a).toHaveLength(SAMPLE_SIZE);
    expect(new Set(a).size).toBe(SAMPLE_SIZE);
    expect(await pickSample([...ids].reverse(), "seed-a")).toEqual(a);
    expect(await pickSample([...ids, ...ids], "seed-a")).toEqual(a);
  });

  it("種が変わると選ばれ方が変わる（全部が同じ 2 枚にはならない）", async () => {
    const picks = new Set<string>();
    for (let i = 0; i < 20; i++) picks.add((await pickSample(ids, `seed-${i}`)).join());
    expect(picks.size).toBeGreaterThan(5);
  });

  it("1 枚以下ならあるだけ。0 枚なら空", async () => {
    expect(await pickSample(["only"], "s")).toEqual(["only"]);
    expect(await pickSample([], "s")).toEqual([]);
  });

  it("見直す人は署名した監修者とは別の監修者", () => {
    expect(reviewerFor("supervisor.1")).toBe("supervisor.2");
    expect(reviewerFor("supervisor.2")).toBe("supervisor.1");
    expect(reviewerFor("trainer.1")).toBeNull();
  });

  it("監修者が 3 人以上でも、署名した人以外の監修者を選ぶ（空のままにしない）", () => {
    const three = ["supervisor.1", "supervisor.2", "supervisor.3"];
    expect(reviewerFor("supervisor.3", three)).toBe("supervisor.1");
    expect(reviewerFor("supervisor.1", three)).toBe("supervisor.2");
    expect(reviewerFor("supervisor.3")).toBe("supervisor.1");
    expect(reviewerFor("supervisor.1", ["supervisor.1"])).toBeNull();
  });
});
