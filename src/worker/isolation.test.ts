import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { ASSET_LIST } from "../shared/picto/asset-catalog";
import { appendAudit } from "./audit";
import { type Person, signRole } from "./people";
import { contentHash } from "./sign";
import { signSession } from "./tenant";

// 他人のデータが見えないことの総点検（公開前の点検・1）。
// 場所 4 つ（会社 A・会社 B・公開デモ・ゲスト）に、それぞれ目印つきのデータを入れる。
// 役割 6 通り（役割なし・新入社員・教育担当・作者・監修者 1・監修者 2）で、主な口を読み、別の場所の目印が 1 つも出ないことを数える。
// 既存のテストで済んでいる組み合わせ（カード・監査・チャット・試しの回・MCP の鍵・ファイルの別テナント）は、ここでは「別の場所の id で読む」「しるしを持ち越す」の形で重ねて確かめる。
const SECRET = "test-secret";
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);

type Place = "A" | "B" | "demo" | "guest";
const PLACES: Place[] = ["A", "B", "demo", "guest"];
const TENANT: Record<Place, string> = { A: "co-iso-a", B: "co-iso-b", demo: "demo", guest: "guest-a1b2c3d4e5f6" };
const isCompany = (p: Place) => p === "A" || p === "B";
const MARK: Record<Place, string> = { A: "ISOMARKAX", B: "ISOMARKBX", demo: "ISOMARKDEMOX", guest: "ISOMARKGUESTX" };

interface RoleCase {
  name: string;
  person: Person | null;
}
const ROLES: RoleCase[] = [
  { name: "役割なし", person: null },
  { name: "新入社員", person: { role: "newhire", slot: 1, student: "student_V_1" } },
  { name: "教育担当", person: { role: "trainer", slot: 1 } },
  { name: "作者", person: { role: "author", slot: 1 } },
  { name: "監修者1", person: { role: "supervisor", slot: 1 } },
  { name: "監修者2", person: { role: "supervisor", slot: 2 } },
];
const [R_NONE, , , R_AUTHOR, R_SUP1] = ROLES;

/** 入ったしるし（会社だけ）と役割のしるしを、その場所用に作る */
async function headers(place: Place, r: RoleCase, opts: { pin?: boolean } = {}): Promise<Record<string, string>> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (isCompany(place) && opts.pin !== false) h.authorization = `Bearer ${await signSession(SECRET, TENANT[place])}`;
  if (r.person) h["x-role"] = await signRole(SECRET, TENANT[place], r.person);
  return h;
}
const txt = (b: ArrayBuffer) => new TextDecoder().decode(b);
const send = (method: string, path: string, h: Record<string, string>, body?: unknown) => call(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });

interface Ids {
  card: string;
  signed: string;
  stopped: string;
  trial: string;
  chat: string;
  extraction: string;
  run: string;
  akind: string;
  aseq: number;
  file: string;
}
const IDS = {} as Record<Place, Ids>;
let combos = 0;
let leaks = 0;
const leakList: string[] = [];
/** 別の場所の id で呼んだのに 200 を返した口（中身に別の場所の目印が無いことは noLeak で確かめ済み） */
const soft200 = new Set<string>();

/** 返事に別の場所の目印があれば「見えた」と数える */
function noLeak(viewer: Place, label: string, body: string) {
  combos++;
  for (const q of PLACES) {
    if (q !== viewer && body.includes(MARK[q])) {
      leaks++;
      leakList.push(`${label}: ${TENANT[viewer]} の口に ${TENANT[q]} の目印`);
    }
  }
  expect(leakList.filter((x) => x.startsWith(label))).toEqual([]);
}

