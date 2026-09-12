const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createRequestContext } = require("../middleware/requestContext");

const logs = [];
const times = [1000, 1042, 1042];
const req = { method: "POST", originalUrl: "/api/users/reset-password?token=secret", body: { password: "NeverLog#2026" } };
const res = new EventEmitter();
res.statusCode = 429;
res.setHeader = (name, value) => { res.headers = { ...res.headers, [name]: value }; };
createRequestContext({ logger: (line) => logs.push(line), now: () => times.shift(), randomUUID: () => "request-test-id" })(req, res, () => { req.user = { id: 7, email: "private@example.test" }; });
res.emit("finish");

const entry = JSON.parse(logs[0]);
assert.equal(res.headers["X-Request-ID"], "request-test-id");
assert.equal(entry.path, "/api/users/reset-password");
assert.equal(entry.statusCode, 429);
assert.equal(entry.durationMs, 42);
assert.equal(entry.userId, 7);
assert.equal(entry.level, "warn");
assert.doesNotMatch(logs[0], /secret|NeverLog|private@example/);
console.log(JSON.stringify({ ok: true, requestId: true, structuredJson: true, queryAndBodyExcluded: true, duration: true }, null, 2));
