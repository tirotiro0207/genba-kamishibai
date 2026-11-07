// 取り込みの見張り（post-merge）を .git/hooks に写す（11/7）。前からあるフック（pre-commit など）には触らない。
// 同じ名前の自前でないフックがあるときは上書きしない。
// git は clone でフックを写さないので、npm install のたびに package.json の prepare からこれを呼んで入れる（11/7 作者「みんなの手元にも」）
import { chmodSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// --soft は npm install（prepare）から呼ぶとき。git の外・別のフックがあるときも、install を止めずに言うだけにする
const soft = process.argv.includes("--soft");
const stop = (msg: string) => {
  console.error(msg);
  process.exit(soft ? 0 : 1);
};
let root = "";
try {
  root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  stop("git のリポジトリの外なので、取り込みの見張りは入れない");
}
const hooks = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf-8" }).trim();
const src = join(root, "scripts", "git-hooks", "post-merge");
const dst = join(root, hooks, "post-merge");
const MARK = "scripts/intake-check.ts";
if (existsSync(dst) && !readFileSync(dst, "utf-8").includes(MARK)) {
  stop(`${dst} に別のフックがあるので上書きしない。中で npx tsx ${MARK} --base ORIG_HEAD を呼ぶ行を足す`);
}
copyFileSync(src, dst);
chmodSync(dst, 0o755);
console.log(`入れた: ${dst}`);
