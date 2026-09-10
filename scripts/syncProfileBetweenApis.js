const readline = require("readline/promises");
const { stdin, stdout } = require("process");

const DEFAULT_SOURCE = "http://localhost:3002/api";
const DEFAULT_TARGET = "https://nutriedu-backend.onrender.com/api";

const normalizeApiUrl = (value) => String(value || "").trim().replace(/\/$/, "");
const normalizeName = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const parseArguments = (argumentsList) => {
  const options = { source: DEFAULT_SOURCE, target: DEFAULT_TARGET, email: "", apply: false, help: false };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--source", "--target", "--email"].includes(argument)) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Argumento desconocido: ${argument}`);
    }
  }

  options.source = normalizeApiUrl(options.source);
  options.target = normalizeApiUrl(options.target);
  options.email = options.email.trim().toLowerCase();
  if (!options.source || !options.target) throw new Error("Las URLs de origen y destino son obligatorias");
  if (options.source === options.target) throw new Error("Origen y destino deben ser ambientes diferentes");
  return options;
};

const request = async (baseUrl, path, { token, method = "GET", body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(`${method} ${baseUrl}${path}: ${message}`);
  }
  return data;
};

const login = async (baseUrl, email, password) => request(baseUrl, "/users/login", {
  method: "POST",
  body: { email, password },
});

const loadSnapshot = async (baseUrl, auth) => {
  const [profile, restrictionCatalog, userRestrictions, recommendations, plan, shoppingList] = await Promise.all([
    request(baseUrl, "/profile", { token: auth.token }),
    request(baseUrl, "/users/restrictions", { token: auth.token }),
    request(baseUrl, `/users/restrictions/${auth.user.id}`, { token: auth.token }),
    request(baseUrl, "/recipes/recommendations?limit=6&offset=0", { token: auth.token }),
    request(baseUrl, `/planner/${auth.user.id}`, { token: auth.token }),
    request(baseUrl, `/planner/${auth.user.id}/shopping-list?detailed=true`, { token: auth.token }),
  ]);

  return {
    profile,
    restrictionCatalog: restrictionCatalog.restrictions || [],
    selectedRestrictions: userRestrictions.restrictions || [],
    recommendations: recommendations.recipes || [],
    plan: Array.isArray(plan) ? plan : [],
    shoppingList: shoppingList || { items: [], plannedMeals: 0 },
  };
};

const mapRestrictionIds = (selectedRestrictions, targetCatalog) => {
  const targetByName = new Map(targetCatalog.map((item) => [normalizeName(item.nombre), Number(item.restriccion_id)]));
  const missing = [];
  const ids = [];

  for (const restriction of selectedRestrictions) {
    const targetId = targetByName.get(normalizeName(restriction.nombre));
    if (targetId) ids.push(targetId);
    else missing.push(restriction.nombre);
  }

  return { ids: [...new Set(ids)], missing };
};

const selectTargetRecipeId = (sourceMeal, directRecipe, searchRecipes = []) => {
  const sourceName = normalizeName(sourceMeal.receta_nombre);
  if (directRecipe && normalizeName(directRecipe.nombre) === sourceName) {
    return Number(directRecipe.id);
  }

  const exactMatch = searchRecipes.find((recipe) => normalizeName(recipe.nombre) === sourceName);
  if (exactMatch) return Number(exactMatch.id);
  throw new Error(`La receta "${sourceMeal.receta_nombre}" no existe en el ambiente destino`);
};

const resolveTargetPlan = async (targetUrl, targetAuth, sourcePlan) => Promise.all(
  sourcePlan.map(async (meal) => {
    let directRecipe = null;
    try {
      directRecipe = await request(targetUrl, `/recipes/${meal.receta_id}`, { token: targetAuth.token });
    } catch {
      directRecipe = null;
    }

    let searchRecipes = [];
    if (!directRecipe || normalizeName(directRecipe.nombre) !== normalizeName(meal.receta_nombre)) {
      const search = await request(
        targetUrl,
        `/recipes/search/${targetAuth.user.id}?query=${encodeURIComponent(meal.receta_nombre)}&paginated=true&limit=50&offset=0`,
        { token: targetAuth.token },
      );
      searchRecipes = search.recipes || [];
    }

    return {
      recetaId: selectTargetRecipeId(meal, directRecipe, searchRecipes),
      diaSemana: meal.dia_semana,
      tipoComida: meal.tipo_comida,
    };
  }),
);

