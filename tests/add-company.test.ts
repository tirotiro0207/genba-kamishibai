import { describe, expect, it } from "vitest";
import { checkTenantName } from "../scripts/add-company";

// 会社のテナントを足すスクリプトは、公開の置き場とゲスト用の名前を弾く
describe("add-company のテナント名", () => {
  it("demo・practice・guest- で始まる名前は断る", () => {
    for (const n of ["demo", "practice", "guest-ab12cd34ef56"]) expect(() => checkTenantName(n)).toThrow(/会社には使えない/);
  });
  it("形の違う名前は断り、会社の名前は通す", () => {
    expect(() => checkTenantName("Bad Name")).toThrow(/英小文字/);
    expect(() => checkTenantName("company")).not.toThrow();
    expect(() => checkTenantName("demo2")).not.toThrow();
  });
});
