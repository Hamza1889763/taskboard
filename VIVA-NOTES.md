# Viva Preparation – Section B (15 marks)

Short, confident answers. Where possible, point to *your own file* while answering – examiners love "let me show you where that is in my Compose file".

---

## 1. AWS EC2, Load Balancing & Auto Scaling (3 marks)

**What is EC2?** Elastic Compute Cloud – virtual servers (instances) you rent by the hour/second. You pick an AMI (OS image), instance type (CPU/RAM), storage, network and security group.

**What is an AMI?** Amazon Machine Image – a template of the OS + software used to launch instances. I used Amazon Linux 2023.

**Security group vs NACL?** Security group = stateful firewall on the instance (allow rules only). NACL = stateless firewall on the subnet (allow + deny). My `web-sg` only accepts port 80 *from the ALB's security group*, so nobody can bypass the load balancer.

**What does the Load Balancer do?** Distributes incoming requests across healthy instances in several Availability Zones → high availability and no single point of failure. I used an **Application Load Balancer** (layer 7, HTTP).

**ALB vs NLB vs CLB?** ALB = layer 7, HTTP/HTTPS, path/host routing. NLB = layer 4, TCP/UDP, very high performance, static IP. CLB = old generation.

**What is a Target Group?** The set of targets (my EC2 instances on port 80) the ALB forwards to. It runs **health checks** on `/health`; unhealthy targets stop receiving traffic.

**Why does /health check the database?** If Mongo is down the app can't work, so the instance should be marked unhealthy – it returns 503 then.

**What is Auto Scaling?** An Auto Scaling Group keeps the number of instances between *min* and *max* (mine: min 2, desired 2, max 4). It **replaces unhealthy instances** (self-healing) and **scales out/in** based on policies.

**What is a Launch Template?** The blueprint the ASG uses for new instances: AMI, type, key pair, security group, **user data**.

**What is user data?** A script that runs as root on the instance's first boot. Mine installs Docker + Compose, clones the repo, builds the image and runs `docker compose up -d` – so every new instance configures itself automatically.

**Scaling policy types?** Target tracking (keep avg CPU at 50 % – mine), step scaling, simple scaling, scheduled, predictive.

**Scale up vs scale out?** Up/vertical = bigger instance. Out/horizontal = more instances (what an ASG does).

**How did you prove it works?** "Served by" badge changes between instance IDs on refresh; `lb-check.sh` alternates; I terminated an instance and the ASG launched a replacement.

**Weakness of your design?** Each instance has its own database, so data isn't shared between instances. In production → one managed DB (DocumentDB/Atlas) or a DB on a separate server, plus HTTPS on the ALB.

---

## 2. Linux commands & file permissions (2 marks)

**Permission string `-rwxr-x---`:** first char = type (`-` file, `d` directory). Then 3 groups: **owner** rwx, **group** r-x, **others** ---.

**Numeric values:** r = 4, w = 2, x = 1. So `755` = rwx r-x r-x, `644` = rw- r-- r--, `600` = rw- --- ---, `750` = rwx r-x ---.

