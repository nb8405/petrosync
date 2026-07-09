require("../config/loadEnv");

const fs = require("fs");
const path = require("path");
const db = require("../db");

const main = async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "reset-for-testing.sql"),
    "utf8"
  );

  await db.query(sql);
  console.log("Development database reset to first-run state.");
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
