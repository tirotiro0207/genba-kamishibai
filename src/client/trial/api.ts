// 回答の記録の API（011 のサーバー）を呼ぶ
import type { CardMotion } from "../../shared/card";
import { authHeaders } from "../pin/TenantPin";
export type Shown = "card" | "text";
export interface Assignment {
  participant: string;
  A: [Shown, Shown];
  B: [Shown, Shown];
}
export interface Trial {
  id: string;
  seed: string;
  participants: string[];
  assignments: Assignment[];
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
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
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
export const postGrade = (tenant: string, id: string, body: { response_seq: number; grader: Grader; verdict: Verdict; answer_ja?: string }) =>
  req<{ seq: number }>(`${base(tenant)}/${id}/grades`, { method: "POST", body: JSON.stringify(body) });
export const csvUrl = (tenant: string, id: string) => `${base(tenant)}/${id}/answers.csv`;

/** その参加者・項目で次に見せるもの（済んでいれば null） */
export function nextShown(a: Assignment, item: "A" | "B", rows: ResponseRow[]): Shown | null {
  const k = rows.filter((r) => r.participant === a.participant && r.item === item).length;
  return k < 2 ? a[item][k] : null;
}

// 絵だけの 8 枚と教育担当の勘（059）
export interface PictureCard {
  id: string;
  rule?: string;
  motion: CardMotion;
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
export const postPictureAnswer = (tenant: string, id: string, participant: string, answer: string) =>
  req<{ seq: number; card_id: string }>(`${base(tenant)}/${id}/picture-answers`, { method: "POST", body: JSON.stringify({ participant, answer }) });
export const listTenantCards = (tenant: string) =>
  req<{ cards: { id: string; body: { rule: string; motion: CardMotion }; status: string }[] }>(`/api/t/${encodeURIComponent(tenant)}/cards`).then((r) => r.cards);
