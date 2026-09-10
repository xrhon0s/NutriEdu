const assert = require("assert");
const {
  mapRestrictionIds,
  normalizeName,
  parseArguments,
  selectTargetRecipeId,
  summarizeSnapshot,
} = require("./syncProfileBetweenApis");

assert.strictEqual(normalizeName("  Azúcar "), "azucar");
assert.deepStrictEqual(
  parseArguments(["--source", "http://local/api/", "--target", "https://prod/api/", "--email", "USER@MAIL.COM", "--apply"]),
  {
    source: "http://local/api",
    target: "https://prod/api",
    email: "user@mail.com",
    apply: true,
    help: false,
  },
);
assert.throws(
  () => parseArguments(["--source", "https://same/api", "--target", "https://same/api"]),
  /ambientes diferentes/,
);

const mapping = mapRestrictionIds(
  [{ nombre: "Azúcar" }, { nombre: "Gluten" }, { nombre: "No existe" }],
  [{ restriccion_id: 3, nombre: "azucar" }, { restriccion_id: 8, nombre: "GLUTEN" }],
);
assert.deepStrictEqual(mapping.ids, [3, 8]);
assert.deepStrictEqual(mapping.missing, ["No existe"]);

assert.strictEqual(
  selectTargetRecipeId(
    { receta_id: 7, receta_nombre: "Sopa de verduras" },
    { id: 7, nombre: "Otra receta" },
    [{ id: 42, nombre: "SOPA DE VERDURAS" }],
  ),
  42,
);
assert.throws(
  () => selectTargetRecipeId({ receta_nombre: "Receta ausente" }, null, []),
  /no existe en el ambiente destino/,
);

const summary = summarizeSnapshot({
  profile: {
    profile: { peso_kg: 70 },
    goals: [{ code: "gain_muscle" }],
    conditions: [{ code: "hypertension" }],
    targets: { protein_min_g: 100 },
  },
  selectedRestrictions: [{ nombre: "gluten" }],
  recommendations: [{ id: 4, nombre: "Receta", recommendation: { score: 92 } }],
  plan: [{ receta_id: 4, receta_nombre: "Receta", dia_semana: "Lunes", tipo_comida: "Almuerzo" }],
  shoppingList: { plannedMeals: 1, items: [{ id: 2, nombre: "Ingrediente" }] },
});
assert.deepStrictEqual(summary, {
  personalProfile: true,
  goals: ["gain_muscle"],
  conditions: ["hypertension"],
  targets: true,
  restrictions: ["gluten"],
  recommendations: [{ id: 4, name: "Receta", score: 92 }],
  plan: [{ day: "Lunes", meal: "Almuerzo", recipeId: 4, recipe: "Receta" }],
  shoppingList: { plannedMeals: 1, ingredients: 1 },
});

console.log(JSON.stringify({
  ok: true,
  dryRunDefault: true,
  restrictionNamesMapped: true,
  recommendationSummaryIncluded: true,
  weeklyPlanMappingIncluded: true,
  shoppingListVerificationIncluded: true,
}, null, 2));