**Why `600` on secret.txt?** Only the owner may read it – used for private keys too (SSH refuses a `.pem` key that isn't 400/600).

**x on a directory?** Permission to *enter* (cd into) it; r = list it; w = create/delete files in it.

**chmod vs chown?** chmod changes permissions; chown changes owner/group (`chown user:group file`).

**Symbolic mode:** `chmod u+x file`, `chmod g-w file`, `chmod o-rwx file`, `chmod a+r file`.

**What is umask?** Default permissions mask for new files. `0022` → new files 644, new dirs 755.

**Other commands I used:** `pwd, ls -la, mkdir -p, touch, cat, echo >, >>, cd, cp, mv, rm, df -h, free -h, uptime, ps aux, ss -tulpn, find, grep, tail, stat, sudo`.

**`>` vs `>>`?** `>` overwrites, `>>` appends.

**Why sudo?** Runs a command as root. I added `ec2-user` to the `docker` group so Docker works without sudo.

---

## 3. Docker images, Dockerfile & containers (3 marks)

**Image vs container?** Image = read-only template (layers). Container = a running instance of an image with a writable layer on top. One image → many containers.

**Docker vs VM?** Containers share the host kernel → lightweight, start in seconds, MBs. VMs include a full guest OS → heavier, GBs.

**Walk through my Dockerfile:**
- `FROM node:20-alpine` – small official base image
- `WORKDIR /app` – working directory inside image
- `COPY package*.json ./` then `RUN npm install` **before** `COPY . .` – **layer caching**: dependencies are only reinstalled when package.json changes
- `USER node` – don't run as root (security)
- `EXPOSE 3000` – documents the port (doesn't publish it)
- `HEALTHCHECK` – Docker checks `/health` and marks the container healthy/unhealthy
- `CMD ["node","server.js"]` – default start command (exec form so signals reach Node)

**CMD vs ENTRYPOINT?** CMD = default command, easily overridden at `docker run`. ENTRYPOINT = fixed executable; CMD then becomes its arguments.

**COPY vs ADD?** COPY just copies. ADD can also extract tar files and download URLs – prefer COPY.

**RUN vs CMD?** RUN executes at *build* time (creates a layer). CMD at *container start*.

**What is .dockerignore?** Excludes files from the build context (node_modules, .git, .env) → smaller, faster, no secrets in the image.

**EXPOSE vs `-p`?** EXPOSE is documentation. `-p 80:3000` actually publishes host port 80 → container port 3000.

**Key commands:** `docker build -t name:tag .`, `docker images`, `docker run -d -p 8080:3000 --name x image`, `docker ps / ps -a`, `docker logs`, `docker exec -it x sh`, `docker stop / rm / rmi`, `docker inspect`.

**What is a registry?** Stores images – Docker Hub, Amazon ECR. `docker push / pull`.

---

## 4. Docker volumes & data persistence (2 marks)

**Why volumes?** A container's writable layer is deleted with the container. A volume stores data *outside* the container so it survives `docker rm` / recreation.

**Types:** **Named volume** (managed by Docker in `/var/lib/docker/volumes/` – mine: `taskboard-mongo-data`), **bind mount** (a host folder, e.g. `./data:/data`), **tmpfs** (in memory).

**Named volume vs bind mount?** Named: Docker manages location, portable, best for DB data. Bind: you choose host path, good for live code editing in development.

**Where is Mongo's data?** Container path `/data/db` mapped to the named volume.

**How did you prove persistence?** Added a task → `docker compose down` (containers deleted) → `docker compose up -d` → task still there. Also the alpine writer/reader demo.

**What deletes the volume?** `docker compose down -v` or `docker volume rm`. Plain `down` keeps it.

**Commands:** `docker volume create / ls / inspect / rm / prune`.

**Limitation:** a volume lives on *one* host – if the EC2 instance is terminated, its volume goes too. Hence a shared/managed DB or EBS/EFS in production.

---

## 5. Docker Compose & multi-container communication (3 marks)

**What is Compose?** A tool to define and run multi-container apps from one YAML file: services, networks, volumes – one command `docker compose up -d`.

**My services:** `web` (custom Node image, built from ./app) and `mongo` (official mongo:7 image).

**How does web find the DB?** Both are on the user-defined network `taskboard-net`. Docker's built-in **DNS resolves the service name**, so the app connects to `mongodb://mongo:27017`. No IP addresses needed.

**Why is Mongo not published with `ports:`?** It only needs to be reachable by `web` inside the network. Not exposing it to the internet = security.

**depends_on + condition: service_healthy?** Compose starts `web` only after Mongo's healthcheck passes. Plain `depends_on` only controls start *order*, not readiness – that's why I also added a retry loop in server.js.

**restart: unless-stopped?** Containers restart automatically after a crash or an EC2 reboot.

**environment / .env?** Config passed as environment variables (12-factor app). `INSTANCE_ID` comes from the `.env` file the user-data script writes.

**Commands:** `docker compose up -d --build`, `ps`, `logs -f web`, `exec web sh`, `down`, `down -v`, `config`, `up -d --scale web=2` (would need removing the fixed host port).

**Bridge vs host network?** Bridge = isolated private network with NAT (default/mine). Host = container uses host's network stack directly.

---

## 6. Selenium testing & test execution (2 marks)

**What is Selenium WebDriver?** A tool that automates a real browser through a driver (ChromeDriver) to test web apps like a user would.

**Architecture:** Test script (Python bindings) → WebDriver protocol → ChromeDriver → Chrome browser. Selenium 4's **Selenium Manager** downloads the right driver automatically.

**Locators:** `By.ID` (I used `app-title`, `task-input`, `add-btn`), `By.CSS_SELECTOR`, `By.XPATH`, `By.NAME`, `By.CLASS_NAME`, `By.TAG_NAME`, `By.LINK_TEXT`. ID is fastest and most stable.

**My tests:** title check, `<h1>` element text, instance badge, DB status, and an **end-to-end** test that types a task, clicks Add and asserts it appears – this proves browser → ALB → Node → MongoDB all work.

**Implicit vs explicit wait?** Implicit = global timeout for every find. Explicit = `WebDriverWait(...).until(condition)` for a specific condition – I used explicit waits because the page loads data with JavaScript (avoids flaky tests; never use `time.sleep`).

**Assertions?** `assertEqual`, `assertIn`, `assertTrue` from `unittest` – a failed assertion marks the test FAILED.

**Headless mode?** Browser runs without a window (`--headless=new`) – used in CI/servers.

**How would you add this to CI/CD?** Run the test in a pipeline (GitHub Actions/Jenkins) after deployment, headless; fail the pipeline if tests fail.

**Unit vs integration vs E2E?** Unit = one function. Integration = components together. **E2E/UI = whole system through the UI** – what Selenium does.

---

## Likely "tricky" questions

- *Why Docker if you have EC2?* Same environment everywhere (dev = prod), fast repeatable deploys, isolation, easy to scale with ASG + user data.
- *What happens if one EC2 dies?* ALB health check fails → traffic only goes to the healthy one → ASG launches a replacement automatically.
- *Difference between container health check and target group health check?* Docker's checks the container; the ALB's checks the instance from outside on `/health`. Both hit the same endpoint.
- *How do you update the app?* Push to GitHub → on each instance `git pull && docker compose up -d --build`; better: build image once, push to ECR, and do an ASG **instance refresh**.
- *What is DevOps?* Culture + practices joining development and operations: automation, CI/CD, infrastructure as code, monitoring, fast feedback.
