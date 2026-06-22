/**
 * app.js — キムチ製造電卓 画面制御（C案 2ペイン）
 *
 * 配合・計算は recipes.js が正本（COEFFICIENTS / PRODUCTS / calcRecipe / round）。
 * 係数はこのファイルに書かない。表示と記録は同じ calcRecipe の結果を使う（UI = 記録内容）。
 * 記録の永続化は GAS 経由でスプレッドシートへ（localStorage は使わない）。
 */

/* =========================================================
 * 設定（デプロイ後にここだけ書き換える）
 * ========================================================= */
const CONFIG = {
  // GAS WebApp のデプロイURL（/exec で終わるもの）。未設定の間はUI確認のみ可。
  GAS_URL: "https://script.google.com/macros/s/AKfycbySyCECxveTMIaje2o8V27bva7SDhqzdGoW2tmL5-N61yQMtbSJ1pdQlcH0nwy9CDb7/exec",
};

/* =========================================================
 * 共通ヘルパー
 * ========================================================= */
const BASE_LABEL = { hakusai: "白菜", daikon: "大根", changja: "チャンジャ" };

// 製品マスタは実行時に GAS（products シート）から取得する。
// recipes.js の PRODUCTS は初回シード兼フォールバック（係数 COEFFICIENTS は recipes.js が正本）。
let productList = [];

function findProduct(code) { return productList.find(p => p.code === code) || null; }
function $(id) { return document.getElementById(id); }
function pad(n, len) { return String(n).padStart(len, "0"); }

function productButtonHTML(p) {
  const slot = p.timeSlot ? ` ・ ${p.timeSlot}` : "";
  return `<button class="product-btn" data-code="${p.code}">
    <span class="pb-name">${p.name}</span>
    <span class="tag">${BASE_LABEL[p.base]}基準 ・ ${p.tareType}タレ${slot}</span>
  </button>`;
}

/* calcRecipe の戻り値 → 表示用の行（kind: tare/main/sub/guide） */
function recipeRows(r) {
  const rows = [];
  rows.push({ label: `${r.tareType}タレ`, value: `${r.tareKg} kg`, kind: "tare" });
  if (r.daikonKg != null) rows.push({ label: "大根", value: `${r.daikonKg} kg`, kind: "main" });
  if (r.ninjinKg != null) rows.push({ label: "人参", value: `${r.ninjinKg} kg`, kind: "main" });
  if (r.niraKg != null)   rows.push({ label: "ニラ", value: `${r.niraKg} kg`, kind: "main" });
  if (r.daikaraPowderG != null) rows.push({ label: "大辛パウダー", value: `${r.daikaraPowderG} g`, kind: "sub" });
  if (r.sugarKg != null)  rows.push({ label: "砂糖", value: `${r.sugarKg} kg`, kind: "sub" });
  if (r.konbu)     rows.push({ label: "昆布", value: r.konbu, kind: "guide" });
  if (r.sesameOil) rows.push({ label: "ごま油", value: r.sesameOil, kind: "guide" });
  if (r.sesame)    rows.push({ label: "ごま", value: r.sesame, kind: "guide" });
  rows.push({
    label: "予定数",
    value: r.plannedUnits == null ? "内容量を設定してください" : `${r.plannedUnits} 個`,
    kind: "planned"
  });
  return rows;
}
function renderResultRows(container, rows) {
  container.innerHTML = rows.map(r =>
    `<div class="result-row kind-${r.kind}"><span class="label">${r.label}</span><span class="value">${r.value}</span></div>`
  ).join("");
}

/* calcRecipe の結果 → records 列にマッピング（SPREADSHEET.md の列名に対応） */
function buildRecordPayload(product, result) {
  return {
    date: todayYmdSlash(),                 // YYYY/MM/DD（GAS 側で日付型保存）
    product_name: product.name,
    product_code: product.code,
    time_slot: product.timeSlot || "",
    base_material: BASE_LABEL[product.base],
    base_kg: result.baseKg,
    tare_type: result.tareType,
    tare_kg: result.tareKg,
    daikon_kg: result.daikonKg,
    ninjin_kg: result.ninjinKg,
    nira_kg: result.niraKg,
    konbu: result.konbu,
    daikara_powder_g: result.daikaraPowderG,
    sugar_kg: result.sugarKg,
    sesame_oil: result.sesameOil,
    sesame: result.sesame,
    planned_units: result.plannedUnits,
  };
}

