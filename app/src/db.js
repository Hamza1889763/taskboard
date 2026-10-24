// MongoDB connection, indexes and a one-time migration for old task documents.

const { MongoClient } = require("mongodb");

let client = null;
let db = null;

async function prepare(database) {
  const tasks = database.collection("tasks");
  await tasks.createIndex({ status: 1, createdAt: -1 });
  await tasks.createIndex({ dueDate: 1 });
  await tasks.createIndex({ tags: 1 });

  // Tasks created by v1 of the app only had { title, done }. Give them the
  // new fields so the board can show them (status is derived from "done").
  await tasks.updateMany({ status: { $exists: false } }, [
    {
      $set: {
        status: { $cond: [{ $eq: ["$done", true] }, "done", "todo"] },
        priority: "medium",
        description: "",
        dueDate: null,
        tags: [],
        subtasks: [],
        updatedAt: "$createdAt",
      },
    },
  ]);
}

// Retry until MongoDB is reachable (the DB container may start slower)
async function connectWithRetry(url, dbName, attempt = 1) {
  try {
    client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db(dbName);
    await prepare(db);
    console.log(`[db] connected to ${url}/${dbName}`);
    return db;
  } catch (err) {
    console.error(`[db] attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
    await new Promise((r) => setTimeout(r, 3000));
    return connectWithRetry(url, dbName, attempt + 1);
  }
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connectWithRetry, prepare, close, getDb: () => db };
