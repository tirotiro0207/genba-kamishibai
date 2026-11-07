-- 会社の言葉の掃除（11/7）。人の直しから積んだ言い換え・使わない言い方のうち、ふりがなの記法（｜ 《 》）を含む行を消す。
-- ふりがなを付けただけの直しが、言い換えとして積まれていた。今は積む前にふりがなを外してから比べる（src/shared/company-words.ts）
DELETE FROM company_words
WHERE source = 'edit'
  AND (instr(phrase, '《') > 0 OR instr(phrase, '》') > 0 OR instr(phrase, '｜') > 0
    OR instr(prefer, '《') > 0 OR instr(prefer, '》') > 0 OR instr(prefer, '｜') > 0);
