import type { CallLog, CallRecord, Purpose } from "../shared/claude";

/** 呼び出しの記録を D1 の api_calls に残す */
export class D1CallLog implements CallLog {
  constructor(private db: D1Database) {}

  async append(r: CallRecord) {
    await this.db
      .prepare(
        `INSERT INTO api_calls (at, purpose, label, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, usd, ms, ok, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.at, r.purpose, r.label, r.model, r.inputTokens, r.outputTokens, r.cacheWriteTokens, r.cacheReadTokens, r.usd, r.ms, r.ok ? 1 : 0, r.error ?? null)
      .run();
  }

  async sumUsd(purpose: Purpose, since?: string) {
    const row = await this.db
      .prepare("SELECT coalesce(sum(usd), 0) AS s FROM api_calls WHERE purpose = ? AND at >= ?")
      .bind(purpose, since ?? "")
      .first<{ s: number }>();
    return row?.s ?? 0;
  }
}
