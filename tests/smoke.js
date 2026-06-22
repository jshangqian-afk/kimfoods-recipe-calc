const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
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

console.log(`Smoke tests passed (${cases.length} formulas, ${new Set(ids).size} DOM references).`);
