# ピクトグラムの絵柄の決まり（髪・服・小物）

人の新しい絵柄（`src/shared/picto/character.ts`・`outfit.ts`・`avatar.ts`・`hair-traced.ts`）を実際に描いて測り、数字にした決まりです。
小物（`src/shared/picto/props.ts`）は、この決まりに合わせて描きます。人の層の分け方とかぶり物は `docs/picto-style.md` にあります。

数字の単位は 2 つです。

- **人の単位:** 背の高さ 434 の中の値（`character.ts` の座標）。頭の部品は首の付け根が原点で、顔は y −70〜0。
- **キャンバスの単位:** 1 コマの幅に対する割合（`props.ts` の size と同じ）。人は背の高さ 0.55 前後で立つので、人の単位の 1 はキャンバスのおよそ 0.0013 です。

## 1. 線の太さ

| 部位 | 太さ（人の単位） | 小物での値 |
|---|---|---|
| 顔・首・手の丸・靴・かぶり物 | 5 | 縁の太さ W（下） |
| 胴・ベスト・服の外まわり | 6 | W |
| 手足 | 縁の回 40・中身の回 28（外へ 6 ずつ） | 綱・柄・管は同じ 2 回描き（`cord`） |
| 服の内の線（襟・前立て・ポケット・ファスナー） | 3〜4 | W × 0.5〜0.7 |
| マスクの紐・名札の線 | 2.5〜3 | W × 0.5 |
| 髪のつやの線 | #777 の細い線 | つや（6 節） |

- **小物の縁の太さ W は、キャンバスの幅 × 0.0068**（幅 768 で 5.2）。人の縁（5〜6）と同じ太さになります。
- **W は小物の大きさで変えません。** 大きな盤も小さな錠前も、人と同じ太さの縁で描きます。太さがそろうと、1 枚の絵として読めます。
- **例外は印**（○・×・✓・禁止・下向きの矢印・札の ×）。印は記号なので、大きさに合わせて太さを変えます（大きさ × 0.1 を基準に、○と×は 1.5 倍、禁止の赤は 1.2 倍）。
- 吹き出しの縁も W です。吹き出しの中の小さい道具は W × 0.7 で描きます。

## 2. 色（黒・灰・白）

色は黒・灰色・白だけです（R=G=B）。例外は禁止の赤（#d42a1e）だけです。

| 色 | 人での使いどころ | 小物での使いどころ |
|---|---|---|
| #000（黒） | 縁・髪・目 | 縁・印・車輪の芯 |
| #222 | 上の人のかぶり物・ネクタイ | 上の人の帽子、包丁の柄、車輪 |
| #333 | 胴の帯・奥のズボン・制服 | 台・取っ手・ふた・表示の窓・弁 |
| #555 | 反射のベスト・ズボン | 濃い本体（道具箱・錠前・消火器・鍋・ハンマーの頭） |
| #777 | つやの線・つなぎ | 金属の面（ボンベ・台車・フォークリフト・はしごの段） |
| #999 | ほかの作業の人のかぶり物 | 柄・綱・灰の本体（箒の柄・バケツ・歯車・手袋） |
| #ccc | ベスト | 明るい本体（盤・箱・刃・レンズ・薬品の容器） |
| #f4f4f4（紙の白） | — | いちばん明るい面（札・紙・救急箱・帯の模様） |
| #fff（白） | 顔・手・シャツ・首・白いかぶり物 | 新人のヘルメットと吹き出しの中だけ |

- 小物で白（#fff）を使えるのは、新人のヘルメット（`data-part="helmet-new"`）と吹き出し（`data-part="bubble"`）だけです。絵柄の検査（`style.ts`）がそう決めているので、ほかの明るい面は紙の白 #f4f4f4 にします。
- 1 つの小物に使う灰は 2〜3 段までにします。隣り合う面は 2 段以上離します（#ccc の隣に #999 は置かず、#777 か #555 にする）。
- 強調は色でなく、太さ・大きさ・明暗・枠で出します。

