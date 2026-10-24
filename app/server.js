// TaskBoard - 3-tier web app (frontend + Express API + MongoDB)
// Built for CSC418 DevOps Lab Mid.
//
// This file only reads config and starts the server. The app itself lives in
// src/: app.js (Express setup), routes/tasks.js (API), db.js, validate.js.

const os = require("os");
const { createApp } = require("./src/app");
const db = require("./src/db");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "taskboard";
// INSTANCE_ID is injected by the EC2 user-data script so you can SEE the
// load balancer switching between instances. Falls back to container hostname.
const INSTANCE_ID = process.env.INSTANCE_ID || os.hostname();
const AZ = process.env.AZ || "local";

const app = createApp({ getDb: db.getDb, instanceId: INSTANCE_ID, az: AZ });

const server = app.listen(PORT, () => {
  console.log(`[web] TaskBoard listening on port ${PORT} (instance: ${INSTANCE_ID})`);
  db.connectWithRetry(MONGO_URL, DB_NAME);
});

// Graceful shutdown: `docker stop` sends SIGTERM. Finish open requests,
// close the DB connection, then exit (instead of being killed after 10s).
function shutdown(signal) {
  console.log(`[web] ${signal} received, shutting down...`);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
