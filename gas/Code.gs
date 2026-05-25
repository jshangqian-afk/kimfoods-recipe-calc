/**
 * Code.gs — キムチ製造電卓 バックエンド（Google Apps Script WebApp）
 *
 * 仕様の正本: SPREADSHEET.md（列順・列名）/ REQUIREMENTS.md §6（記録）
 * - 列マッピングはヘッダー名で解決（列番号の直書き禁止 = 行ずれ防止）
 * - record_id = YYYYMMDD-<product_code>-<連番3桁>。同日・同製品で自動採番。
 * - 編集は record_id で1行のみ更新（他レコードに影響なし）。
 * - 日付は日付型で保存。
 *
 * セットアップ手順:
 *   1) 専用スプレッドシートを作成し、その ID を SPREADSHEET_ID に設定
 *      （またはスプレッドシートにバインドして空のままでも可）
 *   2) GASエディタで setup() を1回実行（records シートとヘッダーを作成）
 *   3) デプロイ → ウェブアプリ（アクセス: 全員）→ /exec URL を app.js の CONFIG.GAS_URL に設定
 */

var SPREADSHEET_ID = "1cSbdsO0r7dAbO9TZCqx3ulQCVQa0XbNwnsr7EAEzhgw"; // キムチ製造記録_DB
var RECORDS_SHEET = "records";
var TZ = "Asia/Tokyo";

// SPREADSHEET.md の records 列順（この配列がヘッダーの正本）
var HEADERS = [
  "record_id", "date", "product_name", "product_code", "time_slot", "batch_no",
  "base_material", "base_kg", "tare_type", "tare_kg", "daikon_kg", "ninjin_kg",
  "nira_kg", "konbu", "daikara_powder_g", "sugar_kg", "sesame_oil", "sesame",
  "created_at", "updated_at"
];

// 編集時にフロントから更新を許可する列（id/date/code/batch_no/created_at は不変）
var EDITABLE = [
  "product_name", "time_slot", "base_material", "base_kg", "tare_type", "tare_kg",
  "daikon_kg", "ninjin_kg", "nira_kg", "konbu", "daikara_powder_g", "sugar_kg",
  "sesame_oil", "sesame"
];

// 製品マスタ（実行時に追加・論理削除する。係数は recipes.js が正本のまま）
var PRODUCTS_SHEET = "products";
var PRODUCT_HEADERS = [
  "code", "name", "order", "group", "base", "tare_type", "time_slot",
  "ex_daikara", "ex_changja_daikara", "ex_sesame_oil", "ex_sesame", "ex_sugar",
  "active"
];

/* ============ スプレッドシート / シート取得 ============ */
function getSpreadsheet_() {
  // バインドスクリプトでは getActiveSpreadsheet() が対象シート（spreadsheets.currentonly で可）。
  // 標準スクリプト運用に切り替えた場合のみ openById(SPREADSHEET_ID) にフォールバック（要 spreadsheets スコープ）。
  var active = SpreadsheetApp.getActiveSpreadsheet();
  return active ? active : SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getRecordsSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(RECORDS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(RECORDS_SHEET);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 初回セットアップ: records / products シートとヘッダーを用意 */
function setup() {
  getRecordsSheet_();
  getProductsSheet_();
}

/* ============ 製品マスタ（products シート） ============ */
function getProductsSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PRODUCTS_SHEET);
    sh.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* 有効(active)な製品を order 順で返す（recipes.js と同じ形に整形） */
function listProducts_() {
  var sh = getProductsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = rowToProduct_(headers, values[r]);
    if (obj.active) out.push(obj);
  }
  out.sort(function (a, b) { return a.order - b.order; });
  return out;
}

/* 行配列 → 製品オブジェクト（フロント・recipes.js の shape） */
function rowToProduct_(headers, row) {
  var m = {};
  for (var i = 0; i < headers.length; i++) m[String(headers[i])] = row[i];
  return {
    code: String(m.code),
    name: String(m.name),
    order: Number(m.order) || 0,
    group: String(m.group || "main"),
    base: String(m.base),
    tareType: String(m.tare_type),
    timeSlot: m.time_slot ? String(m.time_slot) : null,
    extras: {
      daikara: m.ex_daikara === true,
      changjaDaikara: m.ex_changja_daikara === true,
      sesameOil: m.ex_sesame_oil === true,
      sesame: m.ex_sesame === true,
      sugar: m.ex_sugar === true
    },
    active: m.active === true
  };
}

