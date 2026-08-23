const pool = require("../../database/db");
const {
  TARGET_UNITS,
  buildMedicalDocumentProfilePreview
} = require("./medicalDocumentProfileChanges");

const TARGET_FIELDS = Object.keys(TARGET_UNITS);

class MedicalDocumentApplicationError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "MedicalDocumentApplicationError";
    this.code = code;
    this.status = status;
  }
}

const saveMedicalDocumentReview = async ({
  userId,
  requestId,
  extraction,
  acceptedFindingIds,
  acceptedFindings
}) => {
  const result = await pool.query(
    `INSERT INTO revisiones_documentos_medicos (
       usuario_id, request_id, schema_version, document_type,
       extraction, accepted_finding_ids, accepted_findings,
       status, retention_policy_version, expires_at, reviewed_at, updated_at
     )
     VALUES (
       $1, $2, '1.0', $3, $4::jsonb, $5::jsonb, $6::jsonb,
       'reviewed', '1.0', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     ON CONFLICT (usuario_id, request_id) DO UPDATE SET
       document_type = EXCLUDED.document_type,
       extraction = EXCLUDED.extraction,
       accepted_finding_ids = EXCLUDED.accepted_finding_ids,
       accepted_findings = EXCLUDED.accepted_findings,
       retention_policy_version = '1.0',
       expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days',
       reviewed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE revisiones_documentos_medicos.status = 'reviewed'
     RETURNING id, reviewed_at`,
    [
      userId,
      requestId,
      extraction.documentType,
      JSON.stringify(extraction),
      JSON.stringify(acceptedFindingIds),
      JSON.stringify(acceptedFindings)
    ]
  );

  if (!result.rows[0]) {
    throw new MedicalDocumentApplicationError(
      "Esta revision ya fue aplicada y no puede reemplazarse",
      "MEDICAL_DOCUMENT_REVIEW_ALREADY_APPLIED",
      409
    );
  }
  return result.rows[0];
};

const previewMedicalDocumentApplication = async (userId, reviewId) => {
  const client = await pool.connect();
  try {
    const context = await loadReviewContext(client, userId, reviewId, false);
    ensureReviewCanBeApplied(context.review);
    return buildPreviewFromContext(context);
  } finally {
    client.release();
  }
};

