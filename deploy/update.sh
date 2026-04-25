#!/usr/bin/env bash
# Pull latest code and restart. Run as root from anywhere.
set -euo pipefail

cd /opt/chrono/app
sudo -u chrono git pull
sudo -u chrono npm install --omit=dev
systemctl restart chrono
echo "==> chrono restarted. Tail logs with: journalctl -u chrono -f"