/* 製品オブジェクト → 行配列（PRODUCT_HEADERS 順） */
function productToRow_(map, p, order, active) {
  var ex = p.extras || {};
  var full = {
    code: p.code, name: p.name, order: order, group: p.group || "main",
    base: p.base, tare_type: p.tareType, time_slot: p.timeSlot || "",
    ex_daikara: !!ex.daikara, ex_changja_daikara: !!ex.changjaDaikara,
    ex_sesame_oil: !!ex.sesameOil, ex_sesame: !!ex.sesame, ex_sugar: !!ex.sugar,
    active: active
  };
  var arr = [];
  for (var i = 0; i < PRODUCT_HEADERS.length; i++) {
    arr[map[PRODUCT_HEADERS[i]] - 1] = full[PRODUCT_HEADERS[i]];
  }
  return arr;
}

/* 製品を追加（code は未指定なら自動採番。order は末尾） */
function addProduct_(p) {
  if (!p || !p.name || !p.base || !p.tareType) throw new Error("name / base / tareType は必須です");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = getProductsSheet_();
    var map = headerMap_(sh);
    var last = sh.getLastRow();
    var existing = last >= 2 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];

    // code 自動採番（未指定時）。既存 code と重複しないこと。
    var code = p.code || ("cust_" + Utilities.getUuid().slice(0, 8));
    var codeCol = map["code"] - 1, orderCol = map["order"] - 1;
    var maxOrder = 0;
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][codeCol]) === String(code)) throw new Error("製品コードが重複: " + code);
      maxOrder = Math.max(maxOrder, Number(existing[i][orderCol]) || 0);
    }
    var order = (typeof p.order === "number") ? p.order : maxOrder + 1;

    p.code = code;
    sh.appendRow(productToRow_(map, p, order, true));
    return rowToProduct_(PRODUCT_HEADERS, productToRow_(map, p, order, true));
  } finally {
    lock.releaseLock();
  }
}

/* 論理削除: active を false に */
function deleteProduct_(code) {
  var sh = getProductsSheet_();
  var map = headerMap_(sh);
  var last = sh.getLastRow();
  if (last < 2) throw new Error("製品なし");
  var codes = sh.getRange(2, map["code"], last - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0]) === String(code)) {
      sh.getRange(i + 2, map["active"]).setValue(false);
      return { code: code, deleted: true };
    }
  }
  throw new Error("製品コードが見つかりません: " + code);
}

/* 初回シード: products が空のときだけ、渡された初期製品を投入（冪等） */
function seedProducts_(products) {
  var sh = getProductsSheet_();
  if (sh.getLastRow() >= 2) return { seeded: 0, note: "既にデータあり。スキップ" };
  var map = headerMap_(sh);
  var rows = [];
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    rows.push(productToRow_(map, p, (typeof p.order === "number" ? p.order : i + 1), true));
  }
  if (rows.length) sh.getRange(2, 1, rows.length, PRODUCT_HEADERS.length).setValues(rows);
  return { seeded: rows.length };
}

/* ヘッダー名 → 列番号(1始まり) のマップ */
function headerMap_(sh) {
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== "") map[String(row[i])] = i + 1;
  }
  return map;
}

/* ============ doGet / doPost ============ */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "list";
    if (action === "ping") {
      return json_({ ok: true, data: { pong: true, time: new Date().toISOString() } });
    }
    if (action === "setup") {
      var sh = getRecordsSheet_(); // records シート＋ヘッダーを用意
      return json_({ ok: true, data: { sheet: sh.getName(), spreadsheet_id: getSpreadsheet_().getId(), headers: HEADERS } });
    }
    if (action === "list") {
      return json_({ ok: true, data: listRecords_(e.parameter.date) });
    }
    if (action === "products") { // 有効な製品マスタ一覧
      return json_({ ok: true, data: listProducts_() });
    }
    return json_({ ok: false, error: "unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents); // text/plain で受信
    if (body.action === "create") {
      return json_({ ok: true, data: createRecord_(body.record) });
    }
    if (body.action === "update") {
      return json_({ ok: true, data: updateRecord_(body.record_id, body.record) });
    }
    if (body.action === "addProduct") {
      return json_({ ok: true, data: addProduct_(body.product) });
    }
    if (body.action === "deleteProduct") { // 論理削除（active=false）
      return json_({ ok: true, data: deleteProduct_(body.code) });
    }
    if (body.action === "seedProducts") { // 初回のみ recipes.js の初期製品を投入
      return json_({ ok: true, data: seedProducts_(body.products) });
    }
    return json_({ ok: false, error: "unknown action: " + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ============ 一覧（任意で日付フィルタ） ============ */
function listRecords_(dateFilter) {
  var sh = getRecordsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var headers = values[0];
  var ymdFilter = (dateFilter === "all") ? null            // 全件
                : dateFilter ? toYmd_(dateFilter)          // 指定日
                : nowYmdTokyo_();                          // 既定=本日(JST)

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c]);
      var v = values[r][c];
      if (key === "date" && v instanceof Date) v = Utilities.formatDate(v, TZ, "yyyy/MM/dd");
      obj[key] = v;
    }
    if (ymdFilter && toYmd_(obj.date) !== ymdFilter) continue;
    out.push(obj);
  }
  return out;
}

