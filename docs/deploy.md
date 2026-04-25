# Chrono Consulting — Deploy Runbook

Public URL: `https://sequel.maxsaltonstall.com`

This runbook covers the one-time deploy to AWS Lightsail and ongoing updates.

## Prerequisites

- AWS account with Lightsail enabled.
- A Datadog account. Grab an API key from [Organization Settings → API Keys](https://app.datadoghq.com/organization-settings/api-keys). Keep it somewhere safe.
- DNS control for `maxsaltonstall.com`.
- This repo pushed to a GitHub repo you own (e.g. `maxsaltonstall/sqllearning`).

---

## Step 1 — Create the Lightsail instance

1. [Lightsail console](https://lightsail.aws.amazon.com/) → Create instance.
2. Region: pick closest to you (e.g. `us-east-1a`).
3. Platform: **Linux/Unix**. Blueprint: **OS Only → Ubuntu 24.04 LTS**.
4. Plan: **$5 USD / month** (1 GB RAM, 2 vCPU, 40 GB SSD) — plenty for this workload.
5. Name: `chrono-consulting`.
6. Create.

After the instance is running:
- **Networking → Attach static IP** → name it `chrono-ip`, attach.
- **Networking → IPv4 firewall** → add HTTPS (TCP 443) and HTTP (TCP 80) to the allow list (SSH/22 should already be there).

Copy down the static IP — you'll need it for DNS.

---

## Step 2 — SSH in and clone the repo

```bash
ssh -i <your-lightsail-key.pem> ubuntu@<static-ip>
```

```bash
sudo mkdir -p /opt/chrono
sudo chown ubuntu:ubuntu /opt/chrono
cd /opt/chrono
git clone https://github.com/maxsaltonstall/sqllearning.git app
cd app
```

---

## Step 3 — Create the .env file

```bash
cp .env.example .env
nano .env
```

Fill in your real `DD_API_KEY`. The other defaults are fine. Save.

Restrict permissions:
```bash
chmod 600 .env
```

---

## Step 4 — Run the provisioning script

```bash
cd /opt/chrono/app
export DD_API_KEY=$(grep DD_API_KEY .env | cut -d= -f2)
sudo -E bash deploy/provision.sh
```

This installs Node, Caddy, the Datadog Agent, creates the `chrono` user, wires up systemd, and starts everything. Takes 3–5 minutes.

When it completes:
```bash
systemctl status chrono
systemctl status caddy
systemctl status datadog-agent
```

All three should be `active (running)`.

Quick sanity check: `curl -I http://127.0.0.1:5173/health` should return `200`.

---

## Step 5 — DNS

Add this record at your DNS provider (where `maxsaltonstall.com` is hosted):

```
Type: A
Name: sequel
Value: <lightsail-static-ip>
TTL:  300 (5 minutes) — can go higher later
```

Wait 1–5 minutes. Test:
```bash
dig sequel.maxsaltonstall.com
```

Once the A record is visible globally, Caddy will automatically attempt to provision a Let's Encrypt certificate on the next request. Watch:
```bash
journalctl -u caddy -f
```

Give it 30–60 seconds after the first HTTPS request.

---

## Step 6 — Verify the live site

Open `https://sequel.maxsaltonstall.com` in a browser. You should see Chapter 1 load. Solve a puzzle. Check Datadog:

- **APM**: [app.datadoghq.com/apm/services](https://app.datadoghq.com/apm/services) — look for `chrono-consulting`.
- **Logs**: [app.datadoghq.com/logs](https://app.datadoghq.com/logs) — filter `service:chrono-consulting`.
- **Custom metrics**: search for `chrono.query.run`.

---

## Ongoing deploys

After pushing changes to GitHub:

```bash
ssh ubuntu@<static-ip>
sudo bash /opt/chrono/app/deploy/update.sh
```

That's it. Systemd restarts the Node process; Caddy keeps serving.

---

## Troubleshooting

- **502 Bad Gateway**: Node isn't running. `systemctl status chrono` → `journalctl -u chrono -n 100`.
- **Caddy TLS error**: DNS may not be propagated yet. Wait 5 minutes and try again. Check `journalctl -u caddy -n 100`.
- **No logs in Datadog**: verify `logs_enabled: true` in `/etc/datadog-agent/datadog.yaml` and `systemctl restart datadog-agent`.
- **Rate limited immediately**: someone's hitting /run fast. Log shows `query.rate_limited` events. Adjust capacity in `server/ratelimit.js`.

---

## Shutting down

Remove the instance + static IP via the Lightsail console. Delete the DNS record.