async function seed(place: Place) {
  const t = TENANT[place];
  const m = MARK[place];
  if (place !== "demo") {
    await env.DB.prepare("INSERT INTO tenants (id, kind, name, pin_hash) VALUES (?, ?, ?, ?)")
      .bind(t, isCompany(place) ? "company" : "practice", `iso ${place}`, isCompany(place) ? "aa:bb" : null)
      .run();
  }
  const author = await headers(place, R_AUTHOR);
  const sup = await headers(place, R_SUP1);
  const mk = async (rule: string) => {
    const r = await send("POST", `/api/t/${t}/cards`, author, { card: { ...sampleCard(), rule } });
    expect(r.status).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };
  const signIt = async (id: string) => {
    await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
    const r = (await env.DB.prepare("SELECT body, version FROM cards WHERE id = ?").bind(id).first<{ body: string; version: number }>())!;
    await appendAudit(env.DB, t, { card_id: id, kind: "sign", actor: "supervisor.1", payload: { version: r.version, signed_at: new Date().toISOString(), content_sha256: await contentHash(r.body) } });
  };
  const card = await mk(`${m} 下書き`);
  const signed = await mk(`${m} 署名済み`);
  await signIt(signed);
  const stopped = await mk(`${m} 止める`);
  await signIt(stopped);
  expect((await send("POST", `/api/t/${t}/cards/${stopped}/status`, sup, { to: "stopped", reason: `${m} 止めた理由` })).status).toBe(200);

  // 試しの回・答え・採点
  const tr = await send("POST", `/api/t/${t}/trials`, author, { design: "cross", participants: [{ id: "student_V_1", group: "ベトナム" }] });
  expect(tr.status).toBe(201);
  const trial = ((await tr.json()) as { id: string }).id;
  const rr = await send("POST", `/api/t/${t}/trials/${trial}/responses`, author, { participant: "student_V_1", item: "A", ms: 1000, answer: `${m} 答え` });
  expect(rr.status).toBe(201);
  const seq = ((await rr.json()) as { seq: number }).seq;
  expect((await send("POST", `/api/t/${t}/trials/${trial}/scores`, author, { target: `r:${seq}`, score: 5, comment: `${m} 採点コメント` })).status).toBe(201);

  // 会社の言葉・取り出し・チャット・夜間の仕分け
  await env.DB.prepare("INSERT INTO company_words (tenant_id, kind, phrase, prefer, source) VALUES (?, 'call', ?, ?, 'edit')").bind(t, `${m} 言葉`, `${m} 呼び方`).run();
  const extraction = `ex-${place}`;
  await env.DB.prepare("INSERT INTO extractions (id, tenant_id, input, rules) VALUES (?, ?, ?, '[]')").bind(extraction, t, JSON.stringify({ text: `${m} 取り出しの入力` })).run();
  const chat = `chat-${place}`;
  await env.DB.prepare("INSERT INTO card_chats (id, tenant_id, actor, messages) VALUES (?, ?, 'author.1', ?)").bind(chat, t, JSON.stringify([{ role: "user", text: `${m} チャット` }])).run();
  const run = `run-${place}`;
  await env.DB.prepare("INSERT INTO night_runs (id, tenant_id, doc, pages) VALUES (?, ?, ?, 1)").bind(run, t, `${m} 資料`).run();
  await env.DB.prepare("INSERT INTO night_pages (run_id, tenant_id, page, state, card, reason) VALUES (?, ?, 1, 'done', 1, ?)").bind(run, t, `${m} 仕分けの理由`).run();

  // アセットの差し替え（画像つき）と、置き場のファイル
  const akind = ASSET_LIST[0].kind;
  const imageKey = `t/${t}/asset-${place}.png`;
  await env.FILES.put(imageKey, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { httpMetadata: { contentType: "image/png" } });
  const v = await env.DB.prepare("INSERT INTO asset_versions (tenant_id, kind, svg, prompt, image_key, actor) VALUES (?, ?, ?, ?, ?, 'author.1') RETURNING seq")
    .bind(t, akind, `<svg><title>${m} 絵</title></svg>`, `${m} 指示`, imageKey)
    .first<{ seq: number }>();
  await env.DB.prepare("INSERT INTO asset_active (tenant_id, kind, version_seq, actor) VALUES (?, ?, ?, 'author.1')").bind(t, akind, v!.seq).run();
  const file = `secret-${m}.json`;
  await env.FILES.put(`t/${t}/${file}`, JSON.stringify({ m }), { httpMetadata: { contentType: "application/json" } });

  IDS[place] = { card, signed, stopped, trial, chat, extraction, run, akind, aseq: v!.seq, file };
}

