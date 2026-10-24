// Input validation for task payloads. Kept dependency-free so it is easy to
// read and unit test (see test/validate.test.js).

const STATUSES = ["todo", "doing", "done"];
const PRIORITIES = ["low", "medium", "high"];

const LIMITS = {
  title: 200,
  description: 1000,
  tags: 5,
  tagLength: 20,
  subtasks: 20,
  subtaskTitle: 120,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

// Normalises tags: trims, lowercases, removes a leading "#", drops duplicates.
function normaliseTags(tags) {
  const out = [];
  for (const raw of tags) {
    const tag = String(raw).trim().replace(/^#/, "").toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Validates a task body.
 * @param {object} body     request body
 * @param {object} options  { partial: true } for PATCH (only validate given fields)
 * @returns {{ value: object, errors: string[] }}
 */
function validateTask(body, { partial = false } = {}) {
  const errors = [];
  const value = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { value, errors: ["body must be a JSON object"] };
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (has("title") || !partial) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) errors.push("title is required");
    else if (title.length > LIMITS.title) errors.push("title too long");
    else value.title = title;
  }

  if (has("description")) {
    if (typeof body.description !== "string") errors.push("description must be a string");
    else if (body.description.length > LIMITS.description) errors.push("description too long");
    else value.description = body.description.trim();
  }

  if (has("status")) {
    if (!STATUSES.includes(body.status)) errors.push(`status must be one of ${STATUSES.join(", ")}`);
    else value.status = body.status;
  }

  if (has("priority")) {
    if (!PRIORITIES.includes(body.priority)) errors.push(`priority must be one of ${PRIORITIES.join(", ")}`);
    else value.priority = body.priority;
  }

  if (has("dueDate")) {
    if (body.dueDate === null || body.dueDate === "") value.dueDate = null;
    else if (typeof body.dueDate !== "string" || !isValidDate(body.dueDate)) errors.push("dueDate must be YYYY-MM-DD");
    else value.dueDate = body.dueDate;
  }

  if (has("tags")) {
    if (!Array.isArray(body.tags)) errors.push("tags must be an array");
    else {
      const tags = normaliseTags(body.tags);
      if (tags.length > LIMITS.tags) errors.push(`at most ${LIMITS.tags} tags`);
      else if (tags.some((t) => t.length > LIMITS.tagLength || !/^[a-z0-9-]+$/.test(t)))
        errors.push(`tags may only use a-z, 0-9 and "-" (max ${LIMITS.tagLength} chars)`);
      else value.tags = tags;
    }
  }

  if (has("subtasks")) {
    if (!Array.isArray(body.subtasks)) errors.push("subtasks must be an array");
    else if (body.subtasks.length > LIMITS.subtasks) errors.push(`at most ${LIMITS.subtasks} subtasks`);
    else {
      const subtasks = [];
      for (const s of body.subtasks) {
        const title = s && typeof s.title === "string" ? s.title.trim() : "";
        if (!title || title.length > LIMITS.subtaskTitle) {
          errors.push(`each subtask needs a title (max ${LIMITS.subtaskTitle} chars)`);
          break;
        }
        subtasks.push({ title, done: Boolean(s.done) });
      }
      value.subtasks = subtasks;
    }
  }

  return { value, errors };
}

// Escapes user input so it can be used safely inside a RegExp (search).
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { validateTask, escapeRegex, isValidDate, normaliseTags, STATUSES, PRIORITIES, LIMITS };