/* ============ 作成（採番 + 一意ID） ============ */
function createRecord_(rec) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // 同時記録での採番重複を防ぐ
  try {
    var sh = getRecordsSheet_();
    var map = headerMap_(sh);
    var ymd = nowYmdTokyo_();                   // 営業日はサーバ(JST)基準。クライアントTZに依存しない
    var dateObj = ymdToDate_(ymd);

    var batchNo = countSameDayProduct_(sh, map, ymd, rec.product_code) + 1;
    var recordId = makeUniqueId_(sh, map, ymd, rec.product_code, batchNo);
    var now = new Date();

    var full = {
      record_id: recordId,
      date: dateObj,
      product_name: rec.product_name,
      product_code: rec.product_code,
      time_slot: rec.time_slot || "",
      batch_no: batchNo,
      base_material: rec.base_material,
      base_kg: numOrBlank_(rec.base_kg),
      tare_type: rec.tare_type,
      tare_kg: numOrBlank_(rec.tare_kg),
      daikon_kg: numOrBlank_(rec.daikon_kg),
      ninjin_kg: numOrBlank_(rec.ninjin_kg),
      nira_kg: numOrBlank_(rec.nira_kg),
      konbu: rec.konbu || "",
      daikara_powder_g: numOrBlank_(rec.daikara_powder_g),
      sugar_kg: numOrBlank_(rec.sugar_kg),
      sesame_oil: rec.sesame_oil || "",
      sesame: rec.sesame || "",
      created_at: now,
      updated_at: now
    };

    // ヘッダー順で1行に整形して追記
    var rowArr = [];
    for (var i = 0; i < HEADERS.length; i++) {
      var col = HEADERS[i];
      rowArr[map[col] - 1] = (col in full) ? full[col] : "";
    }
    sh.appendRow(rowArr);

    return {
      record_id: recordId,
      batch_no: batchNo,
      product_name: full.product_name,
      time_slot: full.time_slot
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============ 更新（record_id で1行のみ） ============ */
function updateRecord_(recordId, rec) {
  var sh = getRecordsSheet_();
  var map = headerMap_(sh);
  var rowIndex = findRowById_(sh, map, recordId);
  if (rowIndex < 0) throw new Error("record_id が見つかりません: " + recordId);

  // 許可された列のみ更新
  for (var i = 0; i < EDITABLE.length; i++) {
    var col = EDITABLE[i];
    if (!(col in rec)) continue;
    var v = rec[col];
    if (/(_kg|_g)$/.test(col)) v = numOrBlank_(v);
    sh.getRange(rowIndex, map[col]).setValue(v == null ? "" : v);
  }
  sh.getRange(rowIndex, map["updated_at"]).setValue(new Date());

  var batchNo = sh.getRange(rowIndex, map["batch_no"]).getValue();
  var productName = sh.getRange(rowIndex, map["product_name"]).getValue();
  return { record_id: recordId, batch_no: batchNo, product_name: productName };
}

/* ============ 補助 ============ */
function countSameDayProduct_(sh, map, ymd, code) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var dates = sh.getRange(2, map["date"], last - 1, 1).getValues();
  var codes = sh.getRange(2, map["product_code"], last - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < dates.length; i++) {
    if (toYmd_(dates[i][0]) === ymd && String(codes[i][0]) === String(code)) n++;
  }
  return n;
}

function makeUniqueId_(sh, map, ymd, code, batchNo) {
  var id, n = batchNo;
  do {
    id = ymd + "-" + code + "-" + pad3_(n);
    n++;
  } while (findRowById_(sh, map, id) >= 0); // 万一の重複を回避
  return id;
}

function findRowById_(sh, map, recordId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, map["record_id"], last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(recordId)) return i + 2; // 1始まり + ヘッダー
  }
  return -1;
}

/* 値を YYYYMMDD 文字列に正規化（Date / "YYYY/MM/DD" / "YYYYMMDD" を許容） */
function toYmd_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyyMMdd");
  var s = String(value || "").trim();
  var digits = s.replace(/[^0-9]/g, "");
  return digits.slice(0, 8);
}

function ymdToDate_(ymd) {
  var y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // 正午UTC固定。どのTZで表示しても日付がずれない
}

/* 本日(JST)の YYYYMMDD。record_id・保存日付・一覧の既定フィルタの正本 */
function nowYmdTokyo_() {
  return Utilities.formatDate(new Date(), TZ, "yyyyMMdd");
}

function pad3_(n) { return ("00" + n).slice(-3); }

function numOrBlank_(v) {
  if (v === null || v === undefined || v === "") return "";
  var n = Number(v);
  return isNaN(n) ? "" : n;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
