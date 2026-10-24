// Small helpers so route handlers can just `throw` and let one place reply.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 does not catch rejected promises, so wrap async handlers.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "body too large" });
  const status = err.status || 500;
  if (status >= 500) console.error(`[web] ${req.method} ${req.originalUrl} failed:`, err);
  res.status(status).json({ error: status >= 500 ? "internal server error" : err.message });
}

module.exports = { HttpError, asyncHandler, errorHandler };
