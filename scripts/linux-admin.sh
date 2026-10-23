#!/bin/bash
# Task 2 - Linux Administration demo
# Run on the EC2 instance:  bash scripts/linux-admin.sh
# Each command is printed before it runs, so the output works as evidence.

set -e
run() { echo; echo "\$ $*"; eval "$@"; }

echo "===== 1. System information ====="
run whoami
run hostname
run uname -a
run cat /etc/os-release \| head -3
run uptime
run df -h /
run free -h

echo; echo "===== 2. Create directory structure ====="
run mkdir -p ~/devops-lab/{config,logs,scripts,backups}
run cd ~/devops-lab
run pwd
run ls -la

echo; echo "===== 3. Create files ====="
run "echo 'APP_ENV=production' > config/app.env"
run "echo 'secret-db-password' > config/secret.txt"
run "echo '#!/bin/bash' > scripts/backup.sh"
run "echo 'echo Backup done at \$(date)' >> scripts/backup.sh"
run "echo \"log started \$(date)\" > logs/app.log"

echo; echo "===== 4. File permissions ====="
echo "# Before changes:"
run ls -l config scripts logs

# Numeric (octal) mode:  r=4 w=2 x=1   ->  owner / group / others
run chmod 755 scripts/backup.sh     # rwxr-xr-x : owner full, others read+execute
run chmod 600 config/secret.txt     # rw------- : only owner can read/write
run chmod 644 config/app.env        # rw-r--r-- : owner writes, everyone reads
# Symbolic mode:
run chmod u+rw,g+r,o-rwx logs/app.log   # rw-r-----
run chmod 750 backups               # directory: owner full, group read+enter

echo "# After changes:"
run ls -l config scripts logs
run ls -ld backups
run stat -c "'%A %a %U:%G %n'" config/secret.txt

echo; echo "===== 5. Ownership ====="
run sudo chown \$USER:\$USER -R ~/devops-lab
run ls -l config

echo; echo "===== 6. Execute the script (needs x permission) ====="
run ./scripts/backup.sh

echo; echo "===== 7. Useful extras ====="
run umask
run "ps aux --sort=-%mem | head -5"
run "sudo ss -tulpn | grep -E ':80|:22' || true"
run "find ~/devops-lab -type f -perm 600"
run "grep -r production ~/devops-lab/config"
run "tail -n 1 logs/app.log"

echo; echo "Linux admin demo finished."