## 3. 角の丸み

- 胴は角の丸い四角（幅 92 に半径 30。短い辺の約 1/3）。顔は角の丸い形（幅 90・高さ 70）。靴のつま先も丸めます。
- 小物の箱と板は、短い辺の 0.2 前後の半径で丸めます（`rr` の初めの値 0.22）。とがった角は作りません。
- 柄・軸・管は端まで丸くします（半径＝太さの半分）。
- とがってよいのは、印（矢印の先・× の端は丸い線の端）と、刃の切っ先と、カラーコーンの頭（ほんの少し丸める）だけです。

## 4. 線のつなぎ方と重ね順

- **つなぎ目:** 縁はどれも `stroke-linejoin="round"`、線の端は `stroke-linecap="round"`。
- **塗りと縁:** 1 つの形は、塗りと縁を 1 つの要素で描きます（縁が塗りの上に乗る）。
- **重なった形のつなぎ目:** 手足と同じく 2 回描きにします。まず全部の形の縁（太さ 2 倍）、次に全部の形の中身。こうすると形と形の境の線が消え、外まわりの縁だけが 1 本につながります（`merge`。スパナ・手袋・めがね）。
- **綱・柄・管:** 黒の太い線の上に、W × 1.6 細い中身の線を重ねます（`cord`）。
- **模様の入った面:** 塗り → 模様（帯・縞） → 縁の順。模様が縁の線を隠しません（カラーコーン・立入禁止のバー）。
- **部品の中の順:** 奥のもの → 本体 → 手前のもの。たとえば、はしごは踏みさんを先に描き、柱でその端を隠します。取っ手・ホース・アンテナは本体の後ろなら先に、前なら後に描きます。
- **コマの中の順:** 壁と床 → 壁や床に置く小物 → 人とかぶり物 → 人に付ける小物 → 吹き出し（`scene.ts`）。

## 5. 影と光（つや）

- 影は描きません。ぼかし・グラデーションも使いません。
- 光はカメラの側から当たると考えます。手前ほど明るく、奥ほど暗くします（奥の足のズボンは手前の 0.45 倍の明るさ。明るい服は 0.85 倍）。小物でも、奥にある部品（脚立の奥の足など）を 1 段暗くします。
- **つや:** 人では、かぶり物の無い髪にだけ #777 の線を足します。小物では、濃い面と金属・レンズに、光の来る側（左上）へ短い明るい線を 1 本だけ足します（`shine`）。
  - 下地が #555・#333 なら #999、#777・#999 なら #ccc、#ccc なら #f4f4f4。
  - 太さは W × 0.7。長さは面の 1/4〜1/3。1 つの小物に 1〜2 本まで。

## 6. 大きさの比

人の頭（顔の高さ 70・幅 90）は髪を入れて背の高さの約 1/5、手の丸は直径 30（背の高さの 7%）です。小物の大きさ（size）は、背の高さ 0.55 の人に対して次を目安にします。

| 種類 | size の目安 | 頭に対して | 例 |
|---|---|---|---|
| 手に持つ小さい道具 | 0.10〜0.14 | 長さが頭の 1〜1.5 倍 | 検電器・包丁・スパナ・金づち・無線機・水の入れ物 |
| 手に持つ長い道具 | 0.14〜0.18 | 長さが背の高さの 1/3〜1/2 | 箒・モップ・電線 |
| 抱える・床に置く箱 | 0.15〜0.22 | 幅が頭の 1.5〜2 倍 | 箱・道具箱・救急箱・バケツ・鍋 |
| 床に立つもの | 0.18〜0.30 | 高さがひざ〜腰 | カラーコーン・消火器・ボンベ・立入禁止のバー・台車 |
| 床に立つ大きいもの | 0.30〜0.45 | 高さが胸〜背の高さ | はしご・脚立・フォークリフト |
| 壁に付くもの | 0.12〜0.25 | 幅が頭の 1〜2 倍 | 盤・コンセント・蛇口・時計 |
| 印 | 0.12〜0.25 | — | ○・×・✓・禁止・矢印 |

