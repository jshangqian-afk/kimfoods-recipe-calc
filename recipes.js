/**
 * recipes.js — KimFoods 製造電卓 配合の正本（Single Source of Truth）
 *
 * このファイルが配合係数の唯一の正本です。
 * 係数を変更する場合は必ずこのファイルだけを編集してください。
 * フロント・GAS の双方がこの定義を参照します（コードに係数を直書きしない）。
 *
 * 版: v1.0
 */

/* =========================================================
 * 共通係数（基準材料に対する倍率）
 * ========================================================= */
const COEFFICIENTS = {
  // 原料kgから製品重量へ換算する歩留まり
  yield_multiplier: {
    hakusai: 1.46,
    daikon: 1.1,
    changja: 1.57,
  },
  // 白菜基準
  hakusai: {
    tare:   0.25, // タレ = 白菜kg × 0.25
    daikon: 0.14, // 大根 = 白菜kg × 0.14
    ninjin: 0.03, // 人参 = 白菜kg × 0.03
    nira:   0.04, // ニラ = 白菜kg × 0.04
    konbu_per_kg: 20, // 白菜20kgあたり一握り
  },
  // 大根基準
  daikon: {
    tare: 0.1, // タレ = 大根kg × 0.1
    konbu_per_kg: 40, // 大根40kgあたり一握り
  },
  // チャンジャ基準
  changja: {
    tare: 0.57,           // Bタレ = チャンジャkg × 0.57
    daikara_g_per_kg: 3,  // 大辛パウダー = チャンジャkg × 3g
    // ごま油・ごまは 20kg を基準にした目安
    sesame_oil_base_kg: 20, // 20kg → 大さじ3
    sesame_oil_tbsp: 3,
    sesame_base_kg: 20,     // 20kg → 大さじ2
    sesame_tbsp: 2,
  },
  // 製品固有
  daikara_g_per_kg: 17, // 大辛パウダー = 白菜kg × 17g
  sugar_ratio: 0.19,    // 砂糖 = タレ重量 × 0.19
};

/* =========================================================
 * 製品マスタ
 *  - order: ボタン表示順
 *  - group: "main" / "yamada"（ヤマダは別枠表示）
 *  - base:  入力基準 "hakusai" | "daikon" | "changja"
 *  - tareType: "A" | "B" | "C"
 *  - timeSlot: "午前" | "午後" | null
 *  - extras: 製品固有の追加材料フラグ
 * ========================================================= */
const PRODUCTS = [
  // --- メイン（表示順） ---
  { code: "kakutegi_am", name: "カクテギ午前", order: 1, group: "main",
    base: "daikon",  tareType: "A", timeSlot: "午前", extras: {} },

  { code: "teshigoto_daikon", name: "手しごと大根", order: 2, group: "main",
    base: "daikon",  tareType: "C", timeSlot: null, extras: {} },

  { code: "nakakara_am", name: "中辛午前", order: 3, group: "main",
    base: "hakusai", tareType: "A", timeSlot: "午前", extras: {} },

  { code: "nyusankin_bk", name: "乳酸菌（BK）", order: 4, group: "main",
    base: "hakusai", tareType: "B", timeSlot: null, extras: {} },

  { code: "okara", name: "大辛", order: 5, group: "main",
    base: "hakusai", tareType: "A", timeSlot: null, extras: { daikara: true } },

  { code: "changja", name: "チャンジャ", order: 6, group: "main",
    base: "changja", tareType: "B", timeSlot: null,
    extras: { changjaDaikara: true, sesameOil: true, sesame: true } },

  { code: "teshigoto_hakusai", name: "手しごと白菜", order: 7, group: "main",
    base: "hakusai", tareType: "C", timeSlot: null, extras: {} },

  { code: "kakutegi_pm", name: "カクテギ午後", order: 8, group: "main",
    base: "daikon",  tareType: "A", timeSlot: "午後", extras: {} },

  { code: "nakakara_pm", name: "中辛午後", order: 9, group: "main",
    base: "hakusai", tareType: "A", timeSlot: "午後", extras: {} },

  // --- ヤマダ（別枠） ---
  { code: "yamada_hakusai_350", name: "ヤマダ白菜 350g", order: 10, group: "yamada",
    base: "hakusai", tareType: "A", timeSlot: null, contentG: 350, extras: { sugar: true } },

  { code: "yamada_hakusai_200", name: "ヤマダ白菜 200g", order: 11, group: "yamada",
    base: "hakusai", tareType: "A", timeSlot: null, contentG: 200, extras: { sugar: true } },

  { code: "yamada_daikon_350", name: "ヤマダ大根 350g", order: 12, group: "yamada",
    base: "daikon",  tareType: "A", timeSlot: null, contentG: 350, extras: { sugar: true } },

  { code: "yamada_daikon_200", name: "ヤマダ大根 200g", order: 13, group: "yamada",
    base: "daikon",  tareType: "A", timeSlot: null, contentG: 200, extras: { sugar: true } },
];

