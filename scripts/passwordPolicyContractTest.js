const assert = require("node:assert/strict");
const { validatePassword } = require("../utils/passwordPolicy");

const run = () => {
  for (const weakPassword of ["1234", "password123!", "PASSWORD123!", "Password!!!", "Password123"]) {
    assert.equal(validatePassword(weakPassword).valid, false, `${weakPassword} should be rejected`);
  }
  assert.equal(validatePassword("NutriEdu#2026").valid, true);
  assert.equal(validatePassword(`A1!${"a".repeat(70)}`).valid, false);
  assert.equal(validatePassword(`A1!${"á".repeat(35)}`).valid, false, "bcrypt byte limit must be enforced");
  console.log(JSON.stringify({ ok: true, shortRejected: true, complexityEnforced: true, bcryptByteLimitEnforced: true }, null, 2));
};

run();