- かぶり物と保護めがねを頭に付けたときは size を使わず、頭の大きさ（頭の半径の 2.5 倍）に合わせます。手袋を手に付けたときは、手の丸の大きさ（手の半径の 3.6 倍）に合わせます。
- 吹き出しの中の道具は、吹き出しの高さの 0.62 倍に描きます。床に置く道具は、箱の真ん中に来るよう下へずらします。

## 7. 向き

- **人:** 正面・斜め・真横の 3 つ。左向きは右向きを反転して作ります（`docs/picto-style.md` 5 節）。
- **小物:** いちばん形が分かる向き 1 つで描き、付けた人の向き（d）で左右だけ入れ替えます。
  - 手に持つ道具・乗り物・脚立は**真横**（刃・口・爪・ノズルは向いている側）。
  - 板・札・表示・箱・救急箱・印は**正面**（左右を入れ替えても同じ形）。
  - 保護めがねは、頭に着けると真横（目の前のレンズと後ろへ回るバンド）、持つ・置くときは正面。
  - 手袋は、手に着けると手の丸を覆う形と向いている側の親指、持つ・置くときは正面の手の形。
- 小物の「持つところ」（c）: 手に持つ道具は握るところ、床に置くものは下の真ん中、壁に付くものは真ん中か壁の台、頭に付けるものは頭。

## 8. 小物の一覧（87）

- **初めからの 30:** helmet・helmet_new・cap_lead・harness・tester・wire・panel・bubble_question・bubble_check・suspended_load・arrow_down・broom・box・lock・tag・clock・checklist・prohibit・circle_mark・cross_mark・outlet・toolbox・check_mark・think_question・think_check・unwell・span_arrow・edge・anchor_line・trash_bin。名前は変えずに、この決まりで描き直しました。
- **業種が増えた分の 25:** 下の表で多くの業種に出る順に選びました。cone（カラーコーン）・barrier（立入禁止のバー）・ladder（はしご）・stepladder（脚立）・fire_extinguisher（消火器）・first_aid（救急箱）・gloves（手袋）・goggles（保護めがね）・knife（包丁）・hot_pot（熱い鍋）・cart（台車）・forklift（フォークリフト）・spill（こぼれた水・油）・bucket（バケツ）・mop（モップ）・chemical（薬品の容器）・gas_cylinder（ガスのボンベ）・hammer（金づち）・wrench（スパナ）・grinder（ディスクグラインダー）・gear（回る機械・巻き込まれ）・sun（暑さ）・water_bottle（水の入れ物）・faucet（手洗いの蛇口）・radio（無線機）。
- 吹き出しの中に描ける道具に、消火器・救急箱・手袋・保護めがね・カラーコーン・はしご・薬品の容器・包丁・歯車を足しました。
- **脚本の段で足りなかった 8:** spark（火花）・bubble_say・bubble_alert・elapsed_1min〜elapsed_1h（たった時間の札 5 つ）。
- **電気の現場の道具と保護具 21（11/5。表は `docs/props-2026-11-05.md`）:** 新しく 17 を足しました。aed・cubicle（キュービクル）・wristband・work_platform（立馬）・rolling_scaffold（可搬式移動足場）・safety_shoes・cut_gloves・insulated_gloves・voltage_detector（ペン形の検電器。今の tester とは別）・cooling_vest（空調服）・step_stool（簡易作業台）・armband・crane・insulated_boots・dust_mask・power_drill・aerial_platform（高所作業車）。
  - 今の名前のまま使うもの: cart・stepladder。写真に合わせて描き直したもの: harness（置いたときはフルハーネスの形。人に付けたときは今までどおり腰のベルトと体に沿うベルト）・goggles（持つ・置くときは両目を 1 枚で覆うレンズ）。
  - 着る物 10 は、新しい人の絵（`character.ts`）にも着せられます（`outfit.ts`）: `eyewear: "goggles"`・`respirator`・`wear: fullHarness`・`wear: fanJacket`・`armband: "cross"`・`wristband`・`glove: "cut" | "insulated"`・`shoes: "safety"`・`bootsHigh`。どれも付けないときは、今までの絵と 1 文字も変わりません。
  - 場面の人（`scene.ts`）では、頭（保護めがね・防塵マスク）と手（2 つの手袋・リストバンド）に付けると、着けた形で描きます。
  - クレーンの先（`craneTip`）の近くに吊り荷（`suspended_load`）を置くと、吊り荷は先の真下へ寄り、ワイヤーが先から垂れます。
  - 吹き出しの中に描ける道具に、AED・検電器（ペン形）・絶縁の手袋・防塵マスク・電動ドリル・腕章を足しました。
  - 1 つずつの SVG は `assets/props/<名前>.svg`（`npx tsx scripts/export-props.ts` で書き出し直す）。
