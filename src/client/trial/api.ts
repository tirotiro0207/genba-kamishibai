// 回答の記録の API（011 のサーバー）を呼ぶ
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
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
