# TaskBoard – CSC418 DevOps Lab Mid

A 3-tier Kanban task board (HTML/JS front-end → Node.js/Express back-end → MongoDB) deployed with Docker and Docker Compose on AWS EC2 instances behind an Application Load Balancer, managed by an Auto Scaling Group, and tested with Selenium.

```
User/Browser ──► AWS Application Load Balancer (port 80)
                        │
          ┌─────────────┴─────────────┐
   EC2 #1 (AZ-a)                 EC2 #2 (AZ-b)        ◄── Auto Scaling Group (min 2)
   docker compose                docker compose
   ├─ web  (Node, :80→3000)      ├─ web
   └─ mongo (volume: data)       └─ mongo (volume: data)

Selenium WebDriver ──► ALB URL  (automated browser test)
```

## Features

- **Kanban board** with To do / In progress / Done columns – drag & drop cards, or use the arrow buttons / keyboard (← → on a focused card)
- **Rich tasks**: description, priority (low/medium/high), due date, tags, checklist (subtasks)
- **Quick add** syntax: `Fix login #api !high` → tag `api`, priority high
- **Search, filter** (priority, tag) and **sort** (newest, oldest, due date, priority) – done on the server with MongoDB queries/aggregation
- **Dashboard**: totals, in progress, completed, overdue count and a completion bar (`/api/stats` aggregation)
- **Overdue / due today** highlighting, **undo delete**, **clear completed**
- **Dark / light theme**, responsive layout, keyboard shortcuts (`N` new task, `/` search)
- Infra badges for the DevOps demo: *Served by* (instance), *AZ*, *DB status*

## Project structure

```
taskboard/
├── .github/workflows/ci.yml   # CI: npm test + docker build on every push
├── app/
│   ├── Dockerfile             # custom web image (Task 3)
│   ├── .dockerignore
│   ├── package.json
│   ├── server.js              # entry point: config, start, graceful shutdown
│   ├── src/
│   │   ├── app.js             # Express setup, security headers, /health, /api/info
│   │   ├── db.js              # Mongo connection + retry, indexes, v1 data migration
│   │   ├── errors.js          # HttpError, async handler, central error handler
│   │   ├── validate.js        # input validation
│   │   └── routes/tasks.js    # /api/tasks CRUD + filters, /api/stats
│   ├── public/                # front-end (index.html, style.css, js/ ES modules)
│   ├── test/                  # node:test unit + API tests (in-memory MongoDB)
│   └── scripts/dev-memory.js  # run locally without Docker
├── docker-compose.yml         # web + mongo + named volume + network (Task 4, 5)
├── aws/user-data.sh           # EC2 Launch Template boot script (Task 1)
├── scripts/
│   ├── linux-admin.sh         # Task 2 demo
│   ├── volume-demo.sh         # Task 4 demo
│   └── lb-check.sh            # Task 1 load-balancer proof
└── selenium/
    ├── test_taskboard.py      # Task 6
    └── requirements.txt
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | 200 when app + DB are up (ALB / Docker health check) |
| GET | `/api/info` | which instance / AZ served the request |
| GET | `/api/tasks?status=&priority=&tag=&q=&sort=` | list tasks (filters optional; sort = newest, oldest, due, priority) |
| GET | `/api/tasks/:id` | one task |
| POST | `/api/tasks` | create – `{ title, description?, status?, priority?, dueDate?, tags?, subtasks? }` |
| PATCH | `/api/tasks/:id` | update given fields; an **empty body toggles done** (v1 behaviour) |
| DELETE | `/api/tasks/:id` | delete one task |
| DELETE | `/api/tasks?status=done` | clear all completed tasks |
| GET | `/api/stats` | counts by status / priority, overdue, completion %, tag cloud |

Invalid input returns `400 { "error": "..." }`. Old v1 tasks (`{ title, done }`) are migrated automatically on start-up.

## Develop & test locally (no Docker needed)

```bash
cd app
npm install
npm test               # 13 unit + API tests against an in-memory MongoDB
npm run dev:memory     # app on http://localhost:3000 with a throwaway DB
```
The first run downloads a MongoDB binary (~600 MB, cached afterwards). With a real MongoDB running use `npm run dev` instead.

---

## Step 0 – Make it yours (do this first!)

The exam gives zero marks for copied work, so personalise it:
1. Change the title/colours in `app/public/index.html` and `style.css` (e.g. put your name or reg. no. in the footer).
2. Put your name/email in the `LABEL maintainer` line of the Dockerfile.
3. Make sure you can explain every line (see `VIVA-NOTES.md`).

## Step 1 – Push to GitHub

```bash
cd taskboard
git init
git add .
git commit -m "TaskBoard: Dockerized Node + MongoDB app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/taskboard.git
git push -u origin main
```
Keep the repo **public** (simplest, so EC2 can clone it), then edit `REPO_URL` in `aws/user-data.sh`, commit and push again.

## Step 2 – (Optional) Test locally

Needs Docker Desktop.
```bash
docker compose up -d --build
docker compose ps          # both containers should be "healthy"
```
Open http://localhost → add a task.

---

## Step 3 – AWS setup (Task 1)

Use one region for everything (e.g. `us-east-1`; AWS Academy Learner Lab is fixed to us-east-1). Use the **default VPC** – it already has public subnets in several Availability Zones.

### 3.1 Security groups (EC2 → Security Groups → Create)

| Name | Inbound rules |
|---|---|
| `alb-sg` | HTTP 80 from `0.0.0.0/0` |
| `web-sg` | HTTP 80 from **source = `alb-sg`**; SSH 22 from **My IP** |

Instances only accept web traffic coming through the load balancer – mention this in the viva, it's "professional practice".

### 3.2 Launch Template (EC2 → Launch Templates → Create)
- Name: `taskboard-lt`
- AMI: **Amazon Linux 2023**
- Instance type: `t2.micro` / `t3.micro` (free tier)
- Key pair: create/select one (for SSH)
- Security group: `web-sg`
- Advanced details → **Auto-assign public IP: Enable** (needed to download Docker)
- Advanced details → **User data**: paste the whole of `aws/user-data.sh` (with your REPO_URL)

### 3.3 Target Group (EC2 → Target Groups → Create)
- Type: Instances, protocol HTTP, port 80, name `taskboard-tg`
- Health check path: **`/health`** (returns 200 only when the app AND the DB are up)
- Don't register targets manually – the ASG will do it.

### 3.4 Application Load Balancer (EC2 → Load Balancers → Create → ALB)
- Name `taskboard-alb`, Internet-facing, IPv4
- Select at least **two Availability Zones / subnets**
- Security group: `alb-sg`
- Listener HTTP:80 → forward to `taskboard-tg`

### 3.5 Auto Scaling Group (EC2 → Auto Scaling Groups → Create)
- Name `taskboard-asg`, launch template `taskboard-lt`
- Same VPC, choose the **same two+ subnets** as the ALB
- Load balancing: **Attach to existing load balancer** → `taskboard-tg`
- Turn on **ELB health checks** (grace period 300 s)
- Group size: **Desired 2, Min 2, Max 4**
- Scaling policy: **Target tracking – Average CPU utilisation 50 %**

Wait ~5 minutes. Target Groups → `taskboard-tg` → Targets should show **2 healthy**.

### 3.6 Demonstrate it (evidence)
1. Open the ALB **DNS name** in a browser. Refresh several times – the "Served by" badge changes between the two instance IDs.
2. Run `bash scripts/lb-check.sh http://<ALB-DNS>` – output alternates instances.
3. **Auto Scaling self-healing**: terminate one instance in the EC2 console. Within a few minutes the ASG launches a replacement (screenshot ASG → Activity tab).
4. **Scale-out (optional, impressive)**: SSH into an instance and run
   `sudo dnf install -y stress-ng && stress-ng --cpu 2 --timeout 600`
   → CPU passes 50 % → ASG Activity shows a new instance launching.

