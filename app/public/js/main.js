// TaskBoard front-end: state, events and API calls.

import { api } from "./api.js";
import { el, renderBoard, renderStats, renderTagOptions, toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
const board = $("task-list");
const form = $("task-form");
const input = $("task-input");
const dialog = $("task-dialog");
const editForm = $("edit-form");

const UNDO_MS = 5000;

const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem("taskboard." + key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("taskboard." + key, JSON.stringify(value));
    } catch { /* storage may be blocked; filters just won't persist */ }
  },
};

const state = {
  tasks: [],
  filters: { q: "", priority: "", tag: "", sort: "newest", ...storage.get("filters", {}) },
  pendingDeletes: new Map(), // id -> timeout, for "Undo"
  editing: null, // task open in the dialog
  editSubtasks: [],
};

// ---------- infrastructure badges (load balancer demo) ----------

async function loadInfo() {
  try {
    const info = await api.info();
    $("instance-id").textContent = "Served by: " + info.instance;
    $("az").textContent = "AZ: " + info.az;
  } catch { /* ignore */ }
  const db = $("db-status");
  try {
    const ok = await api.health();
    db.textContent = ok ? "DB: connected" : "DB: down";
    db.className = "badge " + (ok ? "ok" : "bad");
  } catch {
    db.textContent = "DB: unreachable";
    db.className = "badge bad";
  }
}

// ---------- data loading ----------

let loadSeq = 0;
async function loadTasks() {
  const seq = ++loadSeq;
  try {
    const [tasks, stats] = await Promise.all([api.list(state.filters), api.stats()]);
    if (seq !== loadSeq) return; // a newer request already won
    state.tasks = tasks;
    renderStats(stats);
    renderTagOptions($("tag-filter"), stats.tags, state.filters.tag);
    render();
  } catch (err) {
    if (seq === loadSeq) toast(err.message, { kind: "error" });
  }
}

function render() {
  const visible = state.tasks.filter((t) => !state.pendingDeletes.has(t._id));
  const { q, priority, tag } = state.filters;
  renderBoard(board, visible, handlers, { filtered: Boolean(q || priority || tag) });
  $("empty-msg").hidden = visible.length > 0 || Boolean(q || priority || tag);
}

function setFilter(key, value) {
  state.filters[key] = value;
  storage.set("filters", state.filters);
  syncFilterControls();
  loadTasks();
}

function syncFilterControls() {
  $("search").value = state.filters.q;
  $("sort").value = state.filters.sort;
  $("tag-filter").value = state.filters.tag;
  for (const b of $("priority-filter").querySelectorAll("button")) {
    b.classList.toggle("active", b.dataset.value === state.filters.priority);
  }
}

// ---------- task actions ----------

async function updateTask(task, changes, successMsg) {
  // Optimistic update: change the card right away, roll back on error.
  const before = { ...task };
  Object.assign(task, changes);
  render();
  try {
    Object.assign(task, await api.update(task._id, changes));
    if (successMsg) toast(successMsg);
    loadTasks();
  } catch (err) {
    Object.assign(task, before);
    render();
    toast(err.message, { kind: "error" });
  }
}

const STATUS_NAME = { todo: "To do", doing: "In progress", done: "Done" };

const handlers = {
  onToggle: (task) => updateTask(task, { status: task.status === "done" ? "todo" : "done" }),
  onMove: (task, status) => {
    updateTask(task, { status }, `Moved to ${STATUS_NAME[status]}`);
    // keep keyboard focus on the moved card
    requestAnimationFrame(() => board.querySelector(`[data-id="${task._id}"]`)?.focus());
  },
  onEdit: (task) => openDialog(task),
  onTag: (tag) => setFilter("tag", tag),
  onDelete: (task) => deleteWithUndo(task),
};

function deleteWithUndo(task) {
  const timer = setTimeout(async () => {
    state.pendingDeletes.delete(task._id);
    try {
      await api.remove(task._id);
    } catch (err) {
      toast(err.message, { kind: "error" });
    }
    loadTasks();
  }, UNDO_MS);
  state.pendingDeletes.set(task._id, timer);
  render();
  toast(`Deleted “${task.title}”`, {
    action: "Undo",
    duration: UNDO_MS,
    onAction: () => {
      clearTimeout(state.pendingDeletes.get(task._id));
      state.pendingDeletes.delete(task._id);
      render();
    },
  });
}

// If the tab closes during the undo window, still send the deletes.
window.addEventListener("pagehide", () => {
  for (const [id, timer] of state.pendingDeletes) {
    clearTimeout(timer);
    api.removeOnUnload(id);
  }
});

