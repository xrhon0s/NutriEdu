require("dotenv").config();

const pool = require("../database/db");

const DELETE_RULES = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT"
};

const run = async () => {
  const result = await pool.query(
    `SELECT
       conrelid::regclass::text AS table_name,
       conname AS constraint_name,
       confdeltype AS delete_code
     FROM pg_constraint
     WHERE contype = 'f'
       AND confrelid = 'usuarios'::regclass
     ORDER BY conrelid::regclass::text, conname`
  );
  const references = result.rows.map((row) => ({
    table: row.table_name,
    constraint: row.constraint_name,
    deleteRule: DELETE_RULES[row.delete_code] || row.delete_code,
    deletionSafe: row.delete_code === "c"
  }));
  const unsafe = references.filter((item) => !item.deletionSafe);

  console.log(JSON.stringify({
    ok: unsafe.length === 0,
    referencedTables: references.length,
    references,
    unsafe
  }, null, 2));
  if (unsafe.length) process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : JSON.stringify(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