function todayYmdSlash() {
  const d = new Date();
  return `${d.getFullYear()}/${pad(d.getMonth() + 1, 2)}/${pad(d.getDate(), 2)}`;
}

function startClock(el) {
  const tick = () => {
    const d = new Date();
    el.textContent = `${d.getFullYear()}/${pad(d.getMonth() + 1, 2)}/${pad(d.getDate(), 2)}  ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
  };
  tick();
  setInterval(tick, 10000);
}

let _toastTimer;
function showToast(msg, isError) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.className = "toast show" + (isError ? " error" : "");
  t.textContent = msg;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => (t.className = "toast"), 3200);
}

/* カスタムテンキー */
function buildNumpad(container, getVal, setVal, onChange) {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"];
  container.classList.add("numpad");
  container.innerHTML = keys.map(k =>
    `<button type="button" data-k="${k}"${k === "⌫" ? ' class="np-back"' : ""}>${k}</button>`).join("");
  container.addEventListener("click", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    let v = getVal();
    if (k === "⌫") v = v.slice(0, -1);
    else if (k === ".") { if (!v.includes(".")) v = (v || "0") + "."; }
    else { if (v === "0") v = k; else v = v + k; if (v.replace(".", "").length > 6) return; }
    setVal(v);
    onChange();
  });
}

/* =========================================================
 * GAS API（text/plain で送りプリフライト回避。GAS 側で JSON.parse）
 * ========================================================= */
const api = {
  configured() { return !!CONFIG.GAS_URL; },

  async list(date) {
    // date 未指定なら GAS が本日(JST)を返す（営業日はサーバ基準）
    const url = `${CONFIG.GAS_URL}?action=list` + (date ? `&date=${encodeURIComponent(date)}` : "");
    const res = await fetch(url, { method: "GET" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "list失敗");
    return json.data;
  },

  async _post(body) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "保存失敗");
    return json.data;
  },

  create(payload) { return this._post({ action: "create", record: payload }); },
  update(recordId, payload) { return this._post({ action: "update", record_id: recordId, record: payload }); },
  deleteRecord(recordId) { return this._post({ action: "delete", record_id: recordId }); },

  async getProducts() {
    const res = await fetch(`${CONFIG.GAS_URL}?action=products`, { method: "GET" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "製品取得失敗");
    return json.data;
  },
  addProduct(product) { return this._post({ action: "addProduct", product }); },
  deleteProduct(code) { return this._post({ action: "deleteProduct", code }); },
  seedProducts(products) { return this._post({ action: "seedProducts", products }); },
  updateProductContent(code, contentG) { return this._post({ action: "updateProductContent", code, content_g: contentG }); },
  async getPlan() {
    const res = await fetch(`${CONFIG.GAS_URL}?action=plan`, { method: "GET" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "白菜予定取得失敗");
    return json.data;
  },
  savePlan(plan) { return this._post({ action: "savePlan", plan }); },
};

/* =========================================================
 * 状態
 * ========================================================= */
const state = {
  code: null,     // 選択中の製品コード
  input: "",      // kg 入力文字列
  editingId: null, // 編集中の record_id（null=新規）
  plan: { largeCount: 0, smallCount: 0, hundredCount: 0, previousKg: 0, plannedKg: 0, usedKg: 0, remainingKg: 0 }
};

// マスター管理: 基準材料ごとに選べる追加材料（calcRecipe の extras キーに対応）
const EXTRA_OPTIONS = {
  hakusai: [{ key: "daikara", label: "大辛パウダー(×17g/kg)" }, { key: "sugar", label: "砂糖(タレ×0.19)" }],
  daikon:  [{ key: "sugar", label: "砂糖(タレ×0.19)" }],
  changja: [{ key: "changjaDaikara", label: "大辛パウダー(×3g/kg)" }, { key: "sesameOil", label: "ごま油" }, { key: "sesame", label: "ごま" }],
};
// 追加フォームの現在の選択状態
const newProduct = { group: "main", base: "hakusai", tareType: "A", timeSlot: null, extras: {} };

/* =========================================================
 * 初期化
 * ========================================================= */
startClock($("clock"));
initMaterialPlan();
loadMaterialPlan();

// 製品ボタンのクリックは委譲（再描画しても効く）
function onProductGridClick(e) {
  const btn = e.target.closest(".product-btn");
  if (btn) selectProduct(btn.dataset.code);
}
$("gridMain").addEventListener("click", onProductGridClick);
$("gridYamada").addEventListener("click", onProductGridClick);

$("recBtn").addEventListener("click", onSubmit);
$("cancelEditBtn").addEventListener("click", cancelEdit);
$("openRecordsBtn").addEventListener("click", openRecords);
$("closeRecordsBtn").addEventListener("click", closeRecords);
$("drawerMask").addEventListener("click", closeRecords);

// マスター管理
$("openMasterBtn").addEventListener("click", openMaster);
$("closeMasterBtn").addEventListener("click", closeMaster);
$("masterMask").addEventListener("click", closeMaster);
$("addProductBtn").addEventListener("click", onAddProduct);
initMasterForm();

// 製品マスタを GAS から読み込んでボタンを描画
loadProducts();

/* 今日の白菜予定。樽重量は確定仕様（大樽210 / 小樽90 / 100樽35kg）。 */
const BARREL_KG = { largeCount: 210, smallCount: 90, hundredCount: 35 };

function initMaterialPlan() {
  $("materialPlan").querySelectorAll(".barrel-row").forEach(row => {
    row.addEventListener("click", e => {
      const btn = e.target.closest("button[data-step]");
      if (!btn) return;
      const field = row.dataset.planField;
      state.plan[field] = Math.max(0, (Number(state.plan[field]) || 0) + Number(btn.dataset.step));
      renderMaterialPlan();
    });
  });
  $("previousKg").addEventListener("input", () => {
    state.plan.previousKg = Math.max(0, Number($("previousKg").value) || 0);
    renderMaterialPlan(false);
  });
  $("savePlanBtn").addEventListener("click", saveMaterialPlan);
}

function localPlannedKg() {
  return round(
    state.plan.largeCount * BARREL_KG.largeCount +
    state.plan.smallCount * BARREL_KG.smallCount +
    state.plan.hundredCount * BARREL_KG.hundredCount +
    (Number(state.plan.previousKg) || 0), 1);
}

function renderMaterialPlan(syncInput = true) {
  $("largeCount").textContent = state.plan.largeCount;
  $("smallCount").textContent = state.plan.smallCount;
  $("hundredCount").textContent = state.plan.hundredCount;
  if (syncInput) $("previousKg").value = state.plan.previousKg || "";
  const planned = localPlannedKg();
  state.plan.plannedKg = planned;
  const remaining = round(planned - (Number(state.plan.usedKg) || 0), 1);
  state.plan.remainingKg = remaining;
  $("plannedKg").textContent = `${planned} kg`;
  $("remainingPlanned").textContent = `${planned} kg`;
  $("usedKg").textContent = `${state.plan.usedKg || 0} kg`;
  $("remainingKg").textContent = `${remaining} kg`;
  $("remainingKg").classList.toggle("negative", remaining < 0);
}

async function loadMaterialPlan() {
  if (!api.configured()) { renderMaterialPlan(); return; }
  try {
    const p = await api.getPlan();
    state.plan = {
      largeCount: Number(p.large_count) || 0,
      smallCount: Number(p.small_count) || 0,
      hundredCount: Number(p.hundred_count) || 0,
      previousKg: Number(p.previous_kg) || 0,
      plannedKg: Number(p.planned_kg) || 0,
      usedKg: Number(p.used_kg) || 0,
      remainingKg: Number(p.remaining_kg) || 0,
    };
    renderMaterialPlan();
  } catch (e) {
    showToast("白菜予定を読み込めません: " + e.message, true);
    renderMaterialPlan();
  }
}

async function saveMaterialPlan() {
  if (!api.configured()) { showToast("GAS未接続のため保存できません", true); return; }
  const btn = $("savePlanBtn");
  btn.disabled = true;
  try {
    const p = await api.savePlan({
      large_count: state.plan.largeCount,
      small_count: state.plan.smallCount,
      hundred_count: state.plan.hundredCount,
      previous_kg: state.plan.previousKg,
    });
    state.plan.usedKg = Number(p.used_kg) || 0;
    renderMaterialPlan();
    showToast("今日の白菜予定を保存しました");
  } catch (e) {
    showToast("白菜予定の保存に失敗: " + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* 右ペインの中身は最初の製品選択時に一度だけ構築 */
let rightBuilt = false;
function buildRight() {
  $("rightBody").innerHTML = `
    <div class="pane-col">
      <div class="edit-banner" id="editBanner">
        <div>
          <div class="em-text" id="emText"></div>
          <div class="em-id" id="emId"></div>
        </div>
        <button class="btn-link" id="emCancel">編集をやめる</button>
      </div>
      <div class="section-title" id="baseTitle"></div>
      <div class="kg-display">
        <span class="base-label" id="baseLabel"></span>
        <span class="num placeholder" id="kgNum">0</span>
        <span class="unit">kg</span>
      </div>
      <div style="margin-top:14px;" id="numpad"></div>
    </div>
    <div class="pane-col">
      <div class="section-title">計算結果（タレ・副材料）</div>
      <div class="result-list" id="resultList"></div>
    </div>`;
  buildNumpad($("numpad"), () => state.input, (v) => { state.input = v; }, recalc);
  $("emCancel").addEventListener("click", cancelEdit);
  rightBuilt = true;
}

/* =========================================================
 * ①②③ 製品選択 → 入力 → 計算
 * ========================================================= */
function selectProduct(code) {
  state.code = code;
  state.input = "";
  document.querySelectorAll(".product-btn").forEach(b =>
    b.classList.toggle("selected", b.dataset.code === code));
  if (!rightBuilt) buildRight();

  const p = findProduct(code);
  $("selName").textContent = p.name + (p.timeSlot ? `（${p.timeSlot}）` : "");
  const chip = $("selTare");
  chip.style.display = "inline-flex";
  chip.textContent = p.tareType + "タレ";
  chip.className = "tare-chip tare-" + p.tareType;
  $("baseTitle").textContent = BASE_LABEL[p.base] + "のキロ数を入力";
  $("baseLabel").textContent = BASE_LABEL[p.base];
  recalc();
}

/* 現在の計算結果（表示・記録の両方でこれを使う） */
function currentResult() {
  const p = findProduct(state.code);
  if (!p) return null;
  return calcRecipe(p, parseFloat(state.input) || 0);
}

function recalc() {
  const p = findProduct(state.code);
  if (!p) return;
  const kgNum = $("kgNum");
  kgNum.textContent = state.input || "0";
  kgNum.classList.toggle("placeholder", !state.input);

  const r = calcRecipe(p, parseFloat(state.input) || 0);
  renderResultRows($("resultList"), recipeRows(r));
  $("recBtn").disabled = !(r.baseKg > 0);
}

/* =========================================================
 * ④ 記録保存 / 更新
 * ========================================================= */
async function onSubmit() {
  const p = findProduct(state.code);
  const result = currentResult();
  if (!p || !result || !(result.baseKg > 0)) return;

  if (!api.configured()) {
    showToast("GAS未接続です。app.js の CONFIG.GAS_URL を設定してください。", true);
    return;
  }

  const payload = buildRecordPayload(p, result);
  const btn = $("recBtn");
  btn.disabled = true;
  try {
    if (state.editingId) {
      const rec = await api.update(state.editingId, payload);
      showToast(`更新しました  ${rec.product_name} ${rec.batch_no}回目`);
      cancelEdit();
    } else {
      const rec = await api.create(payload);
      const slot = rec.time_slot ? `${rec.time_slot} ` : "";
      showToast(`記録しました  ${rec.product_name} ${slot}${rec.batch_no}回目 / ${rec.record_id}`);
      state.input = "";
      recalc();
    }
    await loadMaterialPlan();
  } catch (e) {
    showToast("保存に失敗しました: " + e.message, true);
    btn.disabled = false;
  }
}

/* =========================================================
 * ⑤ 記録一覧 / 編集
 * ========================================================= */
async function openRecords() {
  $("drawer").classList.add("show");
  $("drawerMask").classList.add("show");
  $("drawerDate").textContent = "";
  const body = $("drawerBody");

  if (!api.configured()) {
    body.innerHTML = `<div class="dstate">GAS未接続です。<br>app.js の <b>CONFIG.GAS_URL</b> を設定すると、ここに本日の記録が表示されます。</div>`;
    return;
  }
  body.innerHTML = `<div class="dstate">読み込み中…</div>`;
  try {
    const records = await api.list();           // 本日(JST)の記録
    $("drawerDate").textContent = records.length ? records[0].date : "本日";
    renderRecords(records);
  } catch (e) {
    body.innerHTML = `<div class="dstate">読み込みに失敗しました。<br>${e.message}</div>`;
  }
}

function renderRecords(records) {
  const body = $("drawerBody");
  if (!records.length) {
    body.innerHTML = `<div class="dstate">本日の記録はまだありません。</div>`;
    return;
  }
  body.innerHTML = records.map(r => {
    const slot = r.time_slot ? `${r.time_slot} ・ ` : "";
    return `<div class="rec-card">
      <div class="rc-main">
        <div class="rc-title">${r.product_name} <span style="font-weight:600;color:var(--muted);">${r.batch_no}回目</span></div>
        <div class="rc-sub">${slot}${r.base_material} ${r.base_kg}kg ・ ${r.tare_type}タレ ${r.tare_kg}kg<br>${r.record_id}</div>
      </div>
      <div class="rc-kg">${r.base_kg}<span style="font-size:13px;color:var(--muted);">kg</span></div>
      <div class="rc-actions">
        <button class="btn-ghost" data-edit="${r.record_id}" data-code="${r.product_code}" data-kg="${r.base_kg}">編集</button>
        <button class="btn-delete-record" data-delete-record="${r.record_id}" data-name="${r.product_name}">削除</button>
      </div>
    </div>`;
  }).join("");

  body.querySelectorAll("[data-edit]").forEach(btn =>
    btn.addEventListener("click", () => startEdit(btn.dataset.edit, btn.dataset.code, btn.dataset.kg)));
  body.querySelectorAll("[data-delete-record]").forEach(btn =>
    btn.addEventListener("click", () => onDeleteRecord(btn)));
}

async function onDeleteRecord(btn) {
  if (!btn.classList.contains("confirm")) {
    btn.classList.add("confirm");
    btn.textContent = "本当に削除？";
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("confirm");
      btn.textContent = "削除";
    }, 3000);
    return;
  }
  btn.disabled = true;
  try {
    await api.deleteRecord(btn.dataset.deleteRecord);
    showToast(`削除しました: ${btn.dataset.name}`);
    await Promise.all([openRecords(), loadMaterialPlan()]);
  } catch (e) {
    showToast("削除に失敗しました: " + e.message, true);
    btn.disabled = false;
  }
}

function startEdit(recordId, code, kg) {
  selectProduct(code);
  state.editingId = recordId;
  state.input = String(kg);
  recalc();
  const p = findProduct(code);
  $("editBanner").classList.add("show");
  $("emText").textContent = `編集中: ${p.name}`;
  $("emId").textContent = recordId;
  const btn = $("recBtn");
  btn.textContent = "更新する";
  btn.classList.add("btn-update");
  $("cancelEditBtn").style.display = "inline-block";
  closeRecords();
}

function cancelEdit() {
  state.editingId = null;
  if (rightBuilt) $("editBanner").classList.remove("show");
  const btn = $("recBtn");
  btn.textContent = "この内容で記録する";
  btn.classList.remove("btn-update");
  $("cancelEditBtn").style.display = "none";
  state.input = "";
  if (state.code) recalc();
}

function closeRecords() {
  $("drawer").classList.remove("show");
  $("drawerMask").classList.remove("show");
}

/* =========================================================
 * 製品マスタ（GAS の products シート）
 *  recipes.js の PRODUCTS は初回シード兼フォールバック。
 * ========================================================= */
async function loadProducts() {
  if (!api.configured()) {
    productList = PRODUCTS.slice(); // 未接続: recipes.js を読み取り表示
    renderProductButtons();
    return;
  }
  $("gridMain").innerHTML = `<div class="products-note">製品を読み込み中…</div>`;
  $("gridYamada").innerHTML = "";
  try {
    let list = await api.getProducts();
    if (!list.length) {             // 初回: recipes.js の製品を投入
      await api.seedProducts(PRODUCTS);
      list = await api.getProducts();
    }
    productList = list;
    renderProductButtons();
  } catch (e) {
    productList = PRODUCTS.slice(); // フォールバック（暫定表示）
    renderProductButtons();
    showToast("製品をGASから読めず暫定表示中: " + e.message, true);
  }
}

function renderProductButtons() {
  const mains = productList.filter(p => p.group === "main").sort((a, b) => a.order - b.order);
  const yamadas = productList.filter(p => p.group === "yamada").sort((a, b) => a.order - b.order);
  $("gridMain").innerHTML = mains.length
    ? mains.map(productButtonHTML).join("")
    : `<div class="products-note">製品がありません。⚙管理から追加してください。</div>`;
  $("gridYamada").innerHTML = yamadas.map(productButtonHTML).join("");
  if (state.code) {
    const btn = document.querySelector(`.product-btn[data-code="${state.code}"]`);
    if (btn) btn.classList.add("selected");
  }
}

/* ============ マスター管理ドロワー ============ */
function openMaster() {
  $("masterDrawer").classList.add("show");
  $("masterMask").classList.add("show");
  renderMasterList();
  updatePreview();
}
function closeMaster() {
  $("masterDrawer").classList.remove("show");
  $("masterMask").classList.remove("show");
}

function initMasterForm() {
  document.querySelectorAll("#masterDrawer .seg").forEach(seg => {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      seg.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
      const field = seg.dataset.field;
      newProduct[field] = field === "timeSlot" ? (b.dataset.v || null) : b.dataset.v;
      if (field === "base") { newProduct.extras = {}; renderExtras(); }
      updatePreview();
    });
  });
  $("np-name").addEventListener("input", updatePreview);
  $("np-content-g").addEventListener("input", updatePreview);
  renderExtras();
}

function renderExtras() {
  const opts = EXTRA_OPTIONS[newProduct.base] || [];
  const box = $("np-extras");
  if (!opts.length) {
    box.innerHTML = `<span class="none">この基準材料に追加材料はありません（昆布は自動計算）。</span>`;
    return;
  }
  box.innerHTML = opts.map(o =>
    `<button type="button" class="chip${newProduct.extras[o.key] ? " on" : ""}" data-ex="${o.key}">${o.label}</button>`).join("");
  box.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
    const k = c.dataset.ex;
    newProduct.extras[k] = !newProduct.extras[k];
    c.classList.toggle("on", !!newProduct.extras[k]);
    updatePreview();
  }));
}

/* レシピ確認用のサンプルkg（基準材料で代表値を変える） */
function previewKg() { return newProduct.base === "daikon" ? 40 : 20; }

function updatePreview() {
  const sample = previewKg();
  const tmp = {
    code: "_preview", name: $("np-name").value || "新製品", group: newProduct.group,
    base: newProduct.base, tareType: newProduct.tareType, timeSlot: newProduct.timeSlot,
    contentG: Number($("np-content-g").value) || null,
    extras: { ...newProduct.extras }
  };
  const r = calcRecipe(tmp, sample);
  const rows = recipeRows(r);
  rows.unshift({ label: `（サンプル）${BASE_LABEL[newProduct.base]}`, value: `${sample} kg`, kind: "main" });
  renderResultRows($("np-preview"), rows);
}

async function onAddProduct() {
  const name = $("np-name").value.trim();
  if (!name) { showToast("製品名を入力してください", true); return; }
  if (!api.configured()) { showToast("GAS未接続のため追加できません", true); return; }
  const product = {
    name, group: newProduct.group, base: newProduct.base,
    tareType: newProduct.tareType, timeSlot: newProduct.timeSlot,
    contentG: Number($("np-content-g").value) || null,
    extras: { ...newProduct.extras }
  };
  const btn = $("addProductBtn");
  btn.disabled = true;
  try {
    const added = await api.addProduct(product);
    showToast(`製品を追加しました: ${added.name}`);
    $("np-name").value = "";
    $("np-content-g").value = "";
    await loadProducts();   // 計算画面のボタンを再描画
    renderMasterList();     // 一覧更新
    updatePreview();
  } catch (e) {
    showToast("追加に失敗: " + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

const EXTRA_JA = { daikara: "大辛パウダー", changjaDaikara: "大辛パウダー", sesameOil: "ごま油", sesame: "ごま", sugar: "砂糖" };

function renderMasterList() {
  const box = $("masterList");
  if (!productList.length) { box.innerHTML = `<div class="dstate">製品がありません。</div>`; return; }
  const sorted = productList.slice().sort((a, b) => a.order - b.order);
  box.innerHTML = sorted.map(p => {
    const slot = p.timeSlot ? ` ・ ${p.timeSlot}` : "";
    const ex = Object.keys(p.extras).filter(k => p.extras[k]).map(k => EXTRA_JA[k] || k);
    const exLabel = ex.length ? " ・ " + ex.join("/") : "";
    return `<div class="master-card">
      <div class="mc-main">
        <div class="mc-name">${p.name}</div>
        <div class="mc-sub">${p.group === "yamada" ? "ヤマダ ・ " : ""}${BASE_LABEL[p.base]}基準 ・ ${p.tareType}タレ${slot}${exLabel}</div>
        <div class="content-edit"><input type="number" min="1" step="1" inputmode="numeric" value="${p.contentG || ""}" placeholder="内容量"><span>g</span><button type="button" data-save-content="${p.code}">保存</button></div>
      </div>
      <button class="btn-del" data-del="${p.code}" data-name="${p.name}">削除</button>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-save-content]").forEach(b => b.addEventListener("click", () => onSaveProductContent(b)));
  box.querySelectorAll(".btn-del").forEach(b => b.addEventListener("click", () => onDeleteProduct(b)));
}

