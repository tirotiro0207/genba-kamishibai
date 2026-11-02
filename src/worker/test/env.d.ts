/// <reference types="@cloudflare/vitest-plugin/types" />
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Env as AppEnv } from "../env";

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
    interface GlobalProps {
      mainModule: typeof import("../index");
    }
  }
}