- **8 枚の口の直しで足りなかった部品（11/6）:** 作者の好み（人は少なく、小物は入れすぎず、○・×・禁止の印で見せる）に合わせ、1 つで意味が通る部品にしました。
  - bulb_flicker（ちらつく電球）: ちらつく照明を付けてしまう「×」のコマに。ずれた二重の輪郭と、長さも向きもそろわないギザギザの線で「不安定」を見せる。
  - bulb_steady（安定した電球）: 正しい照明の「○」のコマに。同じ長さの光の線で「安定」を見せる。どちらの電球も、手に持つとガラスが上、キャンバスに置くと天井からコードで下がる。
  - danger_zone（床の点線の範囲）: 吊り荷の真下など、立ち入らない範囲を床に点線の楕円で示す。中に立てば「×」、外に出れば「○」と読める。
  - partition（低い仕切り）: 要る物と要らない物を分けたことを、床に立つ板 1 枚で見せる。
  - wire_broken（切れた電線）: 作業中に見つけた不具合を、線の切れ目と飛び出した芯で見せる（火花は描かない）。
  - height_2m（高さの札）: 床から足もとまでの縦の矢印と「2m」。数字と単位だけを線で描く（たった時間の札と同じ扱い。作者の判断）。
  - fever（熱がある顔）: 吹き出しの中に入れて「体調が悪い」と言わせる。ぎゅっと閉じた目・ほおの斜線・くわえた体温計・湯気。
  - 2 つ入る吹き出し（`inner2`・`inner_marks`）: 道具 2 つを並べ、それぞれに ？・○・× を付ける。「どっち？」「こっちは○、こっちは×」を 1 つの吹き出しで見せ、人と小物を増やさずに済む。
  - 人の表情（`expression`）: 場面の人に avatar.ts の表情を付ける。sad はへの字の口と下がった眉。
  - 疲れの線（`tired`）: 顔の上の半分に縦の線 3 本（長い・中くらい・短い）。顔が小さいので目の上は通さず、髪にかかる所にも置かない。
  - 高い所に立つ（`lift`）: 人の足の下の高さ。台の上の面の高さは `STAND_TOP`（台の size × 割合）。作業台なら size × 0.59。

## 9. 業種 → 小物の候補

業種の番号と名前は `src/shared/picto/industry-drafts.ts` と同じです。「済み」は PROP_KINDS にある小物、「まだ」は候補で、まだ描いていない小物です。