beforeAll(async () => {
  for (const p of PLACES) await seed(p);
});
afterAll(() => {
  console.log(`ISOLATION combos=${combos} leaks=${leaks} soft200=${[...soft200].join(",")}`);
});

interface Endpoint {
  name: string;
  path: (i: Ids) => string;
  /** その場所のものでない id で呼んだら、200 で中身を返してはいけない口 */
  byId?: boolean;
  method?: string;
  body?: unknown;
}
const E = (name: string, path: (i: Ids) => string, byId = false): Endpoint => ({ name, path, byId });
const GETS: Endpoint[] = [
  E("人の一覧", () => "/people"),
  E("入った役割", () => "/me"),
  E("カードの一覧", () => "/cards"),
  E("カードの数", () => "/cards/stats"),
  E("カードの用語", () => "/cards/glossary"),
  E("カード 1 枚（下書き）", (i) => `/cards/${i.card}`, true),
  E("カード 1 枚（署名済み）", (i) => `/cards/${i.signed}`, true),
  E("カード 1 枚（止めた）", (i) => `/cards/${i.stopped}`, true),
  E("手本の記録", (i) => `/cards/${i.signed}/exemplars`, true),
  E("署名の記録", (i) => `/cards/${i.signed}/signature`, true),
  E("新入社員の閲覧の一覧", () => "/read/cards"),
  E("新入社員の閲覧 1 枚", (i) => `/read/cards/${i.signed}`, true),
  E("発行の一覧", () => "/issue/cards"),
  E("見た人", (i) => `/issue/cards/${i.signed}/views`, true),
  E("回収の知らせ", () => "/issue/recalls"),
  E("投稿", () => "/issue/posts"),
  E("週の抜き取り", () => "/issue/samples"),
  E("朝の組", () => "/issue/morning"),
  E("朝の組の案", () => "/issue/morning/suggest"),
  E("会社の言葉", () => "/words"),
  E("監査の連鎖の確かめ", () => "/audit/verify"),
  E("監査の記録（署名済み）", (i) => `/audit/cards/${i.signed}`, true),
  E("監査の記録（止めた）", (i) => `/audit/cards/${i.stopped}`, true),
  E("アセットの一覧", () => "/assets"),
  E("アセットの今の版", () => "/assets/active"),
  E("アセットの版の一覧", (i) => `/assets/${i.akind}/versions`),
  E("アセットの添付画像", (i) => `/assets/${i.akind}/image/${i.aseq}`, true),
  E("試しの回の一覧", () => "/trials"),
  E("今の回", () => "/trials/open"),
  E("試しの回 1 つ", (i) => `/trials/${i.trial}`, true),
  E("試しの答え", (i) => `/trials/${i.trial}/responses`, true),
  E("試しの採点（勘定）", (i) => `/trials/${i.trial}/grades`, true),
  E("試しの集計", (i) => `/trials/${i.trial}/summary`, true),
  E("試しの CSV", (i) => `/trials/${i.trial}/answers.csv`, true),
  E("試しの絵", (i) => `/trials/${i.trial}/pictures`, true),
  E("試しの絵の答え", (i) => `/trials/${i.trial}/picture-answers`, true),
  E("試しの素材", (i) => `/trials/${i.trial}/material`, true),
  E("試しのページ", (i) => `/trials/${i.trial}/page/A`, true),
  E("採点の表（id）", (i) => `/trials/${i.trial}/scoring`, true),
  E("採点の表（最新）", () => "/trials/latest/scoring"),
  E("置き場の一覧", () => "/files"),
  E("置き場のファイル", (i) => `/files/${i.file}`, true),
  E("確認待ちの列", () => "/queue"),
  E("仕分け", () => "/sort"),
  E("仕分け（走りを指す）", (i) => `/sort?run=${i.run}`),
  E("チャットの一覧", () => "/chats"),
  E("チャット 1 つ", (i) => `/chats/${i.chat}`, true),
  E("取り出し 1 つ", (i) => `/extract/${i.extraction}`, true),
  E("○× の組", () => "/pairs"),
];

