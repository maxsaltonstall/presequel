#!/usr/bin/env bash
# One-shot provisioning script for a fresh Ubuntu 24.04 Lightsail instance.
# Run as root (or via `sudo -i`). Expects /opt/chrono/app to exist and
# contain the repo checkout before running this script.

set -euo pipefail

echo "==> Install base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "==> Install Node 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Install Caddy"
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

echo "==> Install Datadog Agent"
if [ -z "${DD_API_KEY:-}" ]; then
  echo "DD_API_KEY must be exported before running (e.g. export DD_API_KEY=...)"
  exit 1
fi
DD_SITE="${DD_SITE:-datadoghq.com}"
bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

echo "==> Create chrono user"
id -u chrono >/dev/null 2>&1 || useradd --system --home /opt/chrono --shell /usr/sbin/nologin chrono
mkdir -p /opt/chrono /var/log/caddy
chown -R chrono:chrono /opt/chrono

echo "==> Install app dependencies"
cd /opt/chrono/app
sudo -u chrono npm install --omit=dev

echo "==> Configure Caddy"
cp /opt/chrono/app/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy

echo "==> Configure systemd for the Node app"
cp /opt/chrono/app/chrono.service /etc/systemd/system/chrono.service
systemctl daemon-reload
systemctl enable chrono
systemctl start chrono

echo "==> Configure Datadog log forwarding"
mkdir -p /etc/datadog-agent/conf.d/chrono.d
cp /opt/chrono/app/deploy/datadog-agent.yaml /etc/datadog-agent/conf.d/chrono.d/conf.yaml

# Ensure logs_enabled is true in the agent config
if ! grep -q "^logs_enabled:" /etc/datadog-agent/datadog.yaml; then
  echo "logs_enabled: true" >> /etc/datadog-agent/datadog.yaml
else
  sed -i 's/^logs_enabled: false/logs_enabled: true/' /etc/datadog-agent/datadog.yaml
fi
systemctl restart datadog-agent

echo "==> Provisioning done"
systemctl status chrono --no-pager || true
systemctl status caddy --no-pager || true
