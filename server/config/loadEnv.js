const path = require("path");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath, quiet: true });

module.exports = {
  envPath,
  loaded: !result.error,
  error: result.error || null,
};
