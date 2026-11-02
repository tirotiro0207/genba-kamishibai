export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** 会社のテナントに入ったしるしの署名の鍵（wrangler secret・手元は .dev.vars） */
  SESSION_SECRET: string;
}
