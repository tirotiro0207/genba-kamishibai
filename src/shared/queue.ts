// 確認待ちの列（061）。監修者が見るカードを、危ないものから先に並べる。
// 並びは 赤 → 黄 → まだ確かめていない → 緑。同じ帯の中は古い順。OK・署名済み・停止は列に入れない
import type { CardStatus } from "./card";
import type { Band } from "./verify/formal";

export const QUEUE_STATUSES: readonly CardStatus[] = ["pending", "ai_draft", "draft"];

export interface QueueItem {
  id: string;
  status: CardStatus;
  /** 今の版の確かめる AI の帯。まだ確かめていなければ null */
  band: Band | null;
  dangerous: boolean;
  created_at: string;
}

const RANK = (q: QueueItem) => (q.dangerous || q.band === "red" ? 0 : q.band === "yellow" ? 1 : q.band === null ? 2 : 3);

export function queueOrder<T extends QueueItem>(items: T[]): T[] {
  return items.filter((q) => QUEUE_STATUSES.includes(q.status)).sort((a, b) => RANK(a) - RANK(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
