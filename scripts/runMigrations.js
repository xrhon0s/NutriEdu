const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const migrationEnvironmentFile = process.env.MIGRATION_ENV_FILE;
require("dotenv").config(migrationEnvironmentFile
  ? { path: path.resolve(migrationEnvironmentFile), override: true }
  : undefined);
const pool = require("../database/db");

const migrationsDirectory = path.join(__dirname, "..", "migrations");
const requestedVersions = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const statusOnly = process.argv.includes("--status");
const baselineOnly = process.argv.includes("--baseline");

const migrationFiles = fs.readdirSync(migrationsDirectory)
  .filter((fileName) => /^\d{3}_.+\.sql$/.test(fileName))
  .sort();

const selectedFiles = requestedVersions.length
  ? requestedVersions.map((version) => {
      const normalized = String(version).padStart(3, "0");
      const match = migrationFiles.find((fileName) => fileName.startsWith(`${normalized}_`));
      if (!match) throw new Error(`Migration ${normalized} does not exist`);
      return match;
    })
  : [];

const databaseTarget = () => {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.hostname}:${url.port || "5432"}/${url.pathname.slice(1)}`;
  }
  return `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
};

const checksum = (sql) => crypto.createHash("sha256").update(sql).digest("hex");

const assertMigration005 = async (client) => {
  const result = await client.query(`
    SELECT c.conname, c.confdeltype, c.confrelid::regclass::text AS referenced_table
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conname IN (
        'plan_semanal_usuario_id_fkey',
        'usuario_restricciones_usuario_id_fkey'
      )
  `);
  const expected = new Set([
    "plan_semanal_usuario_id_fkey",
    "usuario_restricciones_usuario_id_fkey"
  ]);
  for (const row of result.rows) {
    if (row.confdeltype === "c" && row.referenced_table.endsWith("usuarios")) {
      expected.delete(row.conname);
    }
  }
  if (expected.size) {
    throw new Error(`Migration 005 verification failed: missing cascade constraints ${[...expected].join(", ")}`);
  }
};

const assertMigration006 = async (client) => {
  const tables = await client.query(`
    SELECT
      to_regclass('public.notification_preferences') IS NOT NULL AS has_preferences,
      to_regclass('public.notifications') IS NOT NULL AS has_notifications,
      to_regclass('public.idx_notifications_user_created') IS NOT NULL AS has_created_index,
      to_regclass('public.idx_notifications_user_unread') IS NOT NULL AS has_unread_index
  `);
  const tableState = tables.rows[0];
  if (!Object.values(tableState).every(Boolean)) {
    throw new Error("Migration 006 verification failed: notification tables or indexes are missing");
  }

  const columns = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('notification_preferences', 'notifications')
  `);
  const presentColumns = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const expectedColumns = [
    "notification_preferences.user_id",
    "notification_preferences.timezone",
    "notification_preferences.quiet_start",
    "notification_preferences.quiet_end",
    "notification_preferences.meal_reminders",
    "notification_preferences.weekly_plan",
    "notification_preferences.shopping",
    "notification_preferences.progress",
    "notification_preferences.security",
    "notification_preferences.updated_at",
    "notifications.id",
    "notifications.user_id",
    "notifications.category",
    "notifications.event_type",
    "notifications.title",
    "notifications.body",
    "notifications.destination",
    "notifications.metadata",
    "notifications.read_at",
    "notifications.created_at"
  ];
  const missingColumns = expectedColumns.filter((column) => !presentColumns.has(column));
  if (missingColumns.length) {
    throw new Error(`Migration 006 verification failed: missing columns ${missingColumns.join(", ")}`);
  }

  const cascades = await client.query(`
    SELECT c.conrelid::regclass::text AS table_name
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.usuarios'::regclass
      AND c.confdeltype = 'c'
      AND c.conrelid IN (
        'public.notification_preferences'::regclass,
        'public.notifications'::regclass
      )
  `);
  const cascadeTables = new Set(cascades.rows.map((row) => row.table_name.split(".").pop()));
  if (!cascadeTables.has("notification_preferences") || !cascadeTables.has("notifications")) {
    throw new Error("Migration 006 verification failed: notification foreign keys are not ON DELETE CASCADE");
  }
};

const migrationVerifiers = {
  "005": assertMigration005,
  "006": assertMigration006
};

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('nutriedu_schema_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(3) PRIMARY KEY,
        file_name TEXT NOT NULL,
        checksum_sha256 CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query(
      "SELECT version, file_name, checksum_sha256, applied_at FROM schema_migrations ORDER BY version"
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row]));

    if (statusOnly) {
      console.log(JSON.stringify({
        target: databaseTarget(),
        migrations: migrationFiles.map((fileName) => {
          const version = fileName.slice(0, 3);
          return { version, fileName, recorded: applied.has(version), appliedAt: applied.get(version)?.applied_at || null };
        })
      }, null, 2));
      return;
    }

    if (!selectedFiles.length) {
      throw new Error("Specify migration versions explicitly, for example: npm run migrate -- 005 006");
    }

    console.log(`Migration target: ${databaseTarget()}`);
    for (const fileName of selectedFiles) {
      const version = fileName.slice(0, 3);
      const sql = fs.readFileSync(path.join(migrationsDirectory, fileName), "utf8");
      const migrationChecksum = checksum(sql);
      const existing = applied.get(version);

      if (baselineOnly) {
        const verify = migrationVerifiers[version];
        if (!verify) throw new Error(`Migration ${version} does not have a baseline verifier`);
        await verify(client);
        console.log(`Migration ${version} schema verified`);
      }

      if (existing) {
        if (existing.checksum_sha256 !== migrationChecksum) {
          throw new Error(`Migration ${version} changed after it was recorded`);
        }
        console.log(`Migration ${version} already recorded; skipping`);
        continue;
      }

      if (baselineOnly) {
        await client.query(
          `INSERT INTO schema_migrations (version, file_name, checksum_sha256)
           VALUES ($1, $2, $3)`,
          [version, fileName, migrationChecksum]
        );
        console.log(`Migration ${version} baselined: ${fileName}`);
        continue;
      }

      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version, file_name, checksum_sha256)
         VALUES ($1, $2, $3)`,
        [version, fileName, migrationChecksum]
      );
      console.log(`Migration ${version} applied: ${fileName}`);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('nutriedu_schema_migrations'))");
    } finally {
      client.release();
      await pool.end();
    }
  }
};

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
