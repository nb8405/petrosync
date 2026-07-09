const { runMigrations } = require("./migrationRunner");

runMigrations()
  .then((result) => {
    console.log(`Migrations applied: ${result.applied.join(", ") || "none"}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
