# README の下書き（078）

README に入れる 3 つの節の下書き。ライセンスは作者が決める（決まるまで未決）。決まったら README.md に移し、このファイルは消す。

## License

**未決。** 次の 3 つから作者が選ぶ。

| 案 | 誰が何をできるか | 選ぶ理由 | 気になること |
|---|---|---|---|
| A. MIT | 誰でも写して、直して、商用でも使える。著作権の表示を残すだけ | いちばん広く使ってもらえる。ほかの業界・ほかの言葉へ広げる人が、手続き無しで始められる | ほかの会社がそのまま写して、有料のサービスとして売れる。作者の有料のサービスと食い合う |
| B. AGPL-3.0 | 誰でも使えて直せる。ただし直したものを Web のサービスとして人に使わせるなら、直したソースも公開しないといけない | オープンソース（OSI の承認あり）のまま、写して閉じたサービスにすることを止められる。直しが公開されるので、ほかの現場の直しも戻ってくる | 会社が社内で直して使うのをためらうことがある。作者自身が別の有料版を作るときは、作者が権利を持つ部分だけにする必要がある |
| C. PolyForm Noncommercial 1.0.0 | 商用でなければ誰でも使えて直せる。商用で使うには作者の許可が要る | 学校・研修・個人の学習には無料で広げつつ、商用は作者が決められる | オープンソースの定義には当たらない（ソースは見られるが自由ではない）。公開の決まりに合うかを先に確かめる必要がある |

## 利害の開示（Disclosure）

作者は、この仕組みを試しに使ってもらう会社（電気工事会社、1923 年創業）に、別の翻訳のサービスを有償で提供している。そのため、結果を作者に都合よく見せていないことが分かるように、新入社員の答えはアプリが記録し（記録は追記だけで、書き換えも消すこともできない）、公開に同意した人の答えを、名前を消して `docs/answers.csv` で公開した。

> The author provides a separate paid translation service to the company where this was piloted (an electrical contractor founded in 1923). So that the results cannot be tilted in the author's favor, every new hire's answer was recorded by the app itself (append-only — no edits, no deletions), and the answers of those who agreed to publication are published anonymously in `docs/answers.csv`.

## 出どころ（Sources）

**開始前に作ったもの**

- 評価データ（30 項目の正解表）: 元の 30 文は、作者が法令（労働安全衛生規則など）と厚生労働省の公開資料から選んだ。答え（やること・やらないこと・なぜ）は作者が AI の補助で下書きし、監修者 2 名が全部の箇所を確かめて直し、確定した。出典は各行にある
  > Answer key finalized by two site supervisors — drafted by the author with AI assistance; every field reviewed and corrected by the supervisors. The 30 source sentences were chosen by the author from Japanese occupational-safety law and public materials of the Ministry of Health, Labour and Welfare.
- 絵柄の手描きのスケッチ（`docs/sketches/`）: 作者が手で描いた
- 試しに使ってもらう会社の安全のマニュアル: 会社の資料なので、リポジトリには入れていない。カードの下書きは、その会社専用の非公開の置き場にだけある

**開始後に作ったもの**

- 本番のプロンプトは、開始後にゼロから書いた。下書きに使った指示は入れていない
  > All production prompts were written from scratch during the event. No draft instructions from before the event are included.
- コードは全部、開始後に一から書いた。開始前に作ったコードや HTML は持ち込んでいない
- カードの「言葉」の欄のベトナム語は Claude が訳し、小さな用語表（日本語・ベトナム語・どのカードで使うか）にまとめた。用語表はベトナム語の分かる人が確かめた（確かめ終わったら、この一文を残す）
