const userRepository = require("../repositories/userRepository");
const { hashPassword } = require("../utils/passwordHashing");

const text = (value) => String(value || "").trim();

const createUserWithPassword = async ({
  client,
  username,
  password,
  displayName,
  role,
  firstName = null,
  lastName = null,
  email = null,
  recoveryEmail = null,
  recoveryPhone = null,
  securityQuestion = null,
  securityAnswer = null,
  createdBy = null,
}) => {
  const passwordHash = await hashPassword(password);
  const normalizedSecurityAnswer = text(securityAnswer);
  const securityAnswerHash = normalizedSecurityAnswer
    ? await hashPassword(normalizedSecurityAnswer)
    : null;

  return userRepository.createUser(client, {
    username: text(username),
    passwordHash,
    displayName: displayName || text(username),
    role,
    firstName,
    lastName,
    email,
    recoveryEmail,
    recoveryPhone,
    securityQuestion,
    securityAnswerHash,
    createdBy,
  });
};

module.exports = {
  createUserWithPassword,
};