const summarizeSnapshot = (snapshot) => ({
  personalProfile: Boolean(snapshot.profile.profile),
  goals: snapshot.profile.goals?.map((item) => item.code) || [],
  conditions: snapshot.profile.conditions?.map((item) => item.code) || [],
  targets: Boolean(snapshot.profile.targets),
  restrictions: snapshot.selectedRestrictions.map((item) => item.nombre),
  recommendations: snapshot.recommendations.map((item) => ({
    id: item.id,
    name: item.nombre,
    score: item.recommendation?.score ?? null,
  })),
  plan: snapshot.plan.map((meal) => ({
    day: meal.dia_semana,
    meal: meal.tipo_comida,
    recipeId: meal.receta_id,
    recipe: meal.receta_nombre,
  })),
  shoppingList: {
    plannedMeals: snapshot.shoppingList.plannedMeals || 0,
    ingredients: snapshot.shoppingList.items?.length || 0,
  },
});

const syncSnapshot = async (targetUrl, targetAuth, sourceSnapshot, targetSnapshot) => {
  const restrictionMapping = mapRestrictionIds(sourceSnapshot.selectedRestrictions, targetSnapshot.restrictionCatalog);
  if (restrictionMapping.missing.length) {
    throw new Error(`Restricciones ausentes en destino: ${restrictionMapping.missing.join(", ")}`);
  }

  if (sourceSnapshot.profile.profile) {
    await request(targetUrl, "/profile", {
      method: "PUT",
      token: targetAuth.token,
      body: sourceSnapshot.profile.profile,
    });
  }
  await request(targetUrl, "/profile/goals", {
    method: "PUT",
    token: targetAuth.token,
    body: { goals: (sourceSnapshot.profile.goals || []).map((item) => item.code) },
  });
  await request(targetUrl, "/profile/conditions", {
    method: "PUT",
    token: targetAuth.token,
    body: { conditions: (sourceSnapshot.profile.conditions || []).map((item) => item.code), source: "user" },
  });
  if (sourceSnapshot.profile.targets) {
    await request(targetUrl, "/profile/targets", {
      method: "PUT",
      token: targetAuth.token,
      body: sourceSnapshot.profile.targets,
    });
  }
  await request(targetUrl, "/users/restrictions", {
    method: "POST",
    token: targetAuth.token,
    body: { restricciones: restrictionMapping.ids },
  });

  const targetPlan = await resolveTargetPlan(targetUrl, targetAuth, sourceSnapshot.plan);
  await request(targetUrl, "/planner", {
    method: "POST",
    token: targetAuth.token,
    body: { plan: targetPlan },
  });
};

const printHelp = () => {
  console.log(`Uso:
  npm run sync:profile -- --email usuario@correo.com
  npm run sync:profile -- --email usuario@correo.com --apply

Opciones:
  --source URL   API de origen (default: ${DEFAULT_SOURCE})
  --target URL   API de destino (default: ${DEFAULT_TARGET})
  --email EMAIL  Cuenta que debe existir en ambos ambientes
  --apply        Copia los datos; sin esta opcion solo muestra la vista previa
  --help         Muestra esta ayuda`);
};

const readPassword = async () => {
  if (!stdin.isTTY) throw new Error("La contrasena debe ingresarse desde un terminal interactivo");
  stdout.write("Contrasena de la cuenta (no se mostrara): ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };
    const onData = (character) => {
      if (character === "\u0003") {
        finish();
        reject(new Error("Operacion cancelada"));
      } else if (character === "\r" || character === "\n") {
        finish();
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    stdin.on("data", onData);
  });
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const email = options.email || (await prompt.question("Correo de la cuenta: ")).trim().toLowerCase();
  prompt.close();
  if (!email) throw new Error("El correo es obligatorio");
  const password = await readPassword();
  if (!password) throw new Error("La contrasena es obligatoria");

  console.log(`Autenticando origen: ${options.source}`);
  const sourceAuth = await login(options.source, email, password);
  console.log(`Autenticando destino: ${options.target}`);
  const targetAuth = await login(options.target, email, password);
  if (normalizeName(sourceAuth.user.email) !== normalizeName(targetAuth.user.email)) {
    throw new Error("Las APIs autenticaron cuentas diferentes");
  }

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    loadSnapshot(options.source, sourceAuth),
    loadSnapshot(options.target, targetAuth),
  ]);
  console.log("\nOrigen:");
  console.log(JSON.stringify(summarizeSnapshot(sourceSnapshot), null, 2));
  console.log("\nDestino antes de sincronizar:");
  console.log(JSON.stringify(summarizeSnapshot(targetSnapshot), null, 2));

  if (!options.apply) {
    console.log("\nVista previa completada. Repite con --apply para copiar el perfil y el plan semanal.");
    return;
  }

  await syncSnapshot(options.target, targetAuth, sourceSnapshot, targetSnapshot);
  const verifiedSnapshot = await loadSnapshot(options.target, targetAuth);
  console.log("\nDestino despues de sincronizar:");
  console.log(JSON.stringify(summarizeSnapshot(verifiedSnapshot), null, 2));
  console.log("\nSincronizacion completada. Web productiva y mobile leeran estos mismos datos.");
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  mapRestrictionIds,
  normalizeName,
  parseArguments,
  selectTargetRecipeId,
  summarizeSnapshot,
};
