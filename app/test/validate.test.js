const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTask, escapeRegex, isValidDate } = require("../src/validate");

test("requires a title on create", () => {
  assert.deepEqual(validateTask({}).errors, ["title is required"]);
  assert.deepEqual(validateTask({ title: "   " }).errors, ["title is required"]);
});

test("partial validation skips missing fields", () => {
  const { value, errors } = validateTask({ priority: "high" }, { partial: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { priority: "high" });
});

test("rejects unknown status and priority", () => {
  const { errors } = validateTask({ title: "x", status: "blocked", priority: "urgent" });
  assert.equal(errors.length, 2);
});

test("normalises tags", () => {
  const { value, errors } = validateTask({ title: "x", tags: ["#API", "api", " Docker "] });
  assert.deepEqual(errors, []);
  assert.deepEqual(value.tags, ["api", "docker"]);
});

test("rejects bad tags", () => {
  assert.equal(validateTask({ title: "x", tags: ["no spaces"] }).errors.length, 1);
  assert.equal(validateTask({ title: "x", tags: ["a", "b", "c", "d", "e", "f"] }).errors.length, 1);
});

test("validates due dates", () => {
  assert.equal(isValidDate("2026-02-28"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("28/02/2026"), false);
  assert.equal(validateTask({ title: "x", dueDate: "" }).value.dueDate, null);
});

test("validates subtasks", () => {
  const { value } = validateTask({ title: "x", subtasks: [{ title: " a ", done: 1 }] });
  assert.deepEqual(value.subtasks, [{ title: "a", done: true }]);
  assert.equal(validateTask({ title: "x", subtasks: [{ title: "" }] }).errors.length, 1);
});

test("escapes regex characters", () => {
  assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
});
