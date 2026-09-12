const fieldRules = {
  weightKg: [20, 500],
  waistCm: [30, 300],
  bodyFatPct: [1, 75],
  adherencePct: [0, 100],
  energyLevel: [1, 5]
};

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const validateProgressEntry = (body, today = new Date().toISOString().slice(0, 10)) => {
  body = body && typeof body === "object" ? body : {};
  const recordedOn = body.recordedOn || today;
  const parsedDate = new Date(`${recordedOn}T00:00:00Z`);
  const isRealDate = !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === recordedOn;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedOn) || !isRealDate || recordedOn > today) {
    return { valid: false, message: "La fecha de seguimiento no es valida" };
  }

  const values = Object.fromEntries(Object.keys(fieldRules).map((field) => [field, parseOptionalNumber(body[field])]));
  if (Object.values(values).every((value) => value === null)) {
    return { valid: false, message: "Registra al menos una medida de progreso" };
  }
  for (const [field, [min, max]] of Object.entries(fieldRules)) {
    const value = values[field];
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) {
      return { valid: false, message: `El valor de ${field} esta fuera del rango permitido` };
    }
  }
  if (values.energyLevel !== null && !Number.isInteger(values.energyLevel)) {
    return { valid: false, message: "El nivel de energia debe ser un entero entre 1 y 5" };
  }
  return { valid: true, recordedOn, values, notes: String(body.notes || "").trim() || null };
};

const delta = (latest, baseline) => latest == null || baseline == null ? null : Math.round((Number(latest) - Number(baseline)) * 100) / 100;

const summarizeProgress = (rows, total = rows.length) => {
  if (!rows.length) return { entries: 0, baseline: null, latest: null, change: null };
  const ascending = [...rows].sort((a, b) => String(a.recorded_on).localeCompare(String(b.recorded_on)));
  const baseline = ascending[0];
  const latest = ascending[ascending.length - 1];
  return {
    entries: total,
    baseline,
    latest,
    change: {
      weightKg: delta(latest.weight_kg, baseline.weight_kg),
      waistCm: delta(latest.waist_cm, baseline.waist_cm),
      bodyFatPct: delta(latest.body_fat_pct, baseline.body_fat_pct)
    }
  };
};

module.exports = { validateProgressEntry, summarizeProgress };
