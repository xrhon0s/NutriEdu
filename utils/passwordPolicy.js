const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_BYTES = 72;

const passwordChecks = (password) => {
  const value = typeof password === "string" ? password : "";
  return {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    maxBytes: Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9\s]/.test(value)
  };
};

const validatePassword = (password) => {
  const checks = passwordChecks(password);
  const valid = typeof password === "string" && Object.values(checks).every(Boolean);
  return {
    valid,
    checks,
    message: valid
      ? null
      : "La contrasena debe tener entre 10 y 72 caracteres e incluir mayuscula, minuscula, numero y simbolo"
  };
};

module.exports = { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES, passwordChecks, validatePassword };
