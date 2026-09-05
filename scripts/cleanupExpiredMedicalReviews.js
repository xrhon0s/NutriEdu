require("dotenv").config();

const pool = require("../database/db");
const { cleanupExpiredMedicalDocumentReviews } = require("../services/medicalDocument/medicalDocumentHistoryService");

cleanupExpiredMedicalDocumentReviews()
  .then((result) => console.log(JSON.stringify({ ok: true, ...result }, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : JSON.stringify(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