| 業種 | 済み（使える小物） | まだ |
|---|---|---|
| 01 電気工事 | tester・voltage_detector・wire・panel・cubicle・outlet・harness・anchor_line・lock・tag・ladder・stepladder・work_platform・rolling_scaffold・step_stool・aerial_platform・gloves・insulated_gloves・cut_gloves・insulated_boots・safety_shoes・goggles・armband・wristband・cooling_vest・power_drill・aed・toolbox | 電柱 |
| 02 建設 | harness・anchor_line・suspended_load・crane・rolling_scaffold・work_platform・aerial_platform・edge・cone・barrier・ladder・hammer・grinder・power_drill・safety_shoes・cut_gloves・dust_mask・armband・cooling_vest・sun・water_bottle・aed | 開口部のふた・ミキサー車 |
| 03 造船・舶用工業 | harness・suspended_load・grinder・gas_cylinder・goggles・ladder・edge | 溶接の火・船の手すり |
| 04 工場の製造 | gear・gloves・goggles・forklift・cart・lock・tag・chemical | 機械の非常停止の押しボタン・安全カバー |
| 05 自動車の整備 | wrench・spill・chemical・gloves・goggles・fire_extinguisher | ジャッキ・リフトに上げた車・タイヤ |
| 06 厨房 | knife・hot_pot・spill・gloves・faucet・first_aid・fire_extinguisher | 揚げ物の油・まな板・ガスこんろ |
| 07 配膳・ホール | spill・hot_pot・cart・mop | お盆・割れた食器 |
| 08 食品の工場 | faucet・gloves・knife・gear・cart・spill・chemical | 手の消毒・異物の印 |
| 09 小売・コンビニ・スーパー | box・cart・stepladder・spill・mop・knife | 棚・かご |
| 10 宿泊 | cart・spill・mop・bucket・chemical・stepladder | ベッド・シーツの束 |
| 11 介護 | gloves・faucet・spill・first_aid | 車いす・ベッドの柵・手すり |
| 12 病院 | gloves・faucet・first_aid・chemical・trash_bin | 注射の針と捨てる箱・車いす・点滴の台 |
| 13 ビルの清掃 | mop・bucket・chemical・spill・stepladder・cone・gloves | 「清掃中」の立て札・窓の清掃のゴンドラ |
| 14 警備 | cone・barrier・radio・sun・water_bottle | 誘導の灯・車 |
| 15 物流倉庫 | forklift・cart・box・cone・stepladder・gloves | パレット・棚のラック・荷のはい |
| 16 農業 | sun・water_bottle・bucket・ladder・gloves・chemical | トラクター・草刈り機・鎌 |
| 17 漁業・水産加工 | knife・gloves・spill・faucet・box | 救命胴衣の着け方・網・氷の箱 |
| 18 林業・製材 | gloves・goggles・sun・first_aid | チェーンソー・倒れる木・丸のこ |
| 19 自動車運送 | radio・cone・water_bottle・clock・box | トラック・荷台・運転席 |
| 20 鉄道 | radio・barrier・cone・edge | 線路・列車・ホームの端の線 |
| 21 航空 | radio・cone・cart | 航空機・誘導の棒・耳当て（服の部品にある） |
| 22 リネンサプライ | cart・gear・box・gloves | 洗濯機・シーツの束 |
| 23 資源循環 | forklift・gloves・goggles・trash_bin・box | 圧縮の機械・ごみの山 |
| 24 金属の加工・溶接 | grinder・gas_cylinder・goggles・gloves・fire_extinguisher・hammer | 溶接の火・プレスの機械 |
| 25 鋳造 | gloves・goggles・hot_pot・suspended_load | 溶けた金属の取鍋・砂型 |
| 26 塗装 | chemical・goggles・gloves・fire_extinguisher・stepladder | スプレーのガン・換気扇 |
| 27 電子部品の組み立て | gloves・goggles・chemical | はんだごて・静電気の手首のひも |
| 28 縫製・繊維 | gear・gloves | ミシン・はさみ・針 |
| 29 印刷・製本 | gear・lock・tag・box | 印刷の機械のローラー・断裁の機械 |
| 30 プラスチック成形・包装 | gear・gloves・hot_pot・box・cart | 成形の機械・カッター |
| 31 解体 | grinder・hammer・goggles・dust_mask・crane・cone・barrier・suspended_load・edge・safety_shoes・armband | 崩れるもの |
| 32 配管・設備・空調 | wrench・gas_cylinder・ladder・stepladder・work_platform・aerial_platform・power_drill・goggles・gloves | 管・溶接の火 |
| 33 内装 | stepladder・ladder・step_stool・work_platform・rolling_scaffold・hammer・power_drill・goggles・cart | カッター・ボード |
| 34 パン・製菓 | hot_pot・gear・gloves・faucet・knife | オーブン・ミキサー |
| 35 精肉・鮮魚 | knife・gloves・faucet・spill・gear | 切る機械・まな板 |
| 36 畜産 | bucket・gloves・sun・water_bottle・faucet | 牛・柵 |
| 37 漁船・養殖 | gloves・knife・box・spill | 救命胴衣の着け方・網・船の手すり |
| 38 引越し・宅配 | box・cart・gloves・water_bottle・stepladder | トラック・階段 |
| 39 クリーニング店 | chemical・gear・hot_pot・gloves | アイロン・洗濯機 |
| 40 理容・美容 | chemical・gloves・faucet・spill | はさみ・ドライヤー・かみそり |

