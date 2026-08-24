require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../database/db");
const { cleanupExpiredMedicalDocumentReviews } = require("../services/medicalDocument/medicalDocumentHistoryService");
const { createInAppNotification } = require("../services/notificationService");

const apiUrl = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `clinical-smoke-${runId}@example.test`;
const password = `Smoke-${runId}`;
let userId;

const request = async (path, options = {}) => {
  const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
};

const run = async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const userResult = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["Clinical Smoke Test", email, passwordHash]
  );
  userId = userResult.rows[0].id;

  const login = await request("/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const authHeaders = { Authorization: `Bearer ${login.token}` };
  const visionStatus = await request("/food-analysis/status", { headers: authHeaders });

  const imageForm = new FormData();
  imageForm.append(
    "image",
    new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Z9sAAAAASUVORK5CYII=", "base64")], { type: "image/png" }),
    "meal.png"
  );
  imageForm.append("source", "camera");
  imageForm.append("capturedAt", new Date().toISOString());
  const imageIntake = await request("/food-analysis/intake", {
    method: "POST",
    headers: authHeaders,
    body: imageForm
  });
  if (imageIntake.status !== "validated" || imageIntake.retention.retained !== false) {
    throw new Error("Food image intake contract returned an invalid state");
  }

  const spoofedImageForm = new FormData();
  spoofedImageForm.append(
    "image",
    new Blob([Buffer.from("this is not a png image")], { type: "image/png" }),
    "spoofed.png"
  );
  spoofedImageForm.append("source", "library");
  const spoofedResponse = await fetch(`${apiUrl}/food-analysis/intake`, {
    method: "POST",
    headers: authHeaders,
    body: spoofedImageForm
  });
  if (spoofedResponse.status !== 415) {
    throw new Error(`Spoofed image returned ${spoofedResponse.status} instead of 415`);
  }

  const noConsentForm = new FormData();
  noConsentForm.append(
    "image",
    new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2Z9sAAAAASUVORK5CYII=", "base64")], { type: "image/png" }),
    "meal.png"
  );
  noConsentForm.append("source", "camera");
  const noConsentResponse = await fetch(`${apiUrl}/food-analysis/analyze`, {
    method: "POST",
    headers: authHeaders,
    body: noConsentForm
  });
  if (noConsentResponse.status !== 400) {
    throw new Error(`Vision consent check returned ${noConsentResponse.status} instead of 400`);
  }

  const medicalDocumentForm = new FormData();
  medicalDocumentForm.append(
    "document",
    new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")], { type: "application/pdf" }),
    "prescription.pdf"
  );
  medicalDocumentForm.append("source", "file");
  medicalDocumentForm.append("documentType", "prescription");
  medicalDocumentForm.append("consent", "true");
  medicalDocumentForm.append("consentVersion", "1.0");
  const medicalDocumentIntake = await request("/medical-documents/intake", {
    method: "POST",
    headers: authHeaders,
    body: medicalDocumentForm
  });
  if (medicalDocumentIntake.retention.retained !== false || medicalDocumentIntake.profileUpdated !== false) {
    throw new Error("Medical document intake retained data or changed the profile");
  }

  const noDocumentConsentForm = new FormData();
  noDocumentConsentForm.append(
    "document",
    new Blob([Buffer.from("%PDF-1.4\n%%EOF")], { type: "application/pdf" }),
    "no-consent.pdf"
  );
  noDocumentConsentForm.append("source", "file");
  noDocumentConsentForm.append("documentType", "prescription");
  const noDocumentConsentResponse = await fetch(`${apiUrl}/medical-documents/intake`, {
    method: "POST",
    headers: authHeaders,
    body: noDocumentConsentForm
  });
  if (noDocumentConsentResponse.status !== 400) {
    throw new Error(`Medical document consent check returned ${noDocumentConsentResponse.status} instead of 400`);
  }

  const spoofedDocumentForm = new FormData();
  spoofedDocumentForm.append(
    "document",
    new Blob([Buffer.from("not a real PDF")], { type: "application/pdf" }),
    "spoofed.pdf"
  );
  spoofedDocumentForm.append("source", "file");
  spoofedDocumentForm.append("documentType", "other");
  spoofedDocumentForm.append("consent", "true");
  spoofedDocumentForm.append("consentVersion", "1.0");
  const spoofedDocumentResponse = await fetch(`${apiUrl}/medical-documents/intake`, {
    method: "POST",
    headers: authHeaders,
    body: spoofedDocumentForm
  });
  if (spoofedDocumentResponse.status !== 415) {
    throw new Error(`Spoofed medical document returned ${spoofedDocumentResponse.status} instead of 415`);
  }

  const reviewedDocument = await request("/medical-documents/review", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      requestId: medicalDocumentIntake.requestId,
      extraction: {
        documentType: "prescription",
        summary: "Extraccion corregida por el usuario",
        documentDate: "2026-08-20",
        professionalName: "Profesional de prueba",
        medications: [{
          id: "medication-1",
          name: "Medicamento de prueba",
          dose: "10 mg",
          frequency: "Una vez al dia",
          instructions: null,
          confidence: "medium"
        }],
        conditions: [{
          id: "condition-1",
          name: "Hipertension posible",
          catalogCode: "hypertension",
          evidence: "Hallazgo que requiere confirmacion",
          confidence: "medium"
        }],
        dietaryInstructions: [{
          id: "diet-1",
          instruction: "Reducir sodio",
          confidence: "high"
        }],
        nutritionTargets: [{
          id: "target-1",
          field: "sodium_max_mg",
          value: 1800,
          unit: "mg",
          period: "per_day",
          confidence: "high"
        }],
        uncertainties: ["El usuario debe comparar el texto con el original"]
      },
      acceptedFindingIds: ["condition-1", "diet-1", "target-1"]
    })
  });
  if (reviewedDocument.acceptedCount !== 3 || reviewedDocument.profileUpdated !== false) {
    throw new Error("Medical document review changed profile state or lost accepted findings");
  }
  if (!reviewedDocument.reviewId || reviewedDocument.auditReady !== true) {
    throw new Error("Medical document review was not persisted for audit");
  }

  const documentApplicationPreview = await request(
    `/medical-documents/reviews/${reviewedDocument.reviewId}/preview`,
    { headers: authHeaders }
  );
  if (documentApplicationPreview.changeCount !== 2 || documentApplicationPreview.profileUpdated !== false) {
    throw new Error("Medical document profile preview returned unexpected changes");
  }

  const appliedDocument = await request(
    `/medical-documents/reviews/${reviewedDocument.reviewId}/apply`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        previewHash: documentApplicationPreview.previewHash,
        confirmationVersion: documentApplicationPreview.confirmationVersion
      })
    }
  );
  if (appliedDocument.status !== "applied" || appliedDocument.profileUpdated !== true) {
    throw new Error("Medical document changes were not applied explicitly");
  }

  const repeatedApplicationResponse = await fetch(
    `${apiUrl}/medical-documents/reviews/${reviewedDocument.reviewId}/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        previewHash: documentApplicationPreview.previewHash,
        confirmationVersion: documentApplicationPreview.confirmationVersion
      })
    }
  );
  if (repeatedApplicationResponse.status !== 409) {
    throw new Error(`Repeated medical document application returned ${repeatedApplicationResponse.status} instead of 409`);
  }

  const medicalHistory = await request("/medical-documents/history", { headers: authHeaders });
  const appliedHistoryItem = medicalHistory.items.find((item) => item.reviewId === reviewedDocument.reviewId);
  if (!appliedHistoryItem || appliedHistoryItem.status !== "applied" || appliedHistoryItem.retention.expiresAt !== null) {
    throw new Error("Applied medical review has an invalid history or retention state");
  }

  const medicalHistoryDetail = await request(
    `/medical-documents/history/${reviewedDocument.reviewId}`,
    { headers: authHeaders }
  );
  if (!medicalHistoryDetail.application || medicalHistoryDetail.retention.canDelete !== false) {
    throw new Error("Applied medical review detail lost its application audit");
  }

  const deleteAppliedResponse = await fetch(
    `${apiUrl}/medical-documents/history/${reviewedDocument.reviewId}`,
    { method: "DELETE", headers: authHeaders }
  );
  if (deleteAppliedResponse.status !== 409) {
    throw new Error(`Applied medical review deletion returned ${deleteAppliedResponse.status} instead of 409`);
  }

  const deletableReview = await request("/medical-documents/review", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      requestId: `${medicalDocumentIntake.requestId}-delete`,
      extraction: reviewedDocument.extraction,
      acceptedFindingIds: []
    })
  });
  const deletedReview = await request(`/medical-documents/history/${deletableReview.reviewId}`, {
    method: "DELETE",
    headers: authHeaders
  });
  if (deletedReview.status !== "deleted" || deletedReview.profileUpdated !== false) {
    throw new Error("Unapplied medical review was not deleted safely");
  }

  const expiringReview = await request("/medical-documents/review", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      requestId: `${medicalDocumentIntake.requestId}-expire`,
      extraction: reviewedDocument.extraction,
      acceptedFindingIds: []
    })
  });
  await pool.query(
    "UPDATE revisiones_documentos_medicos SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1 AND usuario_id = $2",
    [expiringReview.reviewId, userId]
  );
  const cleanupResult = await cleanupExpiredMedicalDocumentReviews();
  if (!cleanupResult.reviewIds.includes(expiringReview.reviewId)) {
    throw new Error("Expired medical review cleanup did not remove the test review");
  }

  const catalogs = await request("/profile/catalogs", { headers: authHeaders });
  if (catalogs.goals.length === 0 || catalogs.conditions.length === 0) {
    throw new Error("Clinical catalogs are empty");
  }

  await request("/profile", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      fecha_nacimiento: "1995-05-15",
      sexo: "male",
      estatura_cm: 178,
      peso_kg: 76.5,
      nivel_actividad: "moderate",
      condicion_fisica: "active",
      habitos_alimentarios: { meals_per_day: 4 },
      preferencias_alimentarias: { cooking_time: "short" },
      notas: "Temporary smoke-test profile"
    })
  });

  await request("/profile/goals", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ goals: ["gain_muscle", "general_health"] })
  });

  await request("/profile/conditions", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ conditions: ["hypertension"], source: "user" })
  });

  const restrictionCatalog = await request("/users/restrictions", { headers: authHeaders });
  const restrictionId = restrictionCatalog.restrictions[0]?.restriccion_id;

  if (!restrictionId) {
    throw new Error("Dietary restriction catalog is empty");
  }

  await request("/users/restrictions", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ restricciones: [restrictionId] })
  });

  await request("/profile/targets", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      calories_min: 400,
      calories_max: 800,
      protein_min_g: 25,
      sodium_max_mg: 600,
      calculation_source: "manual",
      notes: "Temporary smoke-test targets"
    })
  });

  const restrictedIngredientResult = await pool.query(
    `SELECT i.nombre
     FROM ingredientes i
     JOIN ingrediente_restricciones ir ON i.id = ir.ingrediente_id
     WHERE ir.restriccion_id = $1
     ORDER BY i.id ASC
     LIMIT 1`,
    [restrictionId]
  );
  const restrictedIngredientName = restrictedIngredientResult.rows[0]?.nombre || "ingrediente de prueba";
  const reviewedAnalysis = await request("/food-analysis/review", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      requestId: "smoke-review",
      analysis: {
        isFood: true,
        notFoodReason: null,
        dish: {
          name: "Plato de prueba",
          description: "Resultado corregido por el smoke test",
          confidence: "medium"
        },
        ingredients: [{
          name: restrictedIngredientName,
          estimatedGrams: 50,
          confidence: "high",
          uncertain: false
        }],
        portion: {
          description: "Una porción",
          estimatedGrams: 300,
          confidence: "medium"
        },
        nutrition: {
          calories: 700,
          protein_g: 30,
          carbs_g: 75,
          fat_g: 25,
          saturated_fat_g: 8,
          sugar_g: 14,
          fiber_g: 3,
          sodium_mg: 700,
          confidence: "low"
        },
        uncertainties: ["Valores nutricionales aproximados"]
      }
    })
  });
  if (reviewedAnalysis.status !== "reviewed") {
    throw new Error("Corrected food analysis was not reviewed");
  }
  if (restrictedIngredientResult.rows[0] && reviewedAnalysis.evaluation.unsafeIngredients.length === 0) {
    throw new Error("Corrected food analysis did not match the user restriction");
  }

  const [profile, savedRestrictions] = await Promise.all([
    request("/profile", { headers: authHeaders }),
    request(`/users/restrictions/${userId}`, { headers: authHeaders })
  ]);
  if (
    profile.goals.length !== 2
    || profile.conditions.length !== 1
    || !profile.targets
    || savedRestrictions.restrictions.length !== 1
  ) {
    throw new Error("Saved clinical profile did not round-trip correctly");
  }

  const recipeResult = await pool.query("SELECT id FROM recetas ORDER BY id ASC LIMIT 1");
  let evaluation = null;
  let recipeDetail = null;
  let recipeIngredients = [];

  if (recipeResult.rows[0]) {
    const recipeId = recipeResult.rows[0].id;
    [recipeDetail, recipeIngredients, evaluation] = await Promise.all([
      request(`/recipes/${recipeId}`, { headers: authHeaders }),
      request(`/recipes/${recipeId}/ingredients`, { headers: authHeaders }),
      request(`/recipes/evaluate/${recipeId}`, { headers: authHeaders })
    ]);
  }

  const [filteredRecipes, moderateRecipes, paginatedRecipes] = await Promise.all([
    request(`/recipes/search/${userId}?query=&safe_only=true&calorias_min=0&calorias_max=10000`, { headers: authHeaders }),
    request(`/recipes/search/${userId}?query=&safe_only=true&nivel_salud=moderada`, { headers: authHeaders }),
    request(`/recipes/search/${userId}?query=&safe_only=true&paginated=true&limit=2&offset=0`, { headers: authHeaders })
  ]);
  if (filteredRecipes.some((recipe) => recipe.hasUnsafeIngredients)) {
    throw new Error("Safe recipe search returned a restriction conflict");
  }
  if (moderateRecipes.some((recipe) => Number(recipe.nivel_salud) >= 3)) {
    throw new Error("Moderate health filter returned an out-of-range recipe");
  }
  if (
    !Array.isArray(paginatedRecipes.recipes)
    || paginatedRecipes.recipes.length > 2
    || paginatedRecipes.pagination.limit !== 2
    || paginatedRecipes.pagination.offset !== 0
  ) {
    throw new Error("Paginated recipe search returned an invalid contract");
  }

  let descriptionSearch = "skipped: selected recipe has no description";
  if (recipeDetail?.descripcion) {
    const searchTerm = recipeDetail.descripcion.split(/\s+/).find((word) => word.length >= 4);
    if (searchTerm) {
      const descriptionResults = await request(
        `/recipes/search/${userId}?query=${encodeURIComponent(searchTerm)}`,
        { headers: authHeaders }
      );
      if (!descriptionResults.some((recipe) => recipe.id === recipeDetail.id)) {
        throw new Error("Recipe description search did not return the expected recipe");
      }
      descriptionSearch = "verified";
    }
  }

  const [recommendedRecipes, weeklyPlan, shoppingList] = await Promise.all([
    request(`/recipes/recommended/${userId}`, { headers: authHeaders }),
    request(`/planner/${userId}`, { headers: authHeaders }),
    request(`/planner/${userId}/shopping-list`, { headers: authHeaders })
  ]);

  const defaultNotificationPreferences = await request("/notifications/preferences", { headers: authHeaders });
  const mutedNotificationPreferences = await request("/notifications/preferences", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      ...defaultNotificationPreferences,
      quietStart: "22:00",
      quietEnd: "06:00",
      mealReminderTimes: { breakfast: "07:30", lunch: "12:30", dinner: "19:30" },
      weeklyPlanReminderDay: 0,
      weeklyPlanReminderTime: "17:30",
      shoppingReminderDay: 6,
      shoppingReminderTime: "09:30",
      weeklyPlan: false
    })
  });
  const suppressedNotification = await createInAppNotification(pool, {
    userId,
    category: "weekly_plan",
    eventType: "smoke_suppressed",
    title: "Suppressed",
    body: "This notification must not be inserted"
  });
  if (
    suppressedNotification !== null
    || mutedNotificationPreferences.weeklyPlan !== false
    || mutedNotificationPreferences.mealReminderTimes.breakfast !== "07:30"
    || mutedNotificationPreferences.weeklyPlanReminderTime !== "17:30"
    || mutedNotificationPreferences.shoppingReminderDay !== 6
  ) {
    throw new Error("Notification category preference did not suppress delivery");
  }

  await request("/notifications/preferences", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ ...mutedNotificationPreferences, weeklyPlan: true })
  });
  for (let index = 0; index < 3; index += 1) {
    await createInAppNotification(pool, {
      userId,
      category: "weekly_plan",
      eventType: "weekly_plan_updated",
      title: "Plan semanal actualizado",
      body: "Tu plan guardado ya esta disponible junto con la lista de compras.",
      destination: "/plan",
      metadata: { smokeIndex: index }
    });
  }

  const notificationPage = await request("/notifications?limit=2", { headers: authHeaders });
  if (
    notificationPage.items.length !== 2
    || notificationPage.unreadCount !== 3
    || !notificationPage.nextCursor
  ) {
    throw new Error("Notification inbox pagination returned an invalid contract");
  }
  await request(`/notifications/${notificationPage.items[0].id}/read`, {
    method: "PATCH",
    headers: authHeaders
  });
  const markAllNotifications = await request("/notifications/read-all", {
    method: "POST",
    headers: authHeaders
  });
  const readNotificationPage = await request("/notifications?limit=2", { headers: authHeaders });
  if (markAllNotifications.updatedCount !== 2 || readNotificationPage.unreadCount !== 0) {
    throw new Error("Notification read state did not round-trip correctly");
  }

  const invalidPasswordDeletion = await fetch(`${apiUrl}/users/account`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ password: "incorrect-password", confirmation: "DELETE_MY_ACCOUNT" })
  });
  if (invalidPasswordDeletion.status !== 401) {
    throw new Error(`Invalid account password returned ${invalidPasswordDeletion.status} instead of 401`);
  }

  const deletedAccount = await request("/users/account", {
    method: "DELETE",
    headers: authHeaders,
    body: JSON.stringify({ password, confirmation: "DELETE_MY_ACCOUNT" })
  });
  if (deletedAccount.status !== "deleted" || deletedAccount.accountDeleted !== true) {
    throw new Error("Account deletion did not return the expected state");
  }

  const deletedTokenResponse = await fetch(`${apiUrl}/profile`, { headers: authHeaders });
  if (deletedTokenResponse.status !== 401) {
    throw new Error(`Deleted account token returned ${deletedTokenResponse.status} instead of 401`);
  }

  const orphanResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM usuarios WHERE id = $1)::integer AS users,
       (SELECT COUNT(*) FROM perfiles_usuario WHERE usuario_id = $1)::integer AS profiles,
       (SELECT COUNT(*) FROM usuario_restricciones WHERE usuario_id = $1)::integer AS restrictions,
       (SELECT COUNT(*) FROM revisiones_documentos_medicos WHERE usuario_id = $1)::integer AS reviews,
       (SELECT COUNT(*) FROM aplicaciones_documentos_medicos WHERE usuario_id = $1)::integer AS applications,
       (SELECT COUNT(*) FROM notification_preferences WHERE user_id = $1)::integer AS notification_preferences,
       (SELECT COUNT(*) FROM notifications WHERE user_id = $1)::integer AS notifications`,
    [userId]
  );
  const orphanCounts = orphanResult.rows[0];
  if (Object.values(orphanCounts).some((count) => Number(count) !== 0)) {
    throw new Error(`Account deletion left related rows: ${JSON.stringify(orphanCounts)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    authenticatedUserId: login.user.id,
    catalogs: {
      goals: catalogs.goals.length,
      conditions: catalogs.conditions.length
    },
    savedProfile: {
      goals: profile.goals.map((goal) => goal.code),
      conditions: profile.conditions.map((condition) => condition.code),
      restrictions: savedRestrictions.restrictions.map((restriction) => restriction.restriccion_id),
      hasTargets: Boolean(profile.targets)
    },
    recipeEvaluation: evaluation
      ? {
          recipeId: evaluation.recipe.id,
          recipeName: recipeDetail.nombre,
          ingredients: recipeIngredients.length,
          score: evaluation.score,
          status: evaluation.status
        }
      : "skipped: no recipes available",
    mobileReads: {
      recommendations: recommendedRecipes.length,
      filteredRecipes: filteredRecipes.length,
      moderateRecipes: moderateRecipes.length,
      descriptionSearch,
      plannedMeals: weeklyPlan.length,
      shoppingItems: shoppingList.length
    },
    notifications: {
      pageSize: notificationPage.items.length,
      unreadBefore: notificationPage.unreadCount,
      unreadAfter: readNotificationPage.unreadCount,
      quietStart: mutedNotificationPreferences.quietStart,
      quietEnd: mutedNotificationPreferences.quietEnd,
      suppressedByPreference: suppressedNotification === null
    },
    foodImageIntake: {
      status: imageIntake.status,
      retained: imageIntake.retention.retained,
      spoofedImageStatus: spoofedResponse.status,
      providerConfigured: visionStatus.configured,
      noConsentStatus: noConsentResponse.status,
      reviewStatus: reviewedAnalysis.status,
      reviewUnsafeIngredients: reviewedAnalysis.evaluation.unsafeIngredients.length
    },
    medicalDocumentIntake: {
      status: medicalDocumentIntake.status,
      retained: medicalDocumentIntake.retention.retained,
      profileUpdated: medicalDocumentIntake.profileUpdated,
      noConsentStatus: noDocumentConsentResponse.status,
      spoofedDocumentStatus: spoofedDocumentResponse.status,
      reviewStatus: reviewedDocument.status,
      acceptedFindings: reviewedDocument.acceptedCount,
      reviewProfileUpdated: reviewedDocument.profileUpdated,
      previewChanges: documentApplicationPreview.changeCount,
      applyStatus: appliedDocument.status,
      applyProfileUpdated: appliedDocument.profileUpdated,
      repeatedApplyStatus: repeatedApplicationResponse.status,
      historyStatus: appliedHistoryItem.status,
      appliedDeleteStatus: deleteAppliedResponse.status,
      unappliedDeleteStatus: deletedReview.status,
      expiredCleanupCount: cleanupResult.deletedCount
    },
    accountDeletion: {
      invalidPasswordStatus: invalidPasswordDeletion.status,
      status: deletedAccount.status,
      oldTokenStatus: deletedTokenResponse.status,
      orphanCounts
    }
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : JSON.stringify(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (userId) {
      await pool.query("DELETE FROM usuario_restricciones WHERE usuario_id = $1", [userId]);
      await pool.query("DELETE FROM usuarios WHERE id = $1 AND email = $2", [userId, email]);
    }
    await pool.end();
  });