// Quick-add understands "#tag" and "!high / !med / !low" inside the title.
function parseQuickAdd(text) {
  const tags = [];
  let priority = null;
  const title = text
    .replace(/(^|\s)#([\w-]+)/g, (_, sp, tag) => (tags.push(tag), sp))
    .replace(/(^|\s)!(high|medium|med|low)\b/gi, (_, sp, p) => {
      p = p.toLowerCase();
      priority = p === "med" ? "medium" : p;
      return sp;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || text.trim(), tags, priority };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const parsed = parseQuickAdd(input.value);
  if (!parsed.title) return;
  const body = {
    title: parsed.title,
    priority: parsed.priority || $("new-priority").value,
    tags: parsed.tags,
    dueDate: $("new-due").value || null,
  };
  const btn = $("add-btn");
  btn.disabled = true;
  try {
    await api.create(body);
    input.value = "";
    $("new-due").value = "";
    $("new-priority").value = "medium";
    await loadTasks();
  } catch (err) {
    toast(err.message, { kind: "error" });
  } finally {
    btn.disabled = false;
    input.focus();
  }
});

// ---------- drag & drop between columns ----------

for (const column of board.querySelectorAll(".column")) {
  column.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    column.classList.add("drop-target");
  });
  column.addEventListener("dragleave", (e) => {
    if (!column.contains(e.relatedTarget)) column.classList.remove("drop-target");
  });
  column.addEventListener("drop", (e) => {
    e.preventDefault();
    column.classList.remove("drop-target");
    const task = state.tasks.find((t) => t._id === e.dataTransfer.getData("text/plain"));
    if (task && task.status !== column.dataset.status) handlers.onMove(task, column.dataset.status);
  });
}

// ---------- edit dialog ----------

function renderSubtasks() {
  const list = $("subtask-list");
  list.replaceChildren(
    ...state.editSubtasks.map((s, i) =>
      el(
        "li",
        { className: s.done ? "done" : "" },
        el("label", {}, el("input", { type: "checkbox", checked: s.done, onchange: (e) => ((s.done = e.target.checked), renderSubtasks()) }), el("span", {}, s.title)),
        el("button", { type: "button", className: "icon-btn", "aria-label": "Remove item", textContent: "×", onclick: () => (state.editSubtasks.splice(i, 1), renderSubtasks()) })
      )
    )
  );
  const done = state.editSubtasks.filter((s) => s.done).length;
  $("subtask-progress").textContent = state.editSubtasks.length ? `${done}/${state.editSubtasks.length} done` : "";
}

function addSubtask() {
  const box = $("subtask-input");
  const title = box.value.trim();
  if (!title) return;
  state.editSubtasks.push({ title, done: false });
  box.value = "";
  renderSubtasks();
}

function openDialog(task) {
  state.editing = task;
  state.editSubtasks = (task.subtasks || []).map((s) => ({ ...s }));
  const f = editForm.elements;
  f.title.value = task.title;
  f.description.value = task.description || "";
  f.status.value = task.status;
  f.priority.value = task.priority;
  f.dueDate.value = task.dueDate || "";
  f.tags.value = (task.tags || []).join(", ");
  $("edit-error").textContent = "";
  const created = new Date(task.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  $("dialog-meta").textContent = `Created ${created}`;
  renderSubtasks();
  dialog.showModal();
}

$("subtask-add-btn").addEventListener("click", addSubtask);
$("subtask-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addSubtask();
  }
});
for (const b of dialog.querySelectorAll("[data-close]")) b.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // click on backdrop
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = editForm.elements;
  const changes = {
    title: f.title.value,
    description: f.description.value,
    status: f.status.value,
    priority: f.priority.value,
    dueDate: f.dueDate.value || null,
    tags: f.tags.value.split(",").map((t) => t.trim()).filter(Boolean),
    subtasks: state.editSubtasks,
  };
  $("save-btn").disabled = true;
  try {
    await api.update(state.editing._id, changes);
    dialog.close();
    toast("Task saved");
    loadTasks();
  } catch (err) {
    $("edit-error").textContent = err.message;
  } finally {
    $("save-btn").disabled = false;
  }
});

// ---------- toolbar ----------

let searchTimer;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter("q", e.target.value.trim()), 250);
});
$("priority-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setFilter("priority", b.dataset.value);
});
$("tag-filter").addEventListener("change", (e) => setFilter("tag", e.target.value));
$("sort").addEventListener("change", (e) => setFilter("sort", e.target.value));

$("clear-done").addEventListener("click", async () => {
  if (!confirm("Delete all completed tasks? This cannot be undone.")) return;
  try {
    const { deleted } = await api.clearDone();
    toast(`Cleared ${deleted} completed task${deleted === 1 ? "" : "s"}`);
    loadTasks();
  } catch (err) {
    toast(err.message, { kind: "error" });
  }
});

// ---------- theme ----------

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(storage.get("theme", null));
$("theme-toggle").addEventListener("click", () => {
  const current =
    document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  storage.set("theme", next);
});

// ---------- keyboard shortcuts ----------

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (typing || dialog.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "n") {
    e.preventDefault();
    input.focus();
  } else if (e.key === "/") {
    e.preventDefault();
    $("search").focus();
  }
});

// Refresh when coming back to the tab (another user / instance may have changed data)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !dialog.open) loadTasks();
});

syncFilterControls();
loadInfo();
loadTasks();
