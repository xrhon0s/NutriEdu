const pool = require("../../database/db");
const { MedicalDocumentApplicationError } = require("./medicalDocumentApplicationService");

const RETENTION_POLICY = Object.freeze({
  version: "1.0",
  unappliedReviewDays: 30,
  originalFileRetained: false,
  appliedAuditRetention: "until_account_deletion",
  userCanDelete: "unapplied_reviews"
});

const listMedicalDocumentHistory = async (userId, cursorValue, limitValue) => {
  const cursor = optionalPositiveInteger(cursorValue, "INVALID_HISTORY_CURSOR");
  const limit = normalizeLimit(limitValue);
  const result = await pool.query(
    `SELECT
       r.id,
       r.request_id,
       r.document_type,
       r.status,
       r.reviewed_at,
       r.updated_at,
       r.expires_at,
       r.retention_policy_version,
       r.extraction->>'summary' AS summary,
       r.extraction->>'documentDate' AS document_date,
       r.extraction->>'professionalName' AS professional_name,
       jsonb_array_length(COALESCE(r.accepted_findings->'medications', '[]'::jsonb))
         + jsonb_array_length(COALESCE(r.accepted_findings->'conditions', '[]'::jsonb))
         + jsonb_array_length(COALESCE(r.accepted_findings->'dietaryInstructions', '[]'::jsonb))
         + jsonb_array_length(COALESCE(r.accepted_findings->'nutritionTargets', '[]'::jsonb))
         AS accepted_count,
       a.id AS application_id,
       a.applied_at
     FROM revisiones_documentos_medicos r
     LEFT JOIN aplicaciones_documentos_medicos a ON a.revision_id = r.id
     WHERE r.usuario_id = $1
       AND ($2::bigint IS NULL OR r.id < $2)
     ORDER BY r.id DESC
     LIMIT $3`,
    [userId, cursor, limit + 1]
  );

  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  return {
    items: rows.map(historyItem),
    nextCursor: hasMore ? Number(rows[rows.length - 1].id) : null,
    retentionPolicy: RETENTION_POLICY
  };
};

const getMedicalDocumentHistoryDetail = async (userId, reviewId) => {
  const result = await pool.query(
    `SELECT
       r.id,
       r.request_id,
       r.document_type,
       r.status,
       r.extraction,
       r.accepted_finding_ids,
       r.accepted_findings,
       r.reviewed_at,
       r.updated_at,
       r.expires_at,
       r.retention_policy_version,
       a.id AS application_id,
       a.applied_changes,
       a.applied_at
     FROM revisiones_documentos_medicos r
     LEFT JOIN aplicaciones_documentos_medicos a ON a.revision_id = r.id
     WHERE r.id = $1 AND r.usuario_id = $2`,
    [reviewId, userId]
  );
  const row = result.rows[0];
  if (!row) throw notFoundError();

  return {
    reviewId: Number(row.id),
    requestId: row.request_id,
    documentType: row.document_type,
    status: row.status,
    extraction: row.extraction,
    acceptedFindingIds: row.accepted_finding_ids,
    acceptedFindings: row.accepted_findings,
    application: row.application_id ? {
      applicationId: Number(row.application_id),
      changes: row.applied_changes,
      appliedAt: row.applied_at
    } : null,
    retention: {
      policyVersion: row.retention_policy_version,
      expiresAt: row.expires_at,
      canDelete: row.status === "reviewed"
    },
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at
  };
};

const deleteUnappliedMedicalDocumentReview = async (userId, reviewId) => {
  const deleted = await pool.query(
    `DELETE FROM revisiones_documentos_medicos
     WHERE id = $1 AND usuario_id = $2 AND status = 'reviewed'
     RETURNING id`,
    [reviewId, userId]
  );
  if (deleted.rows[0]) {
    return { reviewId: Number(deleted.rows[0].id), status: "deleted", profileUpdated: false };
  }

  const existing = await pool.query(
    "SELECT status FROM revisiones_documentos_medicos WHERE id = $1 AND usuario_id = $2",
    [reviewId, userId]
  );
  if (!existing.rows[0]) throw notFoundError();
  throw new MedicalDocumentApplicationError(
    "Una revision aplicada forma parte de la auditoria y solo se elimina al borrar la cuenta",
    "APPLIED_MEDICAL_DOCUMENT_CANNOT_BE_DELETED",
    409
  );
};

const cleanupExpiredMedicalDocumentReviews = async (database = pool) => {
  const result = await database.query(
    `DELETE FROM revisiones_documentos_medicos
     WHERE status = 'reviewed' AND expires_at <= CURRENT_TIMESTAMP
     RETURNING id`
  );
  return { deletedCount: result.rowCount, reviewIds: result.rows.map((row) => Number(row.id)) };
};

const historyItem = (row) => ({
  reviewId: Number(row.id),
  requestId: row.request_id,
  documentType: row.document_type,
  status: row.status,
  summary: row.summary || "Sin resumen disponible",
  documentDate: row.document_date || null,
  professionalName: row.professional_name || null,
  acceptedCount: Number(row.accepted_count),
  applicationId: row.application_id ? Number(row.application_id) : null,
  reviewedAt: row.reviewed_at,
  appliedAt: row.applied_at || null,
  retention: {
    policyVersion: row.retention_policy_version,
    expiresAt: row.expires_at,
    canDelete: row.status === "reviewed"
  }
});

const normalizeLimit = (value) => {
  if (value === undefined) return 20;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new MedicalDocumentApplicationError("El limite no es valido", "INVALID_HISTORY_LIMIT");
  }
  return Math.min(parsed, 50);
};

const optionalPositiveInteger = (value, code) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MedicalDocumentApplicationError("El cursor no es valido", code);
  }
  return parsed;
};

const notFoundError = () => new MedicalDocumentApplicationError(
  "No encontramos esta revision medica",
  "MEDICAL_DOCUMENT_REVIEW_NOT_FOUND",
  404
);

module.exports = {
  RETENTION_POLICY,
  cleanupExpiredMedicalDocumentReviews,
  deleteUnappliedMedicalDocumentReview,
  getMedicalDocumentHistoryDetail,
  listMedicalDocumentHistory
};
