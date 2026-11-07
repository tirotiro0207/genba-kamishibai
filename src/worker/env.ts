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
  /** 会社でないテナント（公開デモ・練習）でも名前を出してよい枠（例 "author.1,supervisor.1"）。公開に同意した人だけを書く。無ければ誰の名前も出さない */
  PUBLIC_NAMES?: string;
  /** 採点の右のタブの人の名前（11/7 作者。無ければその監修者の枠の名前） */
  SCORE_SUPERVISOR_NAME?: string;
  /** 採点の右のタブの人が入る監修者の枠（"1" か "2"。無ければ 1） */
  SCORE_SUPERVISOR_SLOT?: string;
  TRAINER_NAME?: string;
  AUTHOR_NAME?: string;
  /** 監修者に見てもらうカードの番号（11/6 作者）。, か空白で区切り、この順でホームのタブに出す。本番は wrangler secret。無ければタブを出さない */
  REVIEW_CARDS?: string;
  /** 資料の見せる名前（11/6 作者）。{"資料の鍵": "名前"} の JSON。本番は wrangler secret。無ければ「資料」と出す */
  DOC_LABELS?: string;
  /** 本番の公開の置き場だけ "1"（wrangler.jsonc の env.production の vars）。会社でないテナントを見るだけにし、架空の会社の MCP にも鍵を要る（093b） */
  PUBLIC_DEMO?: string;
}
