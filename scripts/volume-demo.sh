#!/bin/bash
# Task 4 - Docker named volume + data persistence demo
# Run:  bash scripts/volume-demo.sh
set -e
run() { echo; echo "\$ $*"; eval "$@"; }

echo "===== Part A: plain named volume ====="
run docker volume create lab-data
run docker volume ls
run docker volume inspect lab-data

# Container #1 writes a file into the volume, then is deleted
run "docker run --name writer -v lab-data:/data alpine sh -c \"echo 'Saved at \$(date)' > /data/proof.txt && cat /data/proof.txt\""
run docker rm writer
echo "# writer container is gone:"
run "docker ps -a --filter name=writer"

# Container #2 (brand new) reads the same file -> data persisted
run "docker run --rm --name reader -v lab-data:/data alpine cat /data/proof.txt"

echo; echo "===== Part B: MongoDB data survives container recreation ====="
echo "Make sure the stack is running:  docker compose up -d"
run "curl -s -X POST -H 'Content-Type: application/json' -d '{\"title\":\"Persistence test task\"}' http://localhost/api/tasks"
run "curl -s http://localhost/api/tasks"

# Destroy and recreate the containers (NOT the volume)
run docker compose down
run "docker ps -a | grep taskboard || echo 'no taskboard containers'"
run docker volume ls
run docker compose up -d
echo "# waiting for app to become healthy..."
for i in $(seq 1 30); do curl -sf http://localhost/health >/dev/null && break; sleep 2; done
run "curl -s http://localhost/api/tasks"
echo
echo "The task is still there -> data lives in volume 'taskboard-mongo-data', not in the container."
