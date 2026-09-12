const pool = require("../database/db");
const { summarizeProgress, validateProgressEntry } = require("../services/progressService");

const fields = `id, recorded_on, weight_kg, waist_cm, body_fat_pct, adherence_pct,
  energy_level, notes, source, created_at, updated_at`;

const listProgress = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 50);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const [page, count, baseline, latest] = await Promise.all([
      pool.query(`SELECT ${fields} FROM usuario_progreso WHERE usuario_id = $1 ORDER BY recorded_on DESC, id DESC LIMIT $2 OFFSET $3`, [req.user.id, limit, offset]),
      pool.query("SELECT COUNT(*)::int AS total FROM usuario_progreso WHERE usuario_id = $1", [req.user.id]),
      pool.query(`SELECT ${fields} FROM usuario_progreso WHERE usuario_id = $1 ORDER BY recorded_on ASC, id ASC LIMIT 1`, [req.user.id]),
      pool.query(`SELECT ${fields} FROM usuario_progreso WHERE usuario_id = $1 ORDER BY recorded_on DESC, id DESC LIMIT 1`, [req.user.id])
    ]);
    const total = count.rows[0].total;
    const bounds = baseline.rows.length ? [baseline.rows[0], latest.rows[0]] : [];
    return res.json({
      items: page.rows,
      pagination: { limit, offset, total, hasMore: offset + page.rows.length < total },
      summary: summarizeProgress(bounds, total)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error consultando el seguimiento" });
  }
};

const saveProgress = async (req, res) => {
  const validated = validateProgressEntry(req.body);
  if (!validated.valid) return res.status(400).json({ code: "INVALID_PROGRESS_ENTRY", message: validated.message });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = validated.values;
    const result = await client.query(
      `INSERT INTO usuario_progreso (usuario_id, recorded_on, weight_kg, waist_cm, body_fat_pct, adherence_pct, energy_level, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (usuario_id, recorded_on) DO UPDATE SET
         weight_kg=EXCLUDED.weight_kg, waist_cm=EXCLUDED.waist_cm, body_fat_pct=EXCLUDED.body_fat_pct,
         adherence_pct=EXCLUDED.adherence_pct, energy_level=EXCLUDED.energy_level, notes=EXCLUDED.notes,
         updated_at=CURRENT_TIMESTAMP
       RETURNING ${fields}`,
      [req.user.id, validated.recordedOn, value.weightKg, value.waistCm, value.bodyFatPct, value.adherencePct, value.energyLevel, validated.notes]
    );
    const latestWeight = await client.query(
      `SELECT weight_kg FROM usuario_progreso WHERE usuario_id=$1 AND weight_kg IS NOT NULL ORDER BY recorded_on DESC, id DESC LIMIT 1`,
      [req.user.id]
    );
    if (latestWeight.rows[0]) {
      await client.query(
        `INSERT INTO perfiles_usuario (usuario_id, peso_kg, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)
         ON CONFLICT (usuario_id) DO UPDATE SET peso_kg=EXCLUDED.peso_kg, updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, latestWeight.rows[0].weight_kg]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ message: "Progreso guardado correctamente", entry: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return res.status(500).json({ error: "Error guardando el seguimiento" });
  } finally { client.release(); }
};

const deleteProgress = async (req, res) => {
  const entryId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(entryId) || entryId < 1) return res.status(400).json({ message: "Medicion invalida" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deleted = await client.query(
      "DELETE FROM usuario_progreso WHERE id=$1 AND usuario_id=$2 RETURNING id, weight_kg",
      [entryId, req.user.id]
    );
    if (!deleted.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Medicion no encontrada" });
    }
    if (deleted.rows[0].weight_kg !== null) {
      const latestWeight = await client.query(
        "SELECT weight_kg FROM usuario_progreso WHERE usuario_id=$1 AND weight_kg IS NOT NULL ORDER BY recorded_on DESC, id DESC LIMIT 1",
        [req.user.id]
      );
      if (latestWeight.rows[0]) {
        await client.query("UPDATE perfiles_usuario SET peso_kg=$2, updated_at=CURRENT_TIMESTAMP WHERE usuario_id=$1", [req.user.id, latestWeight.rows[0].weight_kg]);
      }
    }
    await client.query("COMMIT");
    return res.json({ message: "Medicion eliminada" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return res.status(500).json({ error: "Error eliminando la medicion" });
  } finally { client.release(); }
};

module.exports = { deleteProgress, listProgress, saveProgress };