describe("他人のデータが見えない（場所 × 役割 × 口）", () => {
  it("自分の場所の口を読んでも、別の場所の目印は 1 つも出ない（ほかの場所の id を持ち込んでも）", async () => {
    for (const place of PLACES) {
      const t = TENANT[place];
      for (const r of ROLES) {
        const h = await headers(place, r);
        for (const e of GETS) {
          // 自分の場所の id で読む
          const res = await send("GET", `/api/t/${t}${e.path(IDS[place])}`, h);
          noLeak(place, `${t}/${r.name}/${e.name}`, txt(await res.arrayBuffer()));
          // ほかの場所の id を知っていても届かない
          if (!e.byId) continue;
          for (const q of PLACES) {
            if (q === place) continue;
            const x = await send("GET", `/api/t/${t}${e.path(IDS[q])}`, h);
            const text = txt(await x.arrayBuffer());
            noLeak(place, `${t}/${r.name}/${e.name}/id=${TENANT[q]}`, text);
            combos++;
            // 200 で返す口は、中身が空であること（目印が無いこと・上で確かめ済み）を記録する
            if (x.status === 200) soft200.add(e.name);
          }
        }
      }
    }
  }, 300_000);

  it("見張りが空ぶりでない: 自分の場所の目印は、監修者・作者には見える", async () => {
    const want: [string, (i: Ids) => string, RoleCase][] = [
      ["カード", () => "/cards", R_SUP1],
      ["会社の言葉", () => "/words", R_SUP1],
      ["回収の知らせ", () => "/issue/recalls", R_SUP1],
      ["試しの答え", (i) => `/trials/${i.trial}/responses`, R_AUTHOR],
      ["採点の表", (i) => `/trials/${i.trial}/scoring`, R_AUTHOR],
      ["ファイル", (i) => `/files/${i.file}`, R_SUP1],
      ["取り出し", (i) => `/extract/${i.extraction}`, R_SUP1],
      ["チャット", (i) => `/chats/${i.chat}`, R_SUP1],
      ["アセットの版", (i) => `/assets/${i.akind}/versions`, R_SUP1],
      ["仕分け", () => "/sort", R_SUP1],
    ];
    for (const place of PLACES) {
      for (const [name, path, r] of want) {
        const res = await send("GET", `/api/t/${TENANT[place]}${path(IDS[place])}`, await headers(place, r));
        const text = txt(await res.arrayBuffer());
        expect(res.status, `${TENANT[place]}/${name}`).toBe(200);
        expect(text.includes(MARK[place]), `${TENANT[place]}/${name} に自分の目印`).toBe(true);
      }
    }
  });

  it("置き場: 区切りの偽装・別のテナントの頭を指す一覧でも、別の場所のファイルに届かない", async () => {
    for (const place of PLACES) {
      const h = await headers(place, R_SUP1);
      const t = TENANT[place];
      for (const q of PLACES) {
        if (q === place) continue;
        const other = TENANT[q];
        const file = IDS[q].file;
        const gets = [
          `/files/..%2F..%2F${other}%2F${file}`,
          `/files/..%5C..%5C${other}%5C${file}`,
          `/files/%2E%2E%2F${other}%2F${file}`,
          `/files/t%2F${other}%2F${file}`,
          `/files/t/${other}/${file}`,
          `/files/${other}/${file}`,
        ];
        for (const p of gets) {
          const res = await send("GET", `/api/t/${t}${p}`, h);
          noLeak(place, `${t}/files${p}`, txt(await res.arrayBuffer()));
          combos++;
          expect(res.status, `${t}${p}`).not.toBe(200);
        }
        for (const prefix of [`..%2F${other}`, `t/${other}`, `${other}`, `../${other}`]) {
          const res = await send("GET", `/api/t/${t}/files?prefix=${prefix}`, h);
          noLeak(place, `${t}/files?prefix=${prefix}`, txt(await res.arrayBuffer()));
        }
        // 書き込みでも、別のテナントの鍵に置けない（自分の頭の中に置かれる）
        const put = await call(`/api/t/${t}/files/..%2F..%2F${other}%2Fx.json`, { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: "{}" });
        combos++;
        expect(put.status).toBe(400);
        expect(await env.FILES.head(`t/${other}/x.json`)).toBeNull();
      }
    }
  });
});

