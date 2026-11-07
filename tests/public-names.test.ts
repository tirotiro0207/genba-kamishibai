import { describe, expect, it } from "vitest";
import type { Env } from "../src/worker/env";
import { shownName } from "../src/worker/people";
import { publicScoreNames } from "../src/worker/scores";

// 公開デモ・練習は誰でも読めるので、公開に同意した枠の名前だけを出す
const env = { AUTHOR_NAME: "作者", SUPERVISOR_1_NAME: "監修者一", SUPERVISOR_2_NAME: "監修者二", SCORE_SUPERVISOR_SLOT: "2", SCORE_SUPERVISOR_NAME: "右の人" } as unknown as Env;

describe("公開してよい名前", () => {
  it("会社のテナントは PIN の内側なので全部出す", () => {
    expect(shownName(env, "company", { role: "supervisor", slot: 2 })).toBe("監修者二");
  });
  it("PUBLIC_NAMES が無ければ、公開デモでは誰の名前も出さない", () => {
    expect(shownName(env, "demo", { role: "author", slot: 1 })).toBe("");
    expect(shownName(env, "practice", { role: "supervisor", slot: 1 })).toBe("");
  });
  it("同意した枠だけ出す", () => {
    const e = { ...env, PUBLIC_NAMES: "author.1, supervisor.1" } as Env;
    expect(shownName(e, "demo", { role: "author", slot: 1 })).toBe("作者");
    expect(shownName(e, "demo", { role: "supervisor", slot: 1 })).toBe("監修者一");
    expect(shownName(e, "demo", { role: "supervisor", slot: 2 })).toBe("");
  });
  it("採点の入口（PIN の前）は、右の人の枠が同意していなければ名前を出さない", () => {
    const e = { ...env, PUBLIC_NAMES: "author.1,supervisor.1" } as Env;
    expect(publicScoreNames(e)).toEqual({ author: "作者", supervisor: "" });
    expect(publicScoreNames({ ...e, SCORE_SUPERVISOR_SLOT: "1" } as Env).supervisor).toBe("右の人");
  });
});
