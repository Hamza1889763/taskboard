#!/bin/bash
# Task 1 evidence - shows the Load Balancer spreading requests across instances.
# Run from your laptop or any machine:
#   bash scripts/lb-check.sh http://YOUR-ALB-DNS-NAME
ALB_URL="${1:?Usage: $0 http://your-alb-dns-name}"

for i in $(seq 1 10); do
  printf "Request %2d -> " "$i"
  curl -s "$ALB_URL/api/info"
  echo
  sleep 0.5
done