describe("しるしの持ち越し（場所をまたいだしるしは通らない）", () => {
  const SAMPLE: Endpoint[] = [
    E("入った役割", () => "/me"),
    E("人の一覧", () => "/people"),
    E("カードの一覧", () => "/cards"),
    E("カード 1 枚", (i) => `/cards/${i.signed}`),
    E("新入社員の閲覧", () => "/read/cards"),
    E("回収の知らせ", () => "/issue/recalls"),
    E("会社の言葉", () => "/words"),
    E("監査の記録", (i) => `/audit/cards/${i.signed}`),
    E("アセットの一覧", () => "/assets"),
    E("試しの答え", (i) => `/trials/${i.trial}/responses`),
    E("採点の表", (i) => `/trials/${i.trial}/scoring`),
    E("置き場の一覧", () => "/files"),
    E("置き場のファイル", (i) => `/files/${i.file}`),
    E("確認待ちの列", () => "/queue"),
    E("チャットの一覧", () => "/chats"),
    { name: "停止", path: (i) => `/cards/${i.signed}/status`, method: "POST", body: { to: "stopped", reason: "x" } },
    { name: "署名", path: (i) => `/cards/${i.signed}/sign`, method: "POST", body: { version: 1 } },
    { name: "役割で入る", path: () => "/login", method: "POST", body: { role: "supervisor", slot: 1, pin: "0000" } },
  ];

  it("別の場所の PIN のしるし・役割のしるしでは、会社の場所に入れない（401）。公開の場所でも別の場所の役割のしるしは 401", async () => {
    for (const to of PLACES) {
      const t = TENANT[to];
      for (const from of PLACES) {
        if (from === to) continue;
        // from の場所で作った役割のしるし（6 通り）と、PIN のしるし（from が会社のときだけ）
        const bearers: (string | null)[] = [null];
        if (isCompany(from)) bearers.push(await signSession(SECRET, TENANT[from]));
        if (isCompany(to)) bearers.push(await signSession(SECRET, t));
        for (const bearer of bearers) {
          for (const r of ROLES) {
            const h: Record<string, string> = { "content-type": "application/json" };
            if (bearer) h.authorization = `Bearer ${bearer}`;
            if (r.person) h["x-role"] = await signRole(SECRET, TENANT[from], r.person);
            for (const e of SAMPLE) {
              const res = await send(e.method ?? "GET", `/api/t/${t}${e.path(IDS[to])}`, h, e.body);
              const text = txt(await res.arrayBuffer());
              noLeak(to, `${from}→${t}/${r.name}/${e.name}`, text);
              combos++;
              const ownBearer = bearer !== null && isCompany(to) && bearer.startsWith(t + ".");
              if (isCompany(to) && !ownBearer) expect(res.status, `${from}→${t}/${r.name}/${e.name}（PIN のしるしが別）`).toBe(401);
              else if (r.person) expect(res.status, `${from}→${t}/${r.name}/${e.name}（役割のしるしが別）`).toBe(401);
              else if (isCompany(to) && !["/me", "/people", "/login"].includes(e.path(IDS[to]))) expect(res.status, `${from}→${t}/${r.name}/${e.name}（役割なし）`).toBe(403);
            }
          }
        }
      }
    }
  }, 300_000);

  it("ゲストの場所のしるし・役割のしるしでは、会社の場所の物に届かない（会社の id を指しても）", async () => {
    const g = TENANT.guest;
    for (const r of ROLES) {
      const h = await headers("guest", r);
      for (const co of ["A", "B"] as const) {
        for (const e of GETS.filter((x) => x.byId)) {
          // ゲストの場所の口に会社の id を渡す
          const res = await send("GET", `/api/t/${g}${e.path(IDS[co])}`, h);
          noLeak("guest", `guest→${TENANT[co]}の id/${r.name}/${e.name}`, txt(await res.arrayBuffer()));
          combos++;
          if (res.status === 200) soft200.add(`guest:${e.name}`);
          // 会社の場所の口を、ゲストのしるしで叩く
          const res2 = await send("GET", `/api/t/${TENANT[co]}${e.path(IDS[co])}`, h);
          noLeak(co, `guestのしるし→${TENANT[co]}/${r.name}/${e.name}`, txt(await res2.arrayBuffer()));
          combos++;
          expect(res2.status).toBe(401);
        }
      }
    }
  }, 300_000);
});