async function onSaveProductContent(btn) {
  const input = btn.parentElement.querySelector("input");
  const contentG = Number(input.value);
  if (!(contentG > 0)) { showToast("内容量を1g以上で入力してください", true); return; }
  btn.disabled = true;
  try {
    await api.updateProductContent(btn.dataset.saveContent, contentG);
    const p = findProduct(btn.dataset.saveContent);
    if (p) p.contentG = contentG;
    if (state.code === btn.dataset.saveContent) recalc();
    showToast("商品内容量を保存しました");
  } catch (e) {
    showToast("内容量の保存に失敗: " + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function onDeleteProduct(btn) {
  if (!btn.classList.contains("confirm")) { // 2タップ確認（誤操作防止）
    btn.classList.add("confirm");
    btn.textContent = "削除する？";
    setTimeout(() => { btn.classList.remove("confirm"); btn.textContent = "削除"; }, 3000);
    return;
  }
  const code = btn.dataset.del, name = btn.dataset.name;
  btn.disabled = true;
  api.deleteProduct(code).then(async () => {
    showToast(`「${name}」を削除しました（過去の記録は保持）`);
    if (state.code === code) state.code = null; // 選択中なら解除
    await loadProducts();
    renderMasterList();
  }).catch(e => { showToast("削除に失敗: " + e.message, true); btn.disabled = false; });
}
