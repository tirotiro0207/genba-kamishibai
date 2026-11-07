// 答えの欄 2 つ（11/5 作者）。上は日本語の欄、下は自分の言葉で書く補足の欄（母語でよい）。どちらか 1 つが書けていれば送れる
import { ANSWER_FIELD_MAX, type AnswerFields } from "../../shared/answer-fields";

export function AnswerBoxes({ value, onChange, disabled, testid }: { value: AnswerFields; onChange: (v: AnswerFields) => void; disabled?: boolean; testid: string }) {
  return (
    <>
      <label>
        なにを すれば いいと おもいますか
        <textarea value={value.ja} disabled={disabled} onChange={(e) => onChange({ ...value, ja: e.target.value })} rows={3} lang="ja" maxLength={ANSWER_FIELD_MAX} data-testid={`${testid}-ja`} />
      </label>
      <label>
        じぶんの ことばで（かかなくても よい）
        <textarea value={value.own} disabled={disabled} onChange={(e) => onChange({ ...value, own: e.target.value })} rows={3} maxLength={ANSWER_FIELD_MAX} data-testid={`${testid}-own`} />
      </label>
    </>
  );
}
