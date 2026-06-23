# SPREADSHEET.md — バックエンド スプレッドシート定義

キムチ製造電卓アプリのデータストア定義。新規スプレッドシート1つに以下のシートを用意する。
**列順・列名はこの定義を正本とする。** GAS はヘッダー名でマッピングすること（列番号直指定を避ける）。

---

## シート1: `records`（生データ / 全バッチ明細）

1バッチ = 1行。記録ボタンを押すたびに1行追加。編集は record_id で1件更新。
削除も record_id で対象の1行だけを削除し、他の行は変更しない。

| # | 列名 | 型 | 説明 | 例 |
|---|------|----|------|-----|
| 1 | record_id | 文字列 | 内部一意ID `YYYYMMDD-<code>-<連番3桁>` | 20260525-nakakara_am-001 |
| 2 | date | 日付 | 製造日 YYYY/MM/DD | 2026/05/25 |
| 3 | product_name | 文字列 | 製品表示名 | 中辛午前 |
| 4 | product_code | 文字列 | 製品コード | nakakara_am |
| 5 | time_slot | 文字列 | 時間帯（午前/午後/空） | 午前 |
| 6 | batch_no | 整数 | その日その製品の通し番号 | 2 |
| 7 | base_material | 文字列 | 入力基準（白菜/大根/チャンジャ） | 白菜 |
| 8 | base_kg | 数値 | 入力キロ数 | 20 |
| 9 | tare_type | 文字列 | タレ種類（A/B/C） | A |
| 10 | tare_kg | 数値 | タレ量(kg) | 5 |
| 11 | daikon_kg | 数値 | 大根量(kg) ※白菜系のみ | 2.8 |
| 12 | ninjin_kg | 数値 | 人参量(kg) ※白菜系のみ | 0.6 |
| 13 | nira_kg | 数値 | ニラ量(kg) ※白菜系のみ | 0.8 |
| 14 | konbu | 文字列 | 昆布（目安表記） | 1 握り（目安） |
| 15 | daikara_powder_g | 数値 | 大辛パウダー(g) ※大辛/チャンジャ | 510 |
| 16 | sugar_kg | 数値 | 砂糖(kg) ※ヤマダ | 0.95 |
| 17 | sesame_oil | 文字列 | ごま油（目安表記） ※チャンジャ | 大さじ 3（目安） |
| 18 | sesame | 文字列 | ごま（目安表記） ※チャンジャ | 大さじ 2（目安） |
| 19 | planned_units | 整数 | 原料量と商品内容量から求めた予定数（切り捨て） | 730 |
| 20 | created_at | 日時 | 記録日時 | 2026/05/25 10:32:11 |
| 21 | updated_at | 日時 | 最終更新日時 | 2026/05/25 10:35:40 |

- 製品で使わない材料列は空欄。
- 目安系（konbu / sesame_oil / sesame）は文字列のまま保存（重量化の方針は未確定）。
- 数値列は kg 単位。大辛パウダーのみ g 単位。

### ヘッダー行（1行目にこの順で記載）

```
record_id	date	product_name	product_code	time_slot	batch_no	base_material	base_kg	tare_type	tare_kg	daikon_kg	ninjin_kg	nira_kg	konbu	daikara_powder_g	sugar_kg	sesame_oil	sesame	planned_units	created_at	updated_at
```

---

## `products` 追加列

`content_g` に商品1個あたりの内容量（g）を保存する。既存シートにはGASが不足列を自動追加する。
ヤマダ白菜・大根はそれぞれ350g/200gの商品コードを分け、旧2商品は過去記録を保持したまま非表示にする。

## `daily_plans`（日別白菜予定）

| 列名 | 説明 |
|---|---|
| date | 対象日 |
| large_count | 大樽数（190kg/樽） |
| small_count | 小樽数（90kg/樽） |
| hundred_count | 100樽数（35kg/樽） |
| previous_kg | 昨日の残り（kg） |
| planned_kg | 上記の予定合計（kg） |
| updated_at | 更新日時 |

本日の使用量は `records` の同日・`base_material=白菜` の `base_kg` 合計から都度算出する。

---

## シート2〜5: 集計シート（自動更新）

`records` を元に GAS または QUERY 関数で自動集計。手入力しない。

- `daily`   : 日 × 製品 × 原材料使用量
- `weekly`  : 週（ISO週 or 月内週）単位
- `monthly` : 月単位
- `yearly`  : 年単位

各シート共通の集計軸:
- 製品別
- 原材料別（白菜 / 大根 / 人参 / ニラ / タレ(A/B/C別) / 大辛パウダー / 砂糖 / ごま油 / ごま）
- タレ種類別
- 時間帯別（午前 / 午後）

### monthly シート 列イメージ

| year_month | product_code | product_name | batches | base_kg計 | tare_kg計 | daikon_kg計 | ninjin_kg計 | nira_kg計 | daikara_g計 | sugar_kg計 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026/05 | nakakara_am | 中辛午前 | 42 | 840 | 210 | 117.6 | 25.2 | 33.6 | 0 | 0 |

---

## シート6: `purchase`（仕入れ用アウトプット）

期間（週/月/年）を指定すると、原材料ごとの総使用量を仕入れ計画として書き出す。
原材料を「実際に仕入れる単位」（白菜・大根・人参・ニラ・各タレ・パウダー・砂糖等）に集約する。

| material | unit | period | total_used | （任意）必要発注量 |
|---|---|---|---|---|
| 白菜 | kg | 2026/05 | 1,250 | |
| 大根 | kg | 2026/05 | 380 | |
| Aタレ | kg | 2026/05 | 420 | |

---

## 注意（過去の事例より）

- 列マッピングは**ヘッダー名で解決**する。列番号の直書きは行ずれバグの原因になるため避ける。
- レコード保存時は record_id の重複を必ずチェック。
- 編集時は record_id で行を検索し、その行のみ更新（全行書き換えをしない）。
- 日付は文字列ではなく日付型で保存し、表示時にフォーマット（過去に日付文字列処理のバグ事例あり）。
