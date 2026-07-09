const argon2 = require("argon2");

const ARGON2_HASH_PREFIX = "$argon2id$";

const isArgon2Hash = (hash) =>
  typeof hash === "string" && hash.startsWith(ARGON2_HASH_PREFIX);

const assertArgon2Hash = (hash) => {
  if (!isArgon2Hash(hash)) {
    throw new Error("Password hashes must be Argon2id hashes.");
  }
};

const hashPassword = (password) => argon2.hash(password);

const verifyPassword = (hash, password) => {
  assertArgon2Hash(hash);
  return argon2.verify(hash, password);
};

module.exports = {
  ARGON2_HASH_PREFIX,
  assertArgon2Hash,
  hashPassword,
  isArgon2Hash,
  verifyPassword,
};
