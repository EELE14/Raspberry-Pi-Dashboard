#!/usr/bin/env bash
# ==============================================================================
# PI Server Dashboard — Installer
# ==============================================================================
# Two ways to run this:
#
#   A) Already cloned the repo:
#        cd pi-backend
#        sudo bash install.sh
#
#   B) Fresh install — public repo:
#        curl -sSLO https://raw.githubusercontent.com/EELE14/Raspberry-Pi-Dashboard/main/install.sh
#        sudo bash install.sh
#
#   C) Fresh install — private repo (GitHub access token required):
#        curl -H "Authorization: token YOUR_TOKEN" -sSLO \
#          https://raw.githubusercontent.com/EELE14/Raspberry-Pi-Dashboard/main/install.sh
#        sudo bash install.sh

# Make sure to install only the "Server" folder!! 
#
#   If you accidentally downloaded a 404 page instead of this script, re-run
#   the curl command with a valid token (option C above) and try again.
#
# What this script does:
#   1. Checks prerequisites (Python 3.8+, git)
#   2. Clones the repository if not already present
#   3. Asks a few questions (frontend domain, username, port)
#   4. Generates a secure API token
#   5. Creates Server/.env
#   6. Creates a Python virtual environment + installs dependencies
#   7. Writes sudoers rules for systemd bot management
#   8. Creates and enables the dashboard.service systemd unit
#   9. Prints the generated token — save it, it is shown only once
# ==============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()     { echo -e "${GREEN}✓${NC}  $*"; }
info()   { echo -e "${BLUE}→${NC}  $*"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $*"; }
die()    { echo -e "\n${RED}✗  $*${NC}\n" >&2; exit 1; }
section(){ echo -e "\n${BOLD}$*${NC}\n$(printf '─%.0s' {1..60})"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      PI Server Dashboard — Installer         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── OS check ─────────────────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Linux" ]]; then
  die "This installer is intended for Raspberry Pi OS (Linux). Detected: $(uname -s)."
fi

# ── Prerequisite checks ───────────────────────────────────────────────────────
section "Checking prerequisites"

command -v python3 >/dev/null 2>&1 || die "python3 is not installed. Run: sudo apt install python3 python3-venv"
command -v git     >/dev/null 2>&1 || die "git is not installed. Run: sudo apt install git"

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [[ "$PYTHON_MAJOR" -lt 3 ]] || { [[ "$PYTHON_MAJOR" -eq 3 ]] && [[ "$PYTHON_MINOR" -lt 8 ]]; }; then
  die "Python 3.8+ is required. Found: $PYTHON_VERSION"
fi
ok "Python $PYTHON_VERSION"
ok "git $(git --version | awk '{print $3}')"

# ── Locate or clone the repository ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
SERVER_DIR="$REPO_ROOT"

if [[ ! -f "$SERVER_DIR/requirements.txt" ]]; then
  section "Repository Setup"

  echo "requirements.txt not found — the repository needs to be cloned first."
  echo ""

  # Current user (for default install path)
  DEFAULT_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
  DEFAULT_USER_HOME=$(eval echo "~$DEFAULT_USER")
  DEFAULT_CLONE_DIR="$DEFAULT_USER_HOME/pi-server"

  DEFAULT_REPO_URL="https://github.com/EELE14/Raspberry-Pi-Dashboard"
  read -rp "  Repository URL  [${DEFAULT_REPO_URL}]: " REPO_URL
  REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"

  read -rp "  Install directory  [${DEFAULT_CLONE_DIR}]: " INPUT_CLONE_DIR
  CLONE_DIR="${INPUT_CLONE_DIR:-$DEFAULT_CLONE_DIR}"

  if [[ -d "$CLONE_DIR" ]]; then
    die "Directory already exists: $CLONE_DIR. Remove it first or choose a different path."
  fi

  # Helper: run git clone as the correct user (not root)
  _do_clone() {
    local url="$1" dir="$2"
    if [[ "$(id -u)" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
      sudo -u "$SUDO_USER" git clone "$url" "$dir" 2>&1
    else
      git clone "$url" "$dir" 2>&1
    fi
  }

  # First attempt — no token (works for public repos)
  info "Cloning repository into $CLONE_DIR …"
  if ! _do_clone "$REPO_URL" "$CLONE_DIR" >/dev/null 2>&1; then
    # Clone failed — could be a private repo or wrong URL.
    # Suppress the first error and offer a token retry.
    echo ""
    warn "Clone failed. This usually means the repository is private or the URL is wrong."
    echo ""
    echo "  Enter a GitHub personal access token to retry, or press Enter to abort."
    echo "  The token is only used for this clone and is never stored."
    read -rsp "  Access token: " CLONE_TOKEN
    echo ""

    if [[ -z "$CLONE_TOKEN" ]]; then
      die "Clone failed and no token provided. Check the URL and try again."
    fi

    if [[ "$REPO_URL" != https://* ]]; then
      die "Token authentication only works with HTTPS URLs (https://...)."
    fi

    AUTH_URL="${REPO_URL/https:\/\//https://x-access-token:${CLONE_TOKEN}@}"
    _do_clone "$AUTH_URL" "$CLONE_DIR" \
      || die "Clone failed even with the provided token. Check the URL and token."

    # Clear secrets immediately
    CLONE_TOKEN=""
    AUTH_URL=""
  fi

  ok "Repository cloned to $CLONE_DIR"

  SERVER_DIR="$CLONE_DIR"

  [[ -f "$SERVER_DIR/requirements.txt" ]] || die "Cloned repository is missing requirements.txt."

  # Move the installer into the cloned repo so relative paths work for the rest
  # of this script (SCRIPT_DIR is now outdated; we use SERVER_DIR directly).
fi

# ── Interactive configuration ─────────────────────────────────────────────────
section "Configuration"

echo "Answer the questions below. Press Enter to accept the default."
echo ""

# Current Linux user
DEFAULT_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
read -rp "  Linux username on this Pi  [${DEFAULT_USER}]: " INPUT_USER
INSTALL_USER="${INPUT_USER:-$DEFAULT_USER}"

id "$INSTALL_USER" >/dev/null 2>&1 || die "User '$INSTALL_USER' does not exist."
INSTALL_HOME=$(eval echo "~$INSTALL_USER")

# Frontend domain(s)
read -rp "  Frontend domain(s) — comma-separated (e.g. https://dash.example.com): " CORS_ORIGIN
CORS_ORIGIN="${CORS_ORIGIN:-}"
if [[ -z "$CORS_ORIGIN" ]]; then
  warn "No frontend domain entered. You can edit Server/.env later (CORS_ORIGINS)."
  CORS_ORIGIN="http://localhost:5173"
fi

# Port
read -rp "  Backend port  [8080]: " INPUT_PORT
BACKEND_PORT="${INPUT_PORT:-8080}"
if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || [[ "$BACKEND_PORT" -lt 1 ]] || [[ "$BACKEND_PORT" -gt 65535 ]]; then
  die "Invalid port: $BACKEND_PORT"
fi

# File manager root
DEFAULT_FM_ROOT="$INSTALL_HOME"
read -rp "  File manager root  [${DEFAULT_FM_ROOT}]: " INPUT_FM_ROOT
FM_ROOT="${INPUT_FM_ROOT:-$DEFAULT_FM_ROOT}"

# Service name
SERVICE_NAME="dashboard"

echo ""
ok "User:             $INSTALL_USER"
ok "Frontend origin:  $CORS_ORIGIN"
ok "Backend port:     $BACKEND_PORT"
ok "File manager:     $FM_ROOT"
ok "Service name:     ${SERVICE_NAME}.service"

# ── Token generation ──────────────────────────────────────────────────────────
section "Generating API token"

TOKEN_DATA=$(python3 - <<'PYEOF'
import secrets, hashlib
t = secrets.token_urlsafe(32)
h = hashlib.sha256(t.encode()).hexdigest()
print(t)
print(h)
PYEOF
)

API_TOKEN=$(echo "$TOKEN_DATA" | head -n1)
API_TOKEN_HASH=$(echo "$TOKEN_DATA" | tail -n1)
ok "Token generated (shown at the end of this script — save it!)"

# ── Write .env ────────────────────────────────────────────────────────────────
section "Creating Server/.env"

ENV_FILE="$SERVER_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  BACKUP="$ENV_FILE.bak.$(date +%s)"
  warn ".env already exists — backing up to $BACKUP"
  cp "$ENV_FILE" "$BACKUP"
fi

cat > "$ENV_FILE" << EOF
# Generated by install.sh on $(date -u '+%Y-%m-%d %H:%M UTC')
# !! Keep this file private (chmod 600) !!

# Authentication
API_TOKEN_HASH=${API_TOKEN_HASH}

# Bots (comma-separated systemd service names, without .service suffix)
BOTS=

# File manager root
FILE_MANAGER_ROOT=${FM_ROOT}

# Service management
SERVICE_DIR=/etc/systemd/system

# Server
PORT=${BACKEND_PORT}

# CORS — allowed frontend origins (comma-separated)
CORS_ORIGINS=${CORS_ORIGIN}
EOF

chmod 600 "$ENV_FILE"
ok "Server/.env written (chmod 600)"

# ── Python virtual environment ────────────────────────────────────────────────
section "Setting up Python environment"

VENV_DIR="$SERVER_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
  info "Creating virtual environment …"
  python3 -m venv "$VENV_DIR"
  ok "Virtual environment created"
else
  ok "Virtual environment already exists"
fi

info "Installing Python dependencies …"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r "$SERVER_DIR/requirements.txt"
ok "Dependencies installed"

# Fix ownership if running as root (e.g., via sudo)
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R "$INSTALL_USER:$INSTALL_USER" "$SERVER_DIR/.venv"
  chown -R "$INSTALL_USER:$INSTALL_USER" "$REPO_ROOT"
  chown "$INSTALL_USER:$INSTALL_USER" "$ENV_FILE"
fi

# ── Sudoers rules ─────────────────────────────────────────────────────────────
section "Configuring sudoers"

SUDOERS_FILE="/etc/sudoers.d/pi-dashboard"

if [[ "$(id -u)" -ne 0 ]]; then
  warn "Not running as root — skipping sudoers setup."
  warn "Run the following manually as root:"
  echo ""
  echo "  sudo tee /etc/sudoers.d/pi-dashboard > /dev/null << 'SUDOEOF'"
  echo "  # PI Server Dashboard — bot + service management"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/*.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/rm -f /etc/systemd/system/*.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl enable *.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl disable *.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start *.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl stop *.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart *.service"
  echo "  ${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl is-active *.service"
  echo "  SUDOEOF"
  echo ""
else
  cat > "$SUDOERS_FILE" << SUDOEOF
# PI Server Dashboard — bot + service management
${INSTALL_USER} ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/systemd/system/*.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/rm -f /etc/systemd/system/*.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl enable *.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl disable *.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start *.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl stop *.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart *.service
${INSTALL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl is-active *.service
SUDOEOF
  chmod 440 "$SUDOERS_FILE"
  if ! visudo -cf "$SUDOERS_FILE" >/dev/null 2>&1; then
    rm -f "$SUDOERS_FILE"
    die "Generated sudoers file failed validation. Removed. Check /etc/sudoers.d manually."
  fi
  ok "Sudoers rules written to $SUDOERS_FILE"
fi

# ── Systemd service ───────────────────────────────────────────────────────────
section "Creating systemd service"

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
UVICORN_BIN="$VENV_DIR/bin/uvicorn"

# Single worker required: ip_ban, update_lock, and terminal session counter
# are in-memory and not shared between processes.
SERVICE_CONTENT="[Unit]
Description=PI Server Dashboard API
After=network.target

[Service]
Type=simple
User=${INSTALL_USER}
WorkingDirectory=${SERVER_DIR}
Environment=\"PATH=${VENV_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"
ExecStartPre=/bin/chmod 600 ${ENV_FILE}
ExecStart=${UVICORN_BIN} app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} --workers 1 --timeout-graceful-shutdown 30
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target"

if [[ "$(id -u)" -ne 0 ]]; then
  warn "Not running as root — skipping systemd service setup."
  warn "Run the following manually as root:"
  echo ""
  echo "  sudo tee $UNIT_FILE << 'SVCEOF'"
  echo "$SERVICE_CONTENT"
  echo "SVCEOF"
  echo "  sudo systemctl daemon-reload"
  echo "  sudo systemctl enable ${SERVICE_NAME}"
  echo "  sudo systemctl start ${SERVICE_NAME}"
  echo ""
else
  echo "$SERVICE_CONTENT" > "$UNIT_FILE"
  chmod 644 "$UNIT_FILE"

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
  systemctl restart "$SERVICE_NAME"

  sleep 2
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Service ${SERVICE_NAME}.service is running"
  else
    warn "Service may have failed to start. Check logs:"
    warn "  sudo journalctl -u ${SERVICE_NAME} -n 30"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                    Installation complete!                    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Your API token (save this — it is shown only once):${NC}"
echo ""
echo -e "  ${YELLOW}${API_TOKEN}${NC}"
echo ""
echo "Use this token to log in to the dashboard."
echo "The corresponding hash is already saved in Server/.env."
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Copy the token above and paste it into the frontend login page."
echo "  2. Check service status:  sudo systemctl status ${SERVICE_NAME}"
echo "  3. View logs:             sudo journalctl -u ${SERVICE_NAME} -f"
echo "  4. API health check:      curl http://localhost:${BACKEND_PORT}/api/health"
if [[ -n "$CORS_ORIGIN" ]] && [[ "$CORS_ORIGIN" != "http://localhost:5173" ]]; then
  echo "  5. Frontend:              ${CORS_ORIGIN}"
fi
echo ""
