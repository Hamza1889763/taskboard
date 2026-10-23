// TaskBoard - simple 3-tier web app (frontend + Express API + MongoDB)
// Built for CSC418 DevOps Lab Mid.

const express = require("express");
const os = require("os");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "taskboard";
// INSTANCE_ID is injected by the EC2 user-data script so you can SEE the
// load balancer switching between instances. Falls back to container hostname.
const INSTANCE_ID = process.env.INSTANCE_ID || os.hostname();
const AZ = process.env.AZ || "local";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let db = null;

// Retry until MongoDB is reachable (the DB container may start slower)
async function connectWithRetry(attempt = 1) {
  try {
    const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`[db] connected to ${MONGO_URL}/${DB_NAME}`);
  } catch (err) {
    console.error(`[db] attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
    setTimeout(() => connectWithRetry(attempt + 1), 3000);
  }
}

const tasks = () => db.collection("tasks");

// Middleware: reject API calls while DB is not ready
function requireDb(req, res, next) {
  if (!db) return res.status(503).json({ error: "database not ready" });
  next();
}

// Health check used by Docker HEALTHCHECK and the AWS Target Group
app.get("/health", async (req, res) => {
  if (!db) return res.status(503).json({ status: "starting", db: "down" });
  try {
    await db.command({ ping: 1 });
    res.json({ status: "ok", db: "up", instance: INSTANCE_ID });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});

// Which server answered? (used by the LB demo script)
app.get("/api/info", (req, res) => {
  res.json({ instance: INSTANCE_ID, az: AZ, container: os.hostname(), time: new Date().toISOString() });
});

app.get("/api/tasks", requireDb, async (req, res) => {
  const list = await tasks().find().sort({ createdAt: -1 }).toArray();
  res.json(list);
});

app.post("/api/tasks", requireDb, async (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  if (title.length > 200) return res.status(400).json({ error: "title too long" });
  const doc = { title, done: false, createdAt: new Date(), createdOn: INSTANCE_ID };
  const result = await tasks().insertOne(doc);
  res.status(201).json({ _id: result.insertedId, ...doc });
});

app.patch("/api/tasks/:id", requireDb, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad id" });
  const _id = new ObjectId(req.params.id);
  const task = await tasks().findOne({ _id });
  if (!task) return res.status(404).json({ error: "not found" });
  await tasks().updateOne({ _id }, { $set: { done: !task.done } });
  res.json({ ...task, done: !task.done });
});

app.delete("/api/tasks/:id", requireDb, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad id" });
  await tasks().deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`[web] TaskBoard listening on port ${PORT} (instance: ${INSTANCE_ID})`);
  connectWithRetry();
});
