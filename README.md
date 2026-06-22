# kimfoods-recipe-calc — キムチ製造電卓アプリ

KimFoods 自社工場向けのキムチ製造電卓 + 製造記録システム。
現場ユーザーが製品を選び、白菜 / 大根 / チャンジャのキロ数を入力すると、
必要なタレ種類・量と全副材料を自動計算・表示し、1バッチ単位で記録を保存する。

今日の白菜予定（大樽210kg / 小樽90kg / 100樽35kg / 昨日の残り）を日別に共有し、
保存済みの白菜使用量を差し引いた残量と、商品内容量に基づく予定製造数も表示する。

- **フロント**: 素の HTML + CSS + JavaScript（GitHub Pages 公開、iPad 横向き最適化）
- **バックエンド**: Google Apps Script + Google スプレッドシート（`gas/`）
- **配合の正本**: [`recipes.js`](recipes.js)（係数はここだけ。フロント・GAS 共用）

詳細は [`REQUIREMENTS.md`](REQUIREMENTS.md) / [`SPREADSHEET.md`](SPREADSHEET.md) / 開発規約 [`CLAUDE.md`](CLAUDE.md) を参照。

## 構成

```
├── index.html        フロント本体（C案 2ペイン）
├── style.css         スタイル
├── app.js            画面制御・計算（recipes.js 参照）・GAS API・記録一覧/編集
├── recipes.js        配合の正本（COEFFICIENTS / PRODUCTS / calcRecipe）
└── gas/
    ├── Code.gs        GAS バックエンド（doGet/doPost: 記録の作成/一覧/編集）
    └── appsscript.json
```

## 使い方（現場）

製品を選ぶ → 基準材料の kg を入力 → タレ・副材料が自動表示 → 「記録」。
記録一覧から内部ID（`YYYYMMDD-<製品コード>-<連番3桁>`）で1件ずつ編集できる。

## セットアップ（開発者向け）

### フロント
GitHub Pages（main / root）で公開。`app.js` の `CONFIG.GAS_URL` に GAS WebApp の `/exec` URL を設定済み。

### バックエンド（GAS / clasp）
スクリプトは専用スプレッドシート「キムチ製造記録_DB」にバインド。

```bash
cd gas
clasp push          # コード反映
clasp redeploy <deploymentId> --description "..."   # 同URLで更新
```

- 列定義は [`SPREADSHEET.md`](SPREADSHEET.md) を正本とし、GAS はヘッダー名でマッピング。
- 営業日はサーバ（JST）基準で採番・保存。
- スコープは最小権限（`spreadsheets.currentonly`、`getActiveSpreadsheet()`）。

## 開発の進め方

要件確定 → UIプロトタイプ確認 → 実装（フロント+GAS）→ ブラウザ/実機テスト → 本番リリース。
（未実装: 集計シート daily/weekly/monthly/yearly ＋ 仕入れ用 purchase）
