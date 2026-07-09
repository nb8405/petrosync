const crypto = require("crypto");
const appConfig = require("../config/appConfig");

const algorithm = "aes-256-gcm";

const encryptionSecret = () =>
  process.env.CREDENTIAL_ENCRYPTION_KEY ||
  appConfig.auth.jwtSecret ||
  appConfig.backup.signingSecret ||
  appConfig.auth.developmentJwtSecret;

const key = () =>
  crypto.createHash("sha256").update(encryptionSecret()).digest();

const encryptCredential = (value) => {
  if (!value) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

const decryptCredential = (value) => {
  if (!value) {
    return "";
  }

  const [version, ivValue, tagValue, encryptedValue] = String(value).split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Encrypted credential format is invalid.");
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    key(),
    Buffer.from(ivValue, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = {
  encryptCredential,
  decryptCredential,
};
