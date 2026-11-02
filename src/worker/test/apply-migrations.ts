import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// テストの DB は手元の開発用とは別に、テストのたびに空から作られる
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
