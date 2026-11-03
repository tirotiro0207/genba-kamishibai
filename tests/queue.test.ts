import { describe, expect, it } from "vitest";
import { queueOrder, type QueueItem } from "../src/shared/queue";

// 061: 確認待ちの列は赤のカードが先頭。OK・署名済み・停止は列に入らない
const q = (id: string, band: QueueItem["band"], created_at: string, extra: Partial<QueueItem> = {}): QueueItem => ({ id, status: "pending", band, dangerous: false, created_at, ...extra });

describe("確認待ちの列（061）", () => {
  it("赤 → 黄 → まだ確かめていない → 緑の順で、同じ帯は古い順。危ない読み違いは帯にかかわらず赤と同じ先頭", () => {
    const items = [q("g", "green", "1"), q("n", null, "1"), q("y", "yellow", "1"), q("r2", "red", "3"), q("r1", "red", "2"), q("d", "yellow", "4", { dangerous: true })];
    expect(queueOrder(items).map((x) => x.id)).toEqual(["r1", "r2", "d", "y", "n", "g"]);
  });

  it("下書き・AI 下書き・確認待ちだけが並び、OK・署名済み・停止は入らない", () => {
    const items = (["draft", "ai_draft", "pending", "ok", "signed", "stopped"] as const).map((status, i) => q(status, "red", String(i), { status }));
    expect(queueOrder(items).map((x) => x.id)).toEqual(["draft", "ai_draft", "pending"]);
  });
});
