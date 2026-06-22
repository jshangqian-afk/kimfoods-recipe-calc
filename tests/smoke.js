const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PRODUCTS, calcRecipe } = require("../recipes.js");

const cases = [
  ["hakusai", 200, 400, 730],
  ["daikon", 200, 400, 550],
  ["changja", 200, 400, 785],
  ["hakusai", 10, 333, 43],
];
for (const [base, kg, contentG, expected] of cases) {
  const product = { ...PRODUCTS.find(p => p.base === base), contentG };
  assert.equal(calcRecipe(product, kg).plannedUnits, expected);
}
const configuredProduct = { ...PRODUCTS.find(product => product.base === "hakusai"), contentG: 203 };
assert.equal(calcRecipe(configuredProduct, 0).plannedUnits, 0);
assert.equal(calcRecipe({ ...configuredProduct, contentG: null }, 100).plannedUnits, null);

const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../style.css"), "utf8");
const ids = [...app.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
const combined = html + "\n" + app;
const missing = [...new Set(ids)].filter(id => !combined.includes(`id="${id}"`));
assert.deepEqual(missing, [], `Missing DOM IDs: ${missing.join(", ")}`);

const staticIds = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(staticIds.filter((id, index) => staticIds.indexOf(id) !== index))];
assert.deepEqual(duplicates, [], `Duplicate DOM IDs: ${duplicates.join(", ")}`);

assert.match(app, /largeCount: 210/);
assert.match(app, /smallCount: 90/);
assert.match(app, /hundredCount: 35/);
assert.match(app, /deleteRecord\(recordId\)/);
assert.match(app, /data-delete-record/);

const gas = fs.readFileSync(path.join(__dirname, "../gas/Code.gs"), "utf8");
assert.match(gas, /body\.action === "delete"/);
assert.match(gas, /function deleteRecord_/);
assert.match(gas, /function nextBatchNo_/);
const gasContext = { console, Date, Math };
vm.createContext(gasContext);
vm.runInContext(gas, gasContext);
const columns = {
  2: [["2026/06/22"], ["2026/06/22"], ["2026/06/22"]],
  4: [["nakakara_am"], ["nakakara_am"], ["other"]],
  6: [[1], [3], [9]],
};
const sheet = {
  getLastRow: () => 4,
  getRange: (_row, column) => ({ getValues: () => columns[column] }),
};
assert.equal(gasContext.nextBatchNo_(sheet, { date: 2, product_code: 4, batch_no: 6 }, "20260622", "nakakara_am"), 4);

const yamada = PRODUCTS.filter(product => product.group === "yamada");
assert.deepEqual(yamada.map(product => product.contentG), [350, 200, 350, 200]);
assert.deepEqual(yamada.map(product => product.code), [
  "yamada_hakusai_350", "yamada_hakusai_200", "yamada_daikon_350", "yamada_daikon_200"
]);
assert.equal(calcRecipe(yamada[0], 100).plannedUnits, 417);
assert.equal(calcRecipe(yamada[1], 100).plannedUnits, 730);
assert.equal(calcRecipe(yamada[2], 100).plannedUnits, 314);
assert.equal(calcRecipe(yamada[3], 100).plannedUnits, 550);
assert.match(app, /予定数（内容量/);
assert.match(gas, /function migrateYamadaProducts_/);

const productHeaders = Array.from(gasContext.PRODUCT_HEADERS);
const productMap = Object.fromEntries(productHeaders.map((header, index) => [header, index + 1]));
const deactivated = [];
const appended = [];
const productSheet = {
  getLastRow: () => 3,
  getLastColumn: () => productHeaders.length,
  getRange: (row, column, rowCount) => ({
    getValues: () => rowCount ? [["yamada_hakusai"], ["yamada_daikon"]] : [],
    setValue: value => deactivated.push([row, column, value]),
    setValues: () => { throw new Error("unexpected existing variant"); },
  }),
  appendRow: row => appended.push(row),
};
gasContext.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
gasContext.getProductsSheet_ = () => productSheet;
gasContext.headerMap_ = () => productMap;
gasContext.listProducts_ = () => ["migrated"];
const migration = gasContext.migrateYamadaProducts_();
assert.equal(migration.migrated, 4);
assert.equal(deactivated.length, 2);
assert.equal(appended.length, 4);

assert.match(html, /viewport-fit=cover/);
assert.match(css, /height: 100dvh/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /\.btn-delete-record \{ min-height: 44px/);
assert.match(css, /\.master-card \.content-edit button \{ min-height: 44px/);

console.log(`Smoke tests passed (${cases.length} formulas, ${new Set(ids).size} DOM references).`);
