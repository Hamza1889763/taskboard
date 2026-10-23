#!/bin/bash
# EC2 Launch Template "User data" script (Amazon Linux 2023).
# Every instance the Auto Scaling Group launches runs this on first boot:
# installs Docker + Compose, pulls the code, and starts the containers.
#
# >>> CHANGE THIS to your own public GitHub repo URL <<<
REPO_URL="https://github.com/Hamza1889763/taskboard.git"

set -euxo pipefail
exec > /var/log/user-data.log 2>&1     # log everything for debugging

# 1. Install Docker and Git
dnf update -y
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

# 2. Install Docker Compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 3. Read this instance's ID and AZ from the metadata service (IMDSv2)
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
AZ=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone)

# 4. Get the code
git clone "$REPO_URL" /opt/taskboard
cd /opt/taskboard
printf "INSTANCE_ID=%s\nAZ=%s\n" "$INSTANCE_ID" "$AZ" > .env
chown -R ec2-user:ec2-user /opt/taskboard

# 5. Build the custom image, then start the stack
docker build -t taskboard-web:1.0 ./app
docker compose up -d

echo "TaskBoard started on $INSTANCE_ID ($AZ)"
