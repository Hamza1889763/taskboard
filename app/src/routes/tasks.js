// /api/tasks and /api/stats routes.

const express = require("express");
const { ObjectId } = require("mongodb");
const { validateTask, escapeRegex, STATUSES, PRIORITIES } = require("../validate");
const { HttpError, asyncHandler } = require("../errors");

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  due: { dueDateSort: 1, createdAt: -1 },
  priority: { priorityRank: -1, createdAt: -1 },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseId(id) {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "bad id");
  return new ObjectId(id);
}

module.exports = function taskRoutes({ getDb, instanceId }) {
  const router = express.Router();
  const tasks = () => getDb().collection("tasks");

  // GET /api/tasks?status=todo&priority=high&tag=api&q=deploy&sort=due
  router.get(
    "/tasks",
    asyncHandler(async (req, res) => {
      const { status, priority, tag, q } = req.query;
      const sort = SORTS[req.query.sort] ? req.query.sort : "newest";
      const match = {};
      if (status) {
        if (!STATUSES.includes(status)) throw new HttpError(400, "bad status filter");
        match.status = status;
      }
      if (priority) {
        if (!PRIORITIES.includes(priority)) throw new HttpError(400, "bad priority filter");
        match.priority = priority;
      }
      if (tag) match.tags = String(tag).toLowerCase();
      if (q) {
        const re = new RegExp(escapeRegex(String(q).slice(0, 100)), "i");
        match.$or = [{ title: re }, { description: re }, { tags: re }];
      }

      // Aggregation lets us sort by computed fields (priority rank, "no due
      // date goes last") without storing them on every document.
      const list = await tasks()
        .aggregate([
          { $match: match },
          {
            $addFields: {
              priorityRank: {
                $switch: {
                  branches: Object.entries(PRIORITY_RANK).map(([p, rank]) => ({
                    case: { $eq: ["$priority", p] },
                    then: rank,
                  })),
                  default: 0,
                },
              },
              dueDateSort: { $ifNull: ["$dueDate", "9999-12-31"] },
            },
          },
          { $sort: SORTS[sort] },
          { $project: { priorityRank: 0, dueDateSort: 0 } },
        ])
        .toArray();
      res.json(list);
    })
  );

  router.get(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      const task = await tasks().findOne({ _id: parseId(req.params.id) });
      if (!task) throw new HttpError(404, "not found");
      res.json(task);
    })
  );

  router.post(
    "/tasks",
    asyncHandler(async (req, res) => {
      const { value, errors } = validateTask(req.body);
      if (errors.length) throw new HttpError(400, errors.join("; "));
      const now = new Date();
      const doc = {
        description: "",
        status: "todo",
        priority: "medium",
        dueDate: null,
        tags: [],
        subtasks: [],
        ...value,
        createdAt: now,
        updatedAt: now,
        createdOn: instanceId,
      };
      doc.done = doc.status === "done";
      const result = await tasks().insertOne(doc);
      res.status(201).json({ _id: result.insertedId, ...doc });
    })
  );

  // PATCH with a body updates the given fields. An empty body toggles
  // done/todo, which keeps the v1 API (and the curl demos) working.
  router.patch(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      const _id = parseId(req.params.id);
      const task = await tasks().findOne({ _id });
      if (!task) throw new HttpError(404, "not found");

      let changes;
      if (!req.body || Object.keys(req.body).length === 0) {
        changes = { status: task.status === "done" ? "todo" : "done" };
      } else {
        const { value, errors } = validateTask(req.body, { partial: true });
        if (errors.length) throw new HttpError(400, errors.join("; "));
        changes = value;
      }
      if (changes.status) changes.done = changes.status === "done";
      changes.updatedAt = new Date();

      const updated = await tasks().findOneAndUpdate({ _id }, { $set: changes }, { returnDocument: "after" });
      res.json(updated);
    })
  );

  router.delete(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      await tasks().deleteOne({ _id: parseId(req.params.id) });
      res.status(204).end();
    })
  );

  // DELETE /api/tasks?status=done  -> "clear completed"
  router.delete(
    "/tasks",
    asyncHandler(async (req, res) => {
      if (req.query.status !== "done") throw new HttpError(400, "only ?status=done can be bulk deleted");
      const result = await tasks().deleteMany({ status: "done" });
      res.json({ deleted: result.deletedCount });
    })
  );

  router.get(
    "/stats",
    asyncHandler(async (req, res) => {
      const [facets] = await tasks()
        .aggregate([
          {
            $facet: {
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              byPriority: [{ $match: { status: { $ne: "done" } } }, { $group: { _id: "$priority", count: { $sum: 1 } } }],
              overdue: [{ $match: { status: { $ne: "done" }, dueDate: { $ne: null, $lt: today() } } }, { $count: "n" }],
              tags: [{ $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }],
            },
          },
        ])
        .toArray();

      const toMap = (rows, keys) => Object.fromEntries(keys.map((k) => [k, rows.find((r) => r._id === k)?.count || 0]));
      const byStatus = toMap(facets.byStatus, STATUSES);
      const total = STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
      res.json({
        total,
        byStatus,
        openByPriority: toMap(facets.byPriority, PRIORITIES),
        overdue: facets.overdue[0]?.n || 0,
        completion: total ? Math.round((byStatus.done / total) * 100) : 0,
        tags: facets.tags.map((t) => ({ tag: t._id, count: t.count })),
      });
    })
  );

  return router;
};
