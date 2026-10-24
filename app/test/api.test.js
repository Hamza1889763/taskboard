// API integration tests against a real (in-memory) MongoDB.
// mongodb-memory-server downloads a mongod binary on first run.

const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient } = require("mongodb");
const { createApp } = require("../src/app");
const { prepare } = require("../src/db");

let mongo, client, server, base;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongo.getUri());
  const db = client.db("taskboard-test");
  await prepare(db);
  const app = createApp({ getDb: () => db, instanceId: "test-instance", az: "test-az" });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await client.close();
  await mongo.stop();
});

const api = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test("health and info", async () => {
  assert.equal((await api("GET", "/health")).body.status, "ok");
  assert.equal((await api("GET", "/api/info")).body.instance, "test-instance");
});

test("create, update, filter and delete a task", async () => {
  const created = await api("POST", "/api/tasks", { title: "Write tests", priority: "high", tags: ["qa"] });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "todo");
  const id = created.body._id;

  const moved = await api("PATCH", `/api/tasks/${id}`, { status: "doing", dueDate: "2026-01-01" });
  assert.equal(moved.body.status, "doing");
  assert.equal(moved.body.done, false);

  assert.equal((await api("GET", "/api/tasks?status=doing")).body.length, 1);
  assert.equal((await api("GET", "/api/tasks?q=WRITE")).body.length, 1);
  assert.equal((await api("GET", "/api/tasks?tag=nope")).body.length, 0);

  const stats = (await api("GET", "/api/stats")).body;
  assert.equal(stats.byStatus.doing, 1);
  assert.equal(stats.overdue, 1);

  // empty PATCH body toggles done (v1 behaviour)
  assert.equal((await api("PATCH", `/api/tasks/${id}`)).body.status, "done");

  assert.equal((await api("DELETE", `/api/tasks/${id}`)).status, 204);
  assert.equal((await api("GET", `/api/tasks/${id}`)).status, 404);
});

test("sorts by priority and due date", async () => {
  await api("POST", "/api/tasks", { title: "low", priority: "low", dueDate: "2030-01-02" });
  await api("POST", "/api/tasks", { title: "high", priority: "high" });
  await api("POST", "/api/tasks", { title: "medium", priority: "medium", dueDate: "2030-01-01" });

  const byPriority = (await api("GET", "/api/tasks?sort=priority")).body.map((t) => t.title);
  assert.deepEqual(byPriority, ["high", "medium", "low"]);
  const byDue = (await api("GET", "/api/tasks?sort=due")).body.map((t) => t.title);
  assert.deepEqual(byDue, ["medium", "low", "high"]);
});

test("clear completed", async () => {
  const { body } = await api("POST", "/api/tasks", { title: "finished", status: "done" });
  assert.equal(body.done, true);
  const res = await api("DELETE", "/api/tasks?status=done");
  assert.ok(res.body.deleted >= 1);
});

test("rejects bad input", async () => {
  assert.equal((await api("POST", "/api/tasks", { title: "" })).status, 400);
  assert.equal((await api("POST", "/api/tasks", { title: "x", priority: "urgent" })).status, 400);
  assert.equal((await api("PATCH", "/api/tasks/not-an-id", { title: "x" })).status, 400);
  assert.equal((await api("GET", "/api/tasks?status=weird")).status, 400);
  assert.equal((await api("DELETE", "/api/tasks")).status, 400);
  assert.equal((await api("GET", "/api/nothing")).status, 404);
});
