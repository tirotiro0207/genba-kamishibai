// 取り込みの見張り（post-merge）を .git/hooks に写す（11/7）。前からあるフック（pre-commit など）には触らない。
// 同じ名前の自前でないフックがあるときは上書きしない
import { chmodSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).trim();
const hooks = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf-8" }).trim();
const src = join(root, "scripts", "git-hooks", "post-merge");
const dst = join(root, hooks, "post-merge");
const MARK = "scripts/intake-check.ts";
if (existsSync(dst) && !readFileSync(dst, "utf-8").includes(MARK)) {
  console.error(`${dst} に別のフックがあるので上書きしない。中で npx tsx ${MARK} --base ORIG_HEAD を呼ぶ行を足す`);
  process.exit(1);
}
copyFileSync(src, dst);
chmodSync(dst, 0o755);
console.log(`入れた: ${dst}`);
