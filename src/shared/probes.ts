// 本番の見回り（scripts/smoke-prod.ts）と公開物の検査（scripts/public-check.ts）が、同じ口の一覧を見る。
// 書き込まず、お金のかかる呼び出しにも届かない口だけ（届かないことが期待の口も含む）。期待の番号は src/worker/probes.test.ts が手元の Worker で確かめる。

export interface Probe {
  name: string;
  method: "GET" | "POST";
  /** テナントの名前は TENANT で置き換える */
  path: string;
  body?: unknown;
  /** 期待する番号（どれか） */
  status: number[];
}

/** 公開の置き場（demo）に PIN も役割も無しで届く口の見回り。採点・ゲスト・アセット・朝礼・MCP の口 */
export const OPEN_PROBES: Probe[] = [
  { name: "採点の入口の名前を PIN 無しで読める", method: "GET", path: "/api/score-names", status: [200] },
  { name: "採点の表は役割が無いと開かない", method: "GET", path: "/api/t/TENANT/trials/latest/scoring", status: [403] },
  { name: "採点の参考の訳（Claude を呼ぶ）は公開の置き場で閉じている", method: "POST", path: "/api/t/TENANT/trials/latest/scoring/translate", status: [403] },
  { name: "アセットの一覧を読める", method: "GET", path: "/api/t/TENANT/assets", status: [200] },
  { name: "アセットの直し（Claude を呼ぶ）は公開の置き場で閉じている", method: "POST", path: "/api/t/TENANT/assets/cone/fix", body: { prompt: "x" }, status: [403] },
  { name: "朝礼の組を読める", method: "GET", path: "/api/t/TENANT/issue/morning", status: [200, 403] },
  { name: "朝礼の組を作る口は公開の置き場で閉じている", method: "POST", path: "/api/t/TENANT/issue/morning", body: { work: "x" }, status: [403] },
  { name: "ゲストの置き場に入れる前のテナントは無い", method: "GET", path: "/api/t/guest-000000000000/cards", status: [404] },
  { name: "MCP は公開の置き場では鍵が要る（鍵なしで架空の会社も開かない）", method: "POST", path: "/mcp/TENANT", body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, status: [401] },
  { name: "MCP は会社のテナントを鍵なしでは開かない（会社のテナントがある環境）", method: "POST", path: "/mcp/company", body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, status: [401] },
];

export const probePath = (p: Probe, tenant = "demo") => p.path.replace("TENANT", tenant);
