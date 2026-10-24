// DOM rendering helpers. No state lives here: main.js passes data in.

import { icons } from "./icons.js";

export const STATUS_ORDER = ["todo", "doing", "done"];
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Small helper: el("span", { className: "x" }, "text", childNode)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "html") node.innerHTML = v; // only ever used with our own icon strings
    else if (k.startsWith("aria-") || k === "role") node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) if (c != null && c !== false) node.append(c);
  return node;
}

function dueInfo(task) {
  if (!task.dueDate) return null;
  const today = todayISO();
  const date = new Date(task.dueDate + "T00:00:00");
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (task.status === "done") return { label, cls: "" };
  if (task.dueDate < today) return { label: "Overdue · " + label, cls: "overdue" };
  if (task.dueDate === today) return { label: "Due today", cls: "today" };
  return { label, cls: "" };
}

function iconButton(icon, label, onClick, extra = "") {
  return el("button", {
    type: "button",
    className: "icon-btn " + extra,
    html: icon,
    title: label,
    "aria-label": label,
    onclick: (e) => {
      e.stopPropagation();
      onClick();
    },
  });
}

export function renderCard(task, handlers) {
  const idx = STATUS_ORDER.indexOf(task.status);
  const due = dueInfo(task);
  const subtasks = task.subtasks || [];
  const subDone = subtasks.filter((s) => s.done).length;

  const meta = el(
    "div",
    { className: "card-meta" },
    el("span", { className: "chip prio prio-" + task.priority }, PRIORITY_LABEL[task.priority] || task.priority),
    due && el("span", { className: "chip due " + due.cls, html: icons.calendar }, due.label),
    subtasks.length > 0 &&
      el("span", { className: "chip" + (subDone === subtasks.length ? " complete" : ""), html: icons.list }, `${subDone}/${subtasks.length}`),
    task.description && el("span", { className: "chip icon-only", html: icons.note, title: "Has description" }),
    ...(task.tags || []).map((t) =>
      el("button", { type: "button", className: "tag", onclick: (e) => (e.stopPropagation(), handlers.onTag(t)) }, "#" + t)
    )
  );

  const li = el(
    "li",
    {
      className: `task-item card prio-${task.priority}` + (task.status === "done" ? " done" : "") + (due?.cls === "overdue" ? " is-overdue" : ""),
      draggable: true,
      tabIndex: 0,
      dataset: { id: task._id, status: task.status },
      "aria-label": task.title,
      ondragstart: (e) => {
        e.dataTransfer.setData("text/plain", task._id);
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => li.classList.add("dragging"));
      },
      ondragend: () => li.classList.remove("dragging"),
      onclick: () => handlers.onEdit(task),
      onkeydown: (e) => {
        if (e.target !== li) return;
        if (e.key === "Enter") handlers.onEdit(task);
        else if (e.key === "Delete") handlers.onDelete(task);
        else if (e.key === "ArrowRight" && idx < 2) handlers.onMove(task, STATUS_ORDER[idx + 1]);
        else if (e.key === "ArrowLeft" && idx > 0) handlers.onMove(task, STATUS_ORDER[idx - 1]);
      },
    },
    el(
      "div",
      { className: "card-top" },
      el("button", {
        type: "button",
        className: "check",
        html: icons.check,
        title: task.status === "done" ? "Mark as not done" : "Mark as done",
        "aria-label": task.status === "done" ? "Mark as not done" : "Mark as done",
        "aria-pressed": String(task.status === "done"),
        onclick: (e) => (e.stopPropagation(), handlers.onToggle(task)),
      }),
      el("span", { className: "task-title" }, task.title),
      el(
        "div",
        { className: "card-actions" },
        idx > 0 && iconButton(icons.left, "Move left", () => handlers.onMove(task, STATUS_ORDER[idx - 1])),
        idx < 2 && iconButton(icons.right, "Move right", () => handlers.onMove(task, STATUS_ORDER[idx + 1])),
        iconButton(icons.trash, "Delete", () => handlers.onDelete(task), "delete-btn danger")
      )
    ),
    meta,
    task.createdOn && el("small", { className: "origin", html: icons.server }, "via " + task.createdOn)
  );
  return li;
}

export function renderBoard(board, tasks, handlers, { filtered }) {
  for (const status of STATUS_ORDER) {
    const column = board.querySelector(`.column[data-status="${status}"]`);
    const list = column.querySelector(".cards");
    const items = tasks.filter((t) => t.status === status);
    column.querySelector(".count").textContent = items.length;
    list.replaceChildren(...items.map((t) => renderCard(t, handlers)));
    if (!items.length) {
      const msg = filtered ? "No matching tasks" : status === "done" ? "Finished tasks land here" : "Drop tasks here";
      list.append(el("li", { className: "column-empty" }, msg));
    }
  }
}

export function renderStats(stats) {
  document.getElementById("stat-total").textContent = stats.total;
  document.getElementById("stat-doing").textContent = stats.byStatus.doing;
  document.getElementById("stat-done").textContent = stats.byStatus.done;
  document.getElementById("stat-overdue").textContent = stats.overdue;
  document.getElementById("stat-pct").textContent = stats.completion + "%";
  document.getElementById("progress").setAttribute("aria-valuenow", stats.completion);
  document.getElementById("progress-bar").style.width = stats.completion + "%";
  document.querySelector(".stat-warn").classList.toggle("active", stats.overdue > 0);
}

export function renderTagOptions(select, tags, current) {
  select.replaceChildren(
    el("option", { value: "" }, "All tags"),
    ...tags.map(({ tag, count }) => el("option", { value: tag }, `#${tag} (${count})`))
  );
  if (current && !tags.some((t) => t.tag === current)) select.append(el("option", { value: current }, "#" + current));
  select.value = current || "";
}

export function toast(message, { action, onAction, duration = 4000, kind = "" } = {}) {
  const box = document.getElementById("toasts");
  const node = el("div", { className: "toast " + kind, role: "status" }, el("span", {}, message));
  let timer;
  const close = () => {
    clearTimeout(timer);
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 200);
  };
  if (action) {
    node.append(el("button", { type: "button", className: "toast-action", onclick: () => (onAction(), close()) }, action));
  }
  box.append(node);
  timer = setTimeout(close, duration);
  return close;
}
