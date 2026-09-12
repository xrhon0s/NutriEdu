const assert = require("node:assert/strict");
const { summarizeProgress, validateProgressEntry } = require("../services/progressService");

assert.equal(validateProgressEntry({}, "2026-09-12").valid, false);
assert.equal(validateProgressEntry({ recordedOn: "2026-09-13", weightKg: 80 }, "2026-09-12").valid, false);
assert.equal(validateProgressEntry({ recordedOn: "2026-02-31", weightKg: 80 }, "2026-09-12").valid, false);
assert.equal(validateProgressEntry({ weightKg: 10 }, "2026-09-12").valid, false);
assert.equal(validateProgressEntry({ weightKg: 80, waistCm: 90, energyLevel: 4 }, "2026-09-12").valid, true);

const summary = summarizeProgress([
  { recorded_on: "2026-09-12", weight_kg: 78, waist_cm: 88, body_fat_pct: 20 },
  { recorded_on: "2026-08-12", weight_kg: 82, waist_cm: 94, body_fat_pct: 23 }
]);
assert.equal(summary.entries, 2);
assert.equal(summary.baseline.weight_kg, 82);
assert.equal(summary.latest.weight_kg, 78);
assert.deepEqual(summary.change, { weightKg: -4, waistCm: -6, bodyFatPct: -3 });
console.log(JSON.stringify({ ok: true, rangesValidated: true, chronologySummarized: true }, null, 2));