> Note: each instance has its own Mongo container (as in the exam diagram), so tasks you add on instance 1 are not visible on instance 2. In production you would use one shared database (e.g. Amazon DocumentDB / MongoDB Atlas). Say this in the viva before they ask.

---

## Step 4 – SSH in and run the demos (Tasks 2–5)

```bash
ssh -i your-key.pem ec2-user@<instance-public-ip>
sudo cat /var/log/user-data.log | tail     # boot script finished?
cd /opt/taskboard
```

### Task 2 – Linux administration
```bash
bash scripts/linux-admin.sh
```

### Task 3 – Docker install, Dockerfile, custom image, run a container
```bash
docker --version
docker compose version
cat app/Dockerfile
docker build -t taskboard-web:2.0 ./app          # build custom image
docker images | grep taskboard
# run ONE container on its own (without compose) to show docker run:
docker run -d --name web-solo -p 8080:3000 taskboard-web:2.0
docker ps
docker logs web-solo        # shows "listening"; DB retries are expected (no DB attached)
curl -s localhost:8080/api/info
docker stop web-solo && docker rm web-solo
```

### Task 4 – Named volume + persistence
```bash
bash scripts/volume-demo.sh
docker volume inspect taskboard-mongo-data
```

### Task 5 – Docker Compose (2 containers)
```bash
cat docker-compose.yml
docker compose ps                     # web + mongo, both healthy
docker compose logs --tail=20 web
docker network inspect taskboard-net | grep -A3 Name
docker compose exec web wget -qO- http://localhost:3000/health   # web talks to mongo by name
```
Useful: `docker compose down` (stop, keep data) · `docker compose down -v` (also delete volume) · `docker compose up -d --build` (rebuild after code change).

---

## Step 5 – Selenium test (Task 6)

On your laptop (Chrome installed, Python 3):
```bash
cd selenium
pip install -r requirements.txt
python test_taskboard.py http://<ALB-DNS-name>
```
Expected output:
```
test_1_page_title ... ok
test_2_heading_element ... ok
test_3_served_by_instance ... ok
test_4_database_connected ... ok
test_5_add_task_end_to_end ... ok
test_6_quick_add_tags_and_priority ... ok
test_7_mark_done_moves_to_done_column ... ok
test_8_search_filters_board ... ok
Ran 8 tests in ...s
OK
```
Screenshots are saved to `selenium/screenshots/` (`task_added.png`, `task_done.png`).

---

## Evidence checklist (screenshots to take)

| # | Screenshot | Marks |
|---|---|---|
| 1 | Target group with 2 healthy targets; app via ALB DNS showing two different "Served by" IDs; `lb-check.sh` output; ASG Activity tab showing a replacement after termination | 2 |
| 2 | `linux-admin.sh` output (mkdir, chmod, `ls -l` before/after) | 1 |
| 3 | `docker --version`, `docker build`, `docker images`, `docker run` + `docker ps` | 2 |
| 4 | `volume-demo.sh` output – task still present after `compose down`/`up` | 1 |
| 5 | `docker-compose.yml`, `docker compose ps` with 2 healthy containers | 2 |
| 6 | Selenium terminal output "OK" + browser screenshot | 2 |

## Cleanup (avoid AWS charges)
Delete in this order: Auto Scaling Group → Load Balancer → Target Group → Launch Template → Security Groups.