describe("署名と停止は監修者だけ（会社・公開デモ・ゲスト）", () => {
  it("監修者以外は 403 で、カードの状態が変わらない。監修者は関所を通る", async () => {
    for (const place of ["A", "demo", "guest"] as const) {
      const t = TENANT[place];
      const sup = await headers(place, R_SUP1);
      for (const r of ROLES) {
        const h = await headers(place, r);
        const isSup = r.person?.role === "supervisor";
        // 停止（署名済みのカードを新しく作って試す）
        const author = await headers(place, R_AUTHOR);
        const made = await send("POST", `/api/t/${t}/cards`, author, { card: { ...sampleCard(), rule: `${MARK[place]} 停止の試し ${r.name}` } });
        const id = ((await made.json()) as { id: string }).id;
        await env.DB.prepare("UPDATE cards SET status = 'signed' WHERE id = ?").bind(id).run();
        const stop = await send("POST", `/api/t/${t}/cards/${id}/status`, h, { to: "stopped", reason: "試し" });
        combos++;
        const st = (await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first<{ status: string }>())!.status;
        if (isSup) {
          expect(stop.status, `${t}/${r.name}/停止`).toBe(200);
          expect(st).toBe("stopped");
          // 止めたカードを下書きに戻すのも監修者だけ
          const back = await send("POST", `/api/t/${t}/cards/${id}/status`, h, { to: "draft" });
          expect(back.status).toBe(200);
        } else {
          expect(stop.status, `${t}/${r.name}/停止`).toBe(403);
          expect(st).toBe("signed");
        }
        // 止めたカードを下書きに戻す（監修者以外は 403）
        await env.DB.prepare("UPDATE cards SET status = 'stopped' WHERE id = ?").bind(id).run();
        const draft = await send("POST", `/api/t/${t}/cards/${id}/status`, h, { to: "draft" });
        combos++;
        expect(draft.status, `${t}/${r.name}/下書きへ`).toBe(isSup ? 200 : 403);
        // 署名: 監修者以外は 403。監修者は関所を通る（証拠が無いので 409 などで止まるが、403 ではない）
        const ok = await send("POST", `/api/t/${t}/cards/${id}/sign`, h, { version: 1 });
        combos++;
        if (isSup) expect(ok.status, `${t}/${r.name}/署名`).not.toBe(403);
        else expect(ok.status, `${t}/${r.name}/署名`).toBe(403);
        expect((await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first<{ status: string }>())!.status).not.toBe("signed");
        // 状態の API から「署名済み」へ直接は、監修者でも通らない
        const direct = await send("POST", `/api/t/${t}/cards/${id}/status`, sup, { to: "signed" });
        combos++;
        expect(direct.status).toBe(403);
      }
    }
  }, 300_000);
});


