const list = document.getElementById("task-list");
const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const emptyMsg = document.getElementById("empty-msg");

async function loadInfo() {
  try {
    const info = await (await fetch("/api/info")).json();
    document.getElementById("instance-id").textContent = "Served by: " + info.instance;
    document.getElementById("az").textContent = "AZ: " + info.az;
  } catch { /* ignore */ }
  const db = document.getElementById("db-status");
  try {
    const res = await fetch("/health");
    db.textContent = res.ok ? "DB: connected" : "DB: down";
    db.className = "badge " + (res.ok ? "ok" : "bad");
  } catch {
    db.textContent = "DB: unreachable";
    db.className = "badge bad";
  }
}

function render(tasks) {
  list.innerHTML = "";
  emptyMsg.style.display = tasks.length ? "none" : "block";
  for (const t of tasks) {
    const li = document.createElement("li");
    li.className = "task-item" + (t.done ? " done" : "");
    li.dataset.id = t._id;

    const span = document.createElement("span");
    span.className = "task-title";
    span.textContent = t.title;
    span.title = "Click to toggle done";
    span.onclick = () => toggle(t._id);

    const small = document.createElement("small");
    small.textContent = t.createdOn ? "via " + t.createdOn : "";

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "Delete";
    del.onclick = () => remove(t._id);

    li.append(span, small, del);
    list.appendChild(li);
  }
}

async function loadTasks() {
  const res = await fetch("/api/tasks");
  if (res.ok) render(await res.json());
}

async function toggle(id) { await fetch("/api/tasks/" + id, { method: "PATCH" }); loadTasks(); }
async function remove(id) { await fetch("/api/tasks/" + id, { method: "DELETE" }); loadTasks(); }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  input.value = "";
  loadTasks();
});

loadInfo();
loadTasks();