- 多くの業種に出る「まだ」の候補は、車いす（介護・病院・航空）・トラック（運送・引越し・物流）・はさみ（縫製・理容・美容）・溶接の火（造船・溶接・配管）・パレット（物流・工場）です。次に足すときは、この順を目安にします。

## 10. 小物を足すとき

1. 名前（英語の小文字と _）を `PROP_KINDS` の最後に足し、`DEFAULT_JOINT` に付ける関節（無ければ null）を入れる。床に置くものは `ON_FLOOR` にも足す。
2. 形を `shape` の switch に足す。上の 1〜7 節の太さ・色・丸み・重ね順・つや・向きで描く。
3. 人の横に置いた一覧を描いて、太さと明るさがほかの小物と人にそろっているかを目で見る。
4. 絵柄の検査（`checkStyle`）が通るかを、`tests/picto-props.test.ts` で見る。

## 11. 姿勢と動きの決まり

人の姿勢は `src/shared/picto/poses.ts` の名前の付いた姿勢（`POSES`、27 個）を土台にします。棒人間（骨）で形を確かめてから、服を着た人形に当てています。

- **土台から派生させる（7 対 3）:** 動きのキーフレームも 1 枚の絵も、手本の姿勢のどれか 1 つを土台にします。
  - 10 の関節のうち 7 つ以上は手本の数のまま変えません。
  - 動かしてよい関節は 3 つまでで、1 つ ±30 度までです（ひじだけ曲げる、首だけ上げる、など）。
  - 手本に無い動きも、いちばん近い手本から少しだけ変えて作ります。
  - 確かめる関数は `derivedFrom`（土台の名前と、動かした関節を返す）、作る関数は `vary` です。
  - AI に絵の数字を書かせるプロンプト（`src/shared/picto/draw.ts`）にも同じ決まりを入れています。
- **向き:** 動きの大きい姿勢（歩く・走る・倒れる・つまずく・押す・引く・持ち上げる・運ぶ・上る・しゃがむ・ひざをつく・座る・おじぎ）は、正面を使わず斜めか真横で描きます（`MOVING_POSES`・`viewFor`）。
  - 正面は、最初に立っている・待っている・向き合って話すなど、その場で止まっている場面に使います。
- **重ね順:** 胴は足の上にかぶせます。ももを上げた姿勢でも、足を胴の前に出しません。
- **奥の足の影:** 今までの奥の足の色を 1 として、斜め 0.35・真横 0.75 の濃さにします。正面は影なしで、足が前後に開く姿勢だけ、後ろの足に 0.35 の影を付けます。
- **首:** 首を傾けるときは、付け根で首ごと半分傾け、頭で残りの半分を傾けます。首の下の端は胴の中へ押し込みます。

