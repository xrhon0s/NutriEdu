const FOOD_GROUPS = [
  "protein", "carbohydrate", "vegetable", "fruit", "dairy",
  "fat", "legume", "seasoning", "beverage", "other"
];

const SUBSTITUTION_GROUPS = [
  "poultry", "red_meat", "fish", "shellfish", "egg", "plant_protein",
  "grain", "flour", "pasta", "bread", "tortilla", "tuber",
  "leafy_vegetable", "cruciferous_vegetable", "root_vegetable", "allium",
  "nightshade", "squash", "mushroom", "stalk_vegetable", "watery_vegetable",
  "citrus", "pome_fruit", "berry", "tropical_fruit", "stone_fruit",
  "melon", "grape", "avocado",
  "dairy_milk", "cultured_dairy", "cheese", "dairy_cream",
  "cooking_fat", "nut", "seed", "legume",
  "sweetener", "herb", "spice", "salt", "acid", "plant_milk", "other"
];

module.exports = {
  FOOD_GROUPS,
  FOOD_GROUP_SET: new Set(FOOD_GROUPS),
  SUBSTITUTION_GROUPS,
  SUBSTITUTION_GROUP_SET: new Set(SUBSTITUTION_GROUPS)
};
