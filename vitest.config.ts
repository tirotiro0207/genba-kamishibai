import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", include: ["tests/**/*.test.ts"], environment: "node" } },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("migrations"), SESSION_SECRET: "test-secret" } },
          })),
        ],
        test: { name: "worker", include: ["src/worker/**/*.test.ts"], setupFiles: ["src/worker/test/apply-migrations.ts"] },
      },
    ],
  },
});
