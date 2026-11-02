export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** 会社のテナントに入ったしるしの署名の鍵（wrangler secret・手元は .dev.vars） */
  SESSION_SECRET: string;
  /** Claude の鍵（wrangler secret・手元は .dev.vars）。無ければ取り出しなどの呼び出しは 503 */
  ANTHROPIC_API_KEY?: string;
  /** 役割の名前（030b）。手元の Worker は .dev.vars、本番は wrangler secret から読む（.env は Node のスクリプトだけが読む）。無ければ空欄 */
  SUPERVISOR_1_NAME?: string;
  SUPERVISOR_2_NAME?: string;
  TRAINER_NAME?: string;
  AUTHOR_NAME?: string;
}
