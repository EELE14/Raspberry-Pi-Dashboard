# PI Server Dashboard — Setup Guide

A self-hosted Raspberry Pi management dashboard.
Remote control bots, monitor system stats, manage files, and access a live terminal — all from a web frontend.

---

## Requirements

| Requirement     | Version                              |
| --------------- | ------------------------------------ |
| Raspberry Pi OS | Bullseye or newer (32-bit or 64-bit) |
| Python          | 3.8+                                 |
| git             | any                                  |

```bash
sudo apt update && sudo apt install -y python3 python3-venv git
```

---

## Quick Install

Download and run the installer — it handles everything automatically.

**Public repo:**

```bash
curl -sSLO https://raw.githubusercontent.com/EELE14/Raspberry-Pi-Dashboard/main/install.sh
sudo bash install.sh
```

**Private repo** (requires a [GitHub personal access token](https://github.com/settings/tokens)):

```bash
curl -H "Authorization: token YOUR_TOKEN" -sSLO \
  https://raw.githubusercontent.com/EELE14/Raspberry-Pi-Dashboard/main/install.sh
sudo bash install.sh
```

> If you run `curl` without a token on a private repo, GitHub returns a 404 page instead of
> the script. The token is only needed for this initial download — the installer itself will
> ask for it again when cloning the repository.

The installer will ask:

| Question                      | Example                    |
| ----------------------------- | -------------------------- |
| Linux username                | `pi`                       |
| Frontend domain (CORS origin) | `https://dash.example.com` |
| Backend port                  | `8080`                     |
| File manager root             | `/home/pi`                 |

At the end, your **API token** is shown once — save it immediately.

---

## What the Installer Does

1. Clones this repository (if not already present)
2. Generates a secure API token + SHA-256 hash
3. Creates `Server/.env` with your configuration
4. Creates a Python virtual environment and installs dependencies
5. Writes sudoers rules so the `pi` user can manage systemd services
6. Creates and enables `/etc/systemd/system/dashboard.service`
7. Starts the backend

---

## Manual Install

If you prefer to set things up yourself:

### 1. Clone the repository

```bash
git clone https://github.com/EELE14/Raspberry-Pi-Dashboard ~/Raspberry-Pi-Dashboard
cd ~/Raspberry-Pi-Dashboard
```

### 2. Create the virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure the environment

```bash
cp .env.example .env
nano .env
```

Generate a token + hash:

```bash
python3 -c "
import secrets, hashlib
t = secrets.token_urlsafe(32)
h = hashlib.sha256(t.encode()).hexdigest()
print('Token (save this):', t)
print('Hash  (put in .env):', h)
"
```

Set `.env` permissions:

```bash
chmod 600 .env
```

### 4. Add sudoers rules

```bash
sudo visudo
```

Add at the end (replace `pi` with your username if different):

```
pi ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/*.service
pi ALL=(ALL) NOPASSWD: /bin/rm -f /etc/systemd/system/*.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
pi ALL=(ALL) NOPASSWD: /bin/systemctl enable *.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl disable *.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl start *.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl stop *.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart *.service
pi ALL=(ALL) NOPASSWD: /bin/systemctl is-active *.service
```

### 5. Create the systemd service

```bash
sudo tee /etc/systemd/system/dashboard.service > /dev/null << EOF
[Unit]
Description=PI Server Dashboard API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=$(pwd)
Environment="PATH=$(pwd)/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStartPre=/bin/chmod 600 $(pwd)/.env
ExecStart=$(pwd)/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 1 --timeout-graceful-shutdown 30
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dashboard

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

---

## Configuration Reference

All settings are in `Server/.env`. Copy from `.env.example` as a starting point.

| Variable            | Required | Default               | Description                                                           |
| ------------------- | -------- | --------------------- | --------------------------------------------------------------------- |
| `API_TOKEN_HASH`    | Yes      | —                     | SHA-256 hash of your API token                                        |
| `CORS_ORIGINS`      | Yes      | —                     | Frontend domain(s), comma-separated (e.g. `https://dash.example.com`) |
| `FILE_MANAGER_ROOT` | No       | `/home/pi`            | Root directory for the file manager                                   |
| `SERVICE_DIR`       | No       | `/etc/systemd/system` | Where bot `.service` files are stored                                 |
| `PORT`              | No       | `8080`                | Backend HTTP port                                                     |
| `BOTS`              | No       | _(empty)_             | Pre-existing bot names, comma-separated                               |
| `ENABLE_DOCS`       | No       | `false`               | Set `true` to enable `/docs` and `/redoc` (dev only)                  |

---

## Verify the Installation

```bash
# Service running?
sudo systemctl status dashboard

# Live logs
sudo journalctl -u dashboard -f

# API health check
curl http://localhost:8080/api/health
# → {"status":"ok"}
```

---

## Exposing the Backend (Cloudflare Tunnel)

The recommended way to expose the backend securely without opening ports:

1. Install `cloudflared` on the Pi
2. Create a tunnel pointing to `http://localhost:8080`
3. Set your frontend's API base URL to the tunnel domain

---

## Updating

The dashboard has a built-in **Pull & Restart** feature (Settings → Git Repository).
Configure your repository URL and optionally an access token, then click the button to pull the latest code and restart automatically.

To update manually:

```bash
cd ~/Raspberry-Pi-Dashboard
git pull
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart dashboard
```

---

## Troubleshooting

**Service won't start**

```bash
sudo journalctl -u dashboard -n 50
```

**401 Unauthorized**

- Check that `API_TOKEN_HASH` in `.env` matches your token's SHA-256 hash

**Bots not appearing**

- Bots must be registered in `.env` under `BOTS=` or created via the dashboard

**File manager shows wrong directory**

- Check `FILE_MANAGER_ROOT` in `.env`

**Port table empty**

- `psutil.net_connections()` requires root on macOS; works normally on the Pi