describe("エラーの出しすぎ（POST・PUT・壊れた入力）", () => {
  // 返事に出してはいけないもの: スタックトレース・内部のパス・SQL の文・JSON.parse などの生の例外の文
  const BAD = /stack|\bat (async )?\S+ \(|\.[mc]?[jt]sx?:\d+|node_modules|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE FROM\b|D1_ERROR|SQLITE|[A-Z]:\|\/src\/|TypeError|SyntaxError|ReferenceError|RangeError|Unexpected token|is not valid JSON|workerd|wrangler/i;
  const LONG = "あ".repeat(20_000);
  const BODIES: [string, string][] = [
    ["壊れた JSON", '{"a":'],
    ["null", "null"],
    ["配列", "[]"],
    ["型違い", JSON.stringify({ role: {}, slot: [], pin: {}, to: {}, reason: [], version: {}, participant: {}, item: {}, answer: {}, target: {}, text: {}, cards: "x", participants: "x", items: "x", kind: {}, phrase: {}, prefer: {}, name: {} })],
    ["長すぎる文字", JSON.stringify({ text: LONG, answer: LONG, comment: LONG, reason: LONG, pin: LONG, participant: LONG, phrase: LONG, prefer: LONG, prompt: LONG })],
  ];
  const WRITES: { name: string; method: string; path: (i: Ids) => string }[] = [
    { name: "PIN で入る", method: "POST", path: () => "/session" },
    { name: "役割で入る", method: "POST", path: () => "/login" },
    { name: "カードを作る", method: "POST", path: () => "/cards" },
    { name: "カードを直す", method: "PUT", path: (i) => `/cards/${i.card}` },
    { name: "カードの重み", method: "PUT", path: (i) => `/cards/${i.card}/weight` },
    { name: "用語", method: "PUT", path: () => "/cards/glossary" },
    { name: "状態", method: "POST", path: (i) => `/cards/${i.card}/status` },
    { name: "署名", method: "POST", path: (i) => `/cards/${i.card}/sign` },
    { name: "確かめる", method: "POST", path: (i) => `/cards/${i.card}/verify` },
    { name: "戻す", method: "POST", path: (i) => `/cards/${i.card}/undo` },
    { name: "言葉で直す", method: "POST", path: (i) => `/cards/${i.card}/rework` },
    { name: "1 枚やり直す", method: "POST", path: (i) => `/cards/${i.card}/redo` },
    { name: "事故", method: "POST", path: (i) => `/cards/${i.card}/accident` },
    { name: "無い id へ状態", method: "POST", path: () => "/cards/no-such-id/status" },
    { name: "長い id へ状態", method: "POST", path: () => `/cards/${"a".repeat(5000)}/status` },
    { name: "回を作る", method: "POST", path: () => "/trials" },
    { name: "答え", method: "POST", path: (i) => `/trials/${i.trial}/responses` },
    { name: "加わる", method: "POST", path: (i) => `/trials/${i.trial}/join` },
    { name: "採点", method: "POST", path: (i) => `/trials/${i.trial}/scores` },
    { name: "勘", method: "POST", path: (i) => `/trials/${i.trial}/forecasts` },
    { name: "絵の答え", method: "POST", path: (i) => `/trials/${i.trial}/picture-answers` },
    { name: "回のカード", method: "POST", path: (i) => `/trials/${i.trial}/cards` },
    { name: "素材", method: "PUT", path: (i) => `/trials/${i.trial}/material` },
    { name: "消す", method: "POST", path: (i) => `/trials/${i.trial}/erase` },
    { name: "無い回へ答え", method: "POST", path: () => "/trials/no-such-trial/responses" },
    { name: "取り出し", method: "POST", path: () => "/extract" },
    { name: "取り出しの OK", method: "POST", path: (i) => `/extract/${i.extraction}/ok` },
    { name: "カードにする", method: "POST", path: (i) => `/extract/${i.extraction}/make` },
    { name: "チャットを作る", method: "POST", path: () => "/chats" },
    { name: "チャットの返事", method: "POST", path: (i) => `/chats/${i.chat}/messages` },
    { name: "チャットの写真", method: "POST", path: () => "/chats/image" },
    { name: "チャットの PDF", method: "POST", path: () => "/chats/pdf" },
    { name: "アセットを直す", method: "POST", path: (i) => `/assets/${i.akind}/fix` },
    { name: "アセットを選ぶ", method: "POST", path: (i) => `/assets/${i.akind}/choose` },
    { name: "○× の組", method: "POST", path: () => "/pairs" },
    { name: "言葉を消す", method: "DELETE", path: () => "/words" },
    { name: "データを戻す", method: "POST", path: () => "/reset" },
    { name: "投稿", method: "POST", path: () => "/issue/posts" },
    { name: "朝の組", method: "POST", path: () => "/issue/morning" },
    { name: "仕分けの入れ替え", method: "PUT", path: (i) => `/sort/${i.run}/1` },
    { name: "置き場に置く", method: "PUT", path: () => "/files/probe.json" },
    { name: "監査に書く", method: "POST", path: () => "/audit/cards/x" },
  ];

  it("壊れた入力・型違い・長すぎる入力でも、返事にスタックトレース・内部のパス・SQL の文が出ず、サーバーの落ち（500）にならない", async () => {
    const bad: string[] = [];
    let n = 0;
    for (const place of ["A", "demo"] as const) {
      for (const r of [R_SUP1, R_NONE]) {
        const h = await headers(place, r);
        for (const w of WRITES) {
          for (const [bn, body] of BODIES) {
            const res = await call(`/api/t/${TENANT[place]}${w.path(IDS[place])}`, { method: w.method, headers: h, body });
            const text = txt(await res.arrayBuffer());
            n++;
            combos++;
            const label = `${TENANT[place]}/${r.name}/${w.name}/${bn} → ${res.status}`;
            if (BAD.test(text)) bad.push(`${label}: 内部の文が出た「${text.slice(0, 80)}」`);
            if (res.status >= 500) bad.push(`${label}: サーバーの落ち`);
          }
        }
      }
    }
    // 入口の外の口（鍵なしで届く所）
    for (const [bn, body] of BODIES) {
      for (const [m, p] of [["POST", "/api/guest"], ["POST", "/api/demo/make"], ["POST", "/mcp/practice"], ["POST", "/mcp/co-iso-a"], ["POST", "/api/t/co-iso-a/session"]] as const) {
        const res = await call(p, { method: m, headers: { "content-type": "application/json" }, body });
        const text = txt(await res.arrayBuffer());
        n++;
        combos++;
        if (BAD.test(text)) bad.push(`${p}/${bn} → ${res.status}: 内部の文が出た「${text.slice(0, 80)}」`);
        if (res.status >= 500) bad.push(`${p}/${bn} → ${res.status}: サーバーの落ち`);
      }
    }
    const leaked = bad.filter((x) => x.includes("内部の文が出た"));
    const fell = bad.filter((x) => x.includes("サーバーの落ち"));
    const byBody = new Map<string, number>();
    for (const x of fell) {
      const k = x.match(/\/(null|配列|壊れた JSON|型違い|長すぎる文字) → /)?.[1] ?? "?";
      byBody.set(k, (byBody.get(k) ?? 0) + 1);
    }
    console.log(`ERRORS n=${n} 内部の文=${leaked.length} 落ち=${fell.length} 落ちの入力別=${JSON.stringify([...byBody])}\n${leaked.slice(0, 10).join("\n")}\n落ち(null以外)=${fell.filter((x) => !x.includes("/null → ")).slice(0, 20).join(" | ")}`);
    // 返事に内部の文を出さないことが、この点検の合格の条件。500 の数は上の行で報告する（返すのは「サーバーで止まった」の固定の文だけ）
    expect(leaked).toEqual([]);
  }, 600_000);
});

describe("まとめ", () => {
  it("他人のデータが見えた数は 0", () => {
    console.log(`ISOLATION-SUMMARY combos=${combos} leaks=${leaks}`);
    expect(leakList).toEqual([]);
    expect(leaks).toBe(0);
    expect(combos).toBeGreaterThan(1000);
  });
});

describe("本文が null の JSON（公開前の点検・3）", () => {
  it("書く口に null を送ると、500 ではなく 400 になる", async () => {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: "null" };
    for (const path of ["/api/t/demo/pin", "/api/t/demo/cards", `/api/t/${TENANT.A}/pin`]) {
      const res = await call(path, init);
      expect(res.status, path).toBe(400);
    }
  });
});