const applyMedicalDocumentApplication = async ({
  userId,
  reviewId,
  previewHash,
  confirmationVersion
}) => {
  if (confirmationVersion !== "1.0") {
    throw new MedicalDocumentApplicationError(
      "La version de confirmacion no es valida",
      "INVALID_CONFIRMATION_VERSION"
    );
  }
  if (typeof previewHash !== "string" || !/^[a-f0-9]{64}$/.test(previewHash)) {
    throw new MedicalDocumentApplicationError("La confirmacion no es valida", "INVALID_PREVIEW_HASH");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const context = await loadReviewContext(client, userId, reviewId, true);
    ensureReviewCanBeApplied(context.review);
    const preview = buildPreviewFromContext(context);

    if (preview.previewHash !== previewHash) {
      throw new MedicalDocumentApplicationError(
        "El perfil cambio desde la vista previa. Actualiza y confirma nuevamente",
        "MEDICAL_DOCUMENT_PREVIEW_CHANGED",
        409
      );
    }
    if (preview.changeCount === 0) {
      throw new MedicalDocumentApplicationError(
        "No hay cambios nuevos para aplicar al perfil",
        "NO_PROFILE_CHANGES"
      );
    }

    await insertConditions(client, userId, preview.changes.conditions);
    await updateNutritionTargets(client, userId, context.currentTargets, preview.changes.targets);

    const appliedResult = await client.query(
      `INSERT INTO aplicaciones_documentos_medicos (
         revision_id, usuario_id, confirmation_version, preview_hash, applied_changes
       )
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, applied_at`,
      [reviewId, userId, confirmationVersion, previewHash, JSON.stringify(preview.changes)]
    );
    await client.query(
      `UPDATE revisiones_documentos_medicos
       SET status = 'applied', expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND usuario_id = $2`,
      [reviewId, userId]
    );
    await client.query("COMMIT");

    return {
      reviewId,
      applicationId: Number(appliedResult.rows[0].id),
      status: "applied",
      changes: preview.changes,
      changeCount: preview.changeCount,
      profileUpdated: true,
      appliedAt: appliedResult.rows[0].applied_at
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const loadReviewContext = async (client, userId, reviewId, forUpdate) => {
  const reviewResult = await client.query(
    `SELECT id, usuario_id, request_id, accepted_findings, status
     FROM revisiones_documentos_medicos
     WHERE id = $1 AND usuario_id = $2
     ${forUpdate ? "FOR UPDATE" : ""}`,
    [reviewId, userId]
  );
  const review = reviewResult.rows[0];
  if (!review) {
    throw new MedicalDocumentApplicationError(
      "No encontramos esta revision medica",
      "MEDICAL_DOCUMENT_REVIEW_NOT_FOUND",
      404
    );
  }

  const catalogResult = await client.query(
    `SELECT code, nombre, risk_level, requires_professional_guidance
     FROM condiciones_clinicas
     WHERE is_active = TRUE
     ORDER BY code ASC`
  );
  const existingConditionsResult = await client.query(
    `SELECT cc.code
     FROM usuario_condiciones uc
     JOIN condiciones_clinicas cc ON cc.id = uc.condicion_id
     WHERE uc.usuario_id = $1
     ORDER BY cc.code ASC`,
    [userId]
  );
  const targetsResult = await client.query(
    "SELECT * FROM usuario_metas_nutricionales WHERE usuario_id = $1",
    [userId]
  );

  return {
    review,
    conditionCatalog: catalogResult.rows,
    existingConditionCodes: existingConditionsResult.rows.map((row) => row.code),
    currentTargets: targetsResult.rows[0] || null
  };
};

const buildPreviewFromContext = (context) => buildMedicalDocumentProfilePreview({
  reviewId: Number(context.review.id),
  requestId: context.review.request_id,
  acceptedFindings: context.review.accepted_findings,
  conditionCatalog: context.conditionCatalog,
  existingConditionCodes: context.existingConditionCodes,
  currentTargets: context.currentTargets
});

const ensureReviewCanBeApplied = (review) => {
  if (review.status === "applied") {
    throw new MedicalDocumentApplicationError(
      "Los cambios de esta revision ya fueron aplicados",
      "MEDICAL_DOCUMENT_REVIEW_ALREADY_APPLIED",
      409
    );
  }
};

const insertConditions = async (client, userId, conditions) => {
  for (const condition of conditions.filter((item) => item.action === "add")) {
    await client.query(
      `INSERT INTO usuario_condiciones (usuario_id, condicion_id, source, confirmed_at, notes)
       SELECT $1, id, 'ai_document', CURRENT_TIMESTAMP, $3
       FROM condiciones_clinicas
       WHERE code = $2 AND is_active = TRUE
       ON CONFLICT (usuario_id, condicion_id) DO NOTHING`,
      [userId, condition.code, condition.evidence]
    );
  }
};

const updateNutritionTargets = async (client, userId, currentTargets, targetChanges) => {
  const updates = targetChanges.filter((item) => item.action === "update");
  if (updates.length === 0) return;

  const values = Object.fromEntries(TARGET_FIELDS.map((field) => [field, currentTargets?.[field] ?? null]));
  for (const target of updates) values[target.field] = target.nextValue;

  await client.query(
    `INSERT INTO usuario_metas_nutricionales (
       usuario_id, ${TARGET_FIELDS.join(", ")}, calculation_source, notes, updated_at
     )
     VALUES ($1, ${TARGET_FIELDS.map((_, index) => `$${index + 2}`).join(", ")}, 'ai_document', $15, CURRENT_TIMESTAMP)
     ON CONFLICT (usuario_id) DO UPDATE SET
       ${TARGET_FIELDS.map((field) => `${field} = EXCLUDED.${field}`).join(",\n       ")},
       calculation_source = 'ai_document',
       notes = EXCLUDED.notes,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, ...TARGET_FIELDS.map((field) => values[field]), currentTargets?.notes ?? null]
  );
};

module.exports = {
  MedicalDocumentApplicationError,
  applyMedicalDocumentApplication,
  previewMedicalDocumentApplication,
  saveMedicalDocumentReview
};
