const fs = require("fs");
const path = require("path");
const db = require("../db");

const migrationsDir = path.join(__dirname, "migrations");

const expandIncludes = (sql, baseDir) =>
  sql.replace(/^\\i\s+(.+)$/gm, (match, includePath) => {
    const resolved = path.resolve(baseDir, includePath.trim());
    return fs.readFileSync(resolved, "utf8");
  });

const ensureMigrationTable = () =>
  db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

const appliedVersions = async () => {
  const result = await db.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
};

const runMigrations = async () => {
  await ensureMigrationTable();

  const applied = await appliedVersions();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const appliedNow = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");

    if (applied.has(version)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = expandIncludes(
      fs.readFileSync(fullPath, "utf8"),
      path.dirname(fullPath)
    );

    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version]
      );
      await db.query("COMMIT");
      appliedNow.push(version);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  return {
    ok: true,
    applied: appliedNow,
  };
};

module.exports = {
  runMigrations,
};
