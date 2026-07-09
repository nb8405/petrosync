require("./config/loadEnv");

const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const poolCreatedAt = new Date().toISOString();

const passwordState = (value) => {
  if (!value) {
    return "empty";
  }

  return `set(length=${String(value).length})`;
};

const parseConnectionString = (value) => {
  try {
    const parsed = new URL(value);

    return {
      host: parsed.hostname || "",
      port: Number(parsed.port || 5432),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      user: decodeURIComponent(parsed.username || ""),
      pgPassState: passwordState(decodeURIComponent(parsed.password || "")),
    };
  } catch {
    return {
      host: "",
      port: null,
      database: "",
      user: "",
      pgPassState: "unparseable",
    };
  }
};

const poolConfig = connectionString
  ? {
      connectionString,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "petrol_pump_management",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
    };

if (process.env.NODE_ENV === "production" && !connectionString) {
  const requiredDbEnv = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = requiredDbEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Production database configuration is incomplete: ${missing.join(", ")}`
    );
  }
}

const pool = new Pool(poolConfig);

const getConnectionInfo = () => ({
  source: connectionString ? "DATABASE_URL" : "PG env/defaults",
  ...(connectionString
    ? parseConnectionString(connectionString)
    : {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
        user: poolConfig.user,
        pgPassState: passwordState(poolConfig.password),
      }),
  databaseUrlOverridesPgVars: Boolean(connectionString),
  pgEnvPresent: {
    host: Boolean(process.env.PGHOST),
    port: Boolean(process.env.PGPORT),
    database: Boolean(process.env.PGDATABASE),
    user: Boolean(process.env.PGUSER),
    pass: Boolean(process.env.PGPASSWORD),
  },
  processId: process.pid,
  modulePath: __filename,
  poolCreatedAt,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  getConnectionInfo,
};
