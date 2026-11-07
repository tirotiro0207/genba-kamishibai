// 回答の記録の API（011 のサーバー）を呼ぶ
import type { CardMotion } from "../../shared/card";
import { pinLost } from "../events";
import { authHeaders, needsPin } from "../pin/TenantPin";
export type Shown = "card" | "text";
export interface Assignment {
  participant: string;
  /** 前からの回は 2 つ（カードと文の順番）、交差の回（11/5）は 1 つ */
  A: Shown[];
  B: Shown[];
  /** 交差の回だけ: 国籍と組 */
  group?: string;
  set?: 1 | 2;
}
export interface Trial {
  id: string;
  seed: string;
  participants: string[];
  assignments: Assignment[];
  /** order: 前からの回（同じ項目をカードと文の両方で）。cross: 1 人がカードと文を 1 つずつ（11/5） */
  design?: "order" | "cross";
}
export interface ResponseRow {
  seq: number;
  participant: string;
  item: "A" | "B";
  shown: Shown;
  ms: number | null;
  answer: string | null;
}

/** 会社のテナントでは、入ったしるしと役割のしるしを付けて呼ぶ（総点検の 2・3） */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const tenant = decodeURIComponent(path.split("/")[3] ?? "");
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...authHeaders(tenant), ...(init?.headers ?? {}) } });
  // JSON でない返事（前に立つ置き場の 5xx の HTML や 413 など）でも、読めない字ではなく HTTP の番号で伝える
  const body = await res.json().catch(() => ({}));
  // 送り直しで 409（済んでいる）を見分けられるように、HTTP の番号を付けて投げる
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    // 入ったしるしが切れた（401・403 で「PIN で入って」「役割で入って」）ときは、App の PinRescue に PIN の画面へ戻してもらう
    if ((res.status === 401 || res.status === 403) && needsPin(msg) && tenant) pinLost(tenant);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return body as T;
}

const base = (tenant: string) => `/api/t/${encodeURIComponent(tenant)}/trials`;

export const createTrial = (tenant: string, participants: string[], seed?: string) =>
  req<Trial>(base(tenant), { method: "POST", body: JSON.stringify({ participants, seed: seed || undefined }) });
export const getTrial = (tenant: string, id: string) => req<Trial>(`${base(tenant)}/${id}`);
export const listResponses = (tenant: string, id: string) => req<{ responses: ResponseRow[] }>(`${base(tenant)}/${id}/responses`).then((r) => r.responses);
export const postResponse = (tenant: string, id: string, body: { participant: string; item: "A" | "B"; ms?: number; answer?: string }) =>
  req<{ seq: number; shown: Shown }>(`${base(tenant)}/${id}/responses`, { method: "POST", body: JSON.stringify(body) });

// 採点（025）
export type Grader = "g1" | "g2";
export type Verdict = "correct" | "wrong" | "danger";
export interface Grade {
  seq: number;
  response_seq: number;
  grader: Grader;
  verdict: Verdict;
  answer_ja: string | null;
}
export const listGrades = (tenant: string, id: string, grader: Grader) => req<{ grades: Grade[] }>(`${base(tenant)}/${id}/grades?grader=${grader}`).then((r) => r.grades);
export const postGrade = (tenant: string, id: string, body: { response_seq: number; grader: Grader; verdict: Verdict; answer_ja?: string; field?: "ja" | "own" }) =>
  req<{ seq: number }>(`${base(tenant)}/${id}/grades`, { method: "POST", body: JSON.stringify(body) });
/** やめた参加者の答えを消す（025b）。答え・秒・訳を空にして印を付ける。消したあとはその人の答えを受け付けない */
export const eraseParticipant = (tenant: string, id: string, participant: string) =>
  req<{ erased: { responses: number; grades: number; pictures: number } }>(`${base(tenant)}/${id}/erase`, { method: "POST", body: JSON.stringify({ participant }) });
export const csvUrl = (tenant: string, id: string) => `${base(tenant)}/${id}/answers.csv`;

/** その参加者・項目で次に見せるもの（済んでいれば null） */
export function nextShown(a: Assignment, item: "A" | "B", rows: ResponseRow[]): Shown | null {
  const k = rows.filter((r) => r.participant === a.participant && r.item === item).length;
  return k < a[item].length ? a[item][k] : null;
}

// 絵だけの 8 枚と教育担当の勘（059）
export interface PictureCard {
  id: string;
  rule?: string;
  motion: CardMotion;
  /** 文つきで見せるカードのやさしい日本語（11/6 朝。半分のカードだけ） */
  words?: string;
}
export interface Forecast {
  card_id: string;
  rate: number;
  created_at: string;
}
export interface PicturesView {
  cards: PictureCard[];
  forecasts: Forecast[];
  answers: number;
  items: { item: "A" | "B"; ja: string | null; vi: string | null }[];
}
export const getPictures = (tenant: string, id: string) => req<PicturesView>(`${base(tenant)}/${id}/pictures`);
export const getMyPictures = (tenant: string, id: string, participant: string) =>
  req<{ cards: PictureCard[]; answered: string[] }>(`${base(tenant)}/${id}/pictures?participant=${encodeURIComponent(participant)}`);