/* =========================================================
 * 計算関数
 *  入力: product（PRODUCTS の1要素） , baseKg（入力キロ数）
 *  出力: 各材料の必要量オブジェクト
 *  ※ 表示・記録の両方でこの関数の戻り値を使う（UI = 記録内容の一致を担保）
 * ========================================================= */
function round(n, digits) {
  const p = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(n * p) / p;
}

function calcPlannedUnits(product, baseKg) {
  const kg = parseFloat(baseKg) || 0;
  const contentG = Number(product && product.contentG) || 0;
  const multiplier = product && COEFFICIENTS.yield_multiplier[product.base];
  if (!(contentG > 0) || !multiplier) return null;
  if (!(kg > 0)) return 0;
  return Math.floor((kg * multiplier) / (contentG / 1000));
}

function calcRecipe(product, baseKg) {
  const kg = parseFloat(baseKg) || 0;
  const result = {
    code: product.code,
    name: product.name,
    base: product.base,
    baseKg: kg,
    contentG: Number(product.contentG) || null,
    tareType: product.tareType,
    tareKg: 0,
    daikonKg: null,
    ninjinKg: null,
    niraKg: null,
    konbu: null,            // 目安（一握り換算）
    daikaraPowderG: null,
    sugarKg: null,
    sesameOil: null,        // 目安（大さじ）
    sesame: null,           // 目安（大さじ）
    plannedUnits: calcPlannedUnits(product, kg),
  };

  if (product.base === "hakusai") {
    const c = COEFFICIENTS.hakusai;
    result.tareKg   = round(kg * c.tare);
    result.daikonKg = round(kg * c.daikon);
    result.ninjinKg = round(kg * c.ninjin);
    result.niraKg   = round(kg * c.nira);
    result.konbu    = round(kg / c.konbu_per_kg, 2) + " 握り（目安）";
    if (product.extras.daikara) {
      result.daikaraPowderG = round(kg * COEFFICIENTS.daikara_g_per_kg, 0);
    }
    if (product.extras.sugar) {
      result.sugarKg = round(result.tareKg * COEFFICIENTS.sugar_ratio);
    }
  } else if (product.base === "daikon") {
    const c = COEFFICIENTS.daikon;
    result.tareKg = round(kg * c.tare);
    result.konbu  = round(kg / c.konbu_per_kg, 2) + " 握り（目安）";
    if (product.extras.sugar) {
      result.sugarKg = round(result.tareKg * COEFFICIENTS.sugar_ratio);
    }
  } else if (product.base === "changja") {
    const c = COEFFICIENTS.changja;
    result.tareKg = round(kg * c.tare);
    if (product.extras.changjaDaikara) {
      result.daikaraPowderG = round(kg * c.daikara_g_per_kg, 0);
    }
    if (product.extras.sesameOil) {
      const tbsp = round(kg / c.sesame_oil_base_kg * c.sesame_oil_tbsp, 1);
      result.sesameOil = "大さじ " + tbsp + "（目安）";
    }
    if (product.extras.sesame) {
      const tbsp = round(kg / c.sesame_base_kg * c.sesame_tbsp, 1);
      result.sesame = "大さじ " + tbsp + "（目安）";
    }
  }

  return result;
}

/* ブラウザ / GAS 双方で使えるようにエクスポート */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { COEFFICIENTS, PRODUCTS, calcRecipe, calcPlannedUnits, round };
}
