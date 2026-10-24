// Builds the Express app. Kept separate from server.js so tests can create
// an app against a throwaway database without opening a real port.

const express = require("express");
const os = require("os");
const path = require("path");
const taskRoutes = require("./routes/tasks");
const { errorHandler } = require("./errors");

function createApp({ getDb, instanceId, az }) {
  const app = express();
  app.disable("x-powered-by");

  // Basic security headers (what the "helmet" package would set for us)
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    next();
  });

  // Request log: method, path, status and time taken (skips static files)
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`[web] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  app.use(express.json({ limit: "20kb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Health check used by Docker HEALTHCHECK and the AWS Target Group
  app.get("/health", async (req, res) => {
    const db = getDb();
    if (!db) return res.status(503).json({ status: "starting", db: "down" });
    try {
      await db.command({ ping: 1 });
      res.json({ status: "ok", db: "up", instance: instanceId, uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: "error", db: "down" });
    }
  });

  // Which server answered? (used by the LB demo script)
  app.get("/api/info", (req, res) => {
    res.json({ instance: instanceId, az, container: os.hostname(), time: new Date().toISOString() });
  });

  // Reject task API calls while the DB is not ready
  app.use("/api", (req, res, next) => {
    if (!getDb()) return res.status(503).json({ error: "database not ready" });
    next();
  });
  app.use("/api", taskRoutes({ getDb, instanceId }));

  app.use("/api", (req, res) => res.status(404).json({ error: "no such endpoint" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