export const setPictureCards = (tenant: string, id: string, cards: string[]) => req<{ cards: string[] }>(`${base(tenant)}/${id}/cards`, { method: "POST", body: JSON.stringify({ cards }) });
export const postForecast = (tenant: string, id: string, card_id: string, rate: number) =>
  req<{ seq: number; created_at: string }>(`${base(tenant)}/${id}/forecasts`, { method: "POST", body: JSON.stringify({ card_id, rate }) });
export const postPictureAnswer = (tenant: string, id: string, participant: string, answer: string, card_id?: string) =>
  req<{ seq: number; card_id: string }>(`${base(tenant)}/${id}/picture-answers`, { method: "POST", body: JSON.stringify({ participant, answer, card_id }) });
export const listTenantCards = (tenant: string) =>
  req<{ cards: { id: string; body: { rule: string; motion: CardMotion }; status: string }[] }>(`/api/t/${encodeURIComponent(tenant)}/cards`).then((r) => r.cards);

// ① で見せるもの（11/5 作者）: 交差の回の作り方と、項目ごとのカード・ページの画像
export const createCrossTrial = (tenant: string, people: { id: string; group: string }[], seed?: string) =>
  req<Trial>(base(tenant), { method: "POST", body: JSON.stringify({ design: "cross", participants: people, seed: seed || undefined }) });
export interface MaterialItem {
  item: "A" | "B";
  shown: Shown;
  /** 文の側: ページの画像の置き場の名前 */
  page?: string;
  /** 文の側: その参加者だけが読めるページの画像の口（11/6。新入社員は置き場を読めない） */
  page_src?: string;
  /** カードの側: 絵とやさしい日本語だけ */
  card?: { motion: CardMotion; words: { ja: string } | null };
}
export const getMaterial = (tenant: string, id: string, participant: string) =>
  req<{ items: MaterialItem[] }>(`${base(tenant)}/${id}/material?participant=${encodeURIComponent(participant)}`).then((r) => r.items);
export const getMaterialConfig = (tenant: string, id: string) =>
  req<{ material: Record<"A" | "B", { card: string; page: string }> | null }>(`${base(tenant)}/${id}/material`).then((r) => r.material);
export const putMaterial = (tenant: string, id: string, cfg: Record<"A" | "B", { card: string; page: string }>) =>
  req<unknown>(`${base(tenant)}/${id}/material`, { method: "PUT", body: JSON.stringify(cfg) });

/** 置き場の画像を、しるしを付けて読み、画面で使える URL にする（img にはしるしを付けられないため） */
export async function fileUrl(tenant: string, path: string, src?: string): Promise<string> {
  const res = await fetch(`/api/t/${encodeURIComponent(tenant)}/${src ?? `files/${path}`}`, { headers: authHeaders(tenant) });
  if (!res.ok) throw new Error(`ページの画像が読めない（HTTP ${res.status}）`);
  return URL.createObjectURL(await res.blob());
}
/** 置き場に画像を入れる */
export async function putFile(tenant: string, path: string, file: Blob) {
  const res = await fetch(`/api/t/${encodeURIComponent(tenant)}/files/${path}`, { method: "PUT", headers: { ...authHeaders(tenant), "content-type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

/** 交差の回の結果（11/5）。国籍ごとの数はまとめた数だけ */
export interface SummaryCell {
  item: "A" | "B";
  shown: Shown;
  n: number;
  median_ms: number | null;
  graded: number;
  correct: number;
  disagree: number;
}
export const getSummary = (tenant: string, id: string) =>
  req<{ all: SummaryCell[]; groups: { group: string; people: number; cells: SummaryCell[] }[]; hidden: number }>(`${base(tenant)}/${id}/summary`);

// 回の一覧・今の回・その場で加わる（11/6 作者）。新入社員は ID で入り、いちばん新しい交差の回に自分で加わる
export interface TrialSummary {
  id: string;
  created_at: string;
  design: "order" | "cross";
  participants: number;
}
export const listTrials = (tenant: string) => req<{ trials: TrialSummary[] }>(base(tenant)).then((r) => r.trials);
export const openTrial = (tenant: string) =>
  req<{ trial: { id: string; created_at: string; material: boolean; pictures: number } | null }>(`${base(tenant)}/open`).then((r) => r.trial);
export const joinTrial = (tenant: string, id: string, participant?: string) =>
  req<{ participant: string; group: string; set: 1 | 2 }>(`${base(tenant)}/${id}/join`, { method: "POST", body: JSON.stringify(participant ? { participant } : {}) });
