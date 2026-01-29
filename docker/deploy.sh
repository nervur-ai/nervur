#!/usr/bin/env bash
# Nervur — install & update script
# Usage: curl -sSL https://nervur.com/install.sh | bash -s -- <matrix-domain>
# Fresh install: installs Docker, Caddy, configures firewall, deploys all containers
# Update: pulls new images, restarts containers, preserves all data
set -euo pipefail

DOMAIN="${1:?Usage: deploy.sh <matrix-domain>}"
SERVER_NAME="${2:-$DOMAIN}"
INSTALL_DIR="/opt/nervur"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"

# ── Detect install mode ──
if [ -f "${COMPOSE_FILE}" ]; then
  MODE="update"
  echo "==> Existing Nervur installation detected — updating..."
else
  MODE="install"
  echo "==> Fresh install — deploying Nervur on ${DOMAIN} (server_name: ${SERVER_NAME})"
fi

# ══════════════════════════════════════════════
# FRESH INSTALL ONLY
# ══════════════════════════════════════════════
if [ "$MODE" = "install" ]; then

  # ── Install Docker ──
  if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
  fi

  # ── Install Caddy ──
  if ! command -v caddy &>/dev/null; then
    echo "==> Installing Caddy..."
    apt-get update -qq && apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy
  fi

  # ── Firewall ──
  if command -v ufw &>/dev/null; then
    echo "==> Configuring firewall..."
    ufw allow 22/tcp
    ufw allow 443/tcp
    ufw allow 8448/tcp
    ufw --force enable
  fi

  # ── Add swap if < 2GB RAM ──
  TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$TOTAL_MEM" -lt 2048 ] && [ ! -f /swapfile ]; then
    echo "==> Adding 2GB swap..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  # ── Setup directory ──
  mkdir -p "${INSTALL_DIR}"

  # ── Companion mode env (so docker-compose interpolates SERVER_NAME) ──
  cat > "${INSTALL_DIR}/.env" <<ENV
SERVER_NAME=${SERVER_NAME}
ENV

  # ── Tuwunel config ──
  cat > "${INSTALL_DIR}/tuwunel.toml" <<TOML
[global]
server_name = "${SERVER_NAME}"
database_path = "/var/lib/tuwunel"
port = 8008
address = "0.0.0.0"
allow_registration = true
yes_i_am_very_very_sure_i_want_an_open_registration_server_prone_to_abuse = true
allow_federation = true
max_request_size = 52_428_800

[global.well_known]
client = "https://${DOMAIN}"
server = "${DOMAIN}:8448"
TOML

  # ── Caddy config ──
  cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    handle /_matrix/* {
        reverse_proxy localhost:8008
    }
    handle /.well-known/matrix/* {
        reverse_proxy localhost:8008
    }
    handle {
        reverse_proxy localhost:3000
    }
}

${DOMAIN}:8448 {
    reverse_proxy localhost:8008
}
CADDY

  systemctl restart caddy

fi
# ══════════════════════════════════════════════
# BOTH INSTALL AND UPDATE
# ══════════════════════════════════════════════

# ── Docker Compose (always written — adds Watchtower to old installs) ──
cat > "${COMPOSE_FILE}" <<'YAML'
services:
  homeserver:
    image: ghcr.io/matrix-construct/tuwunel:latest
    container_name: nervur-homeserver
    restart: unless-stopped
    ports:
      - "8008:8008"
    volumes:
      - homeserver-data:/var/lib/tuwunel
      - ./tuwunel.toml:/etc/tuwunel/tuwunel.toml:ro
    environment:
      - TUWUNEL_CONFIG=/etc/tuwunel/tuwunel.toml

  brain:
    image: ghcr.io/nervur-ai/nervur:latest
    container_name: nervur-brain
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - brain-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOMESERVER_URL=http://nervur-homeserver:8008
      - SERVER_NAME=${SERVER_NAME}
    depends_on:
      - homeserver

  watchtower:
    image: containrrr/watchtower
    container_name: nervur-watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_API_VERSION=1.44
    command: --interval 300 nervur-homeserver nervur-brain

volumes:
  homeserver-data:
  brain-data:
YAML

# ── Pull and start ──
cd "${INSTALL_DIR}"
echo "==> Pulling latest images..."
docker compose pull
echo "==> Starting containers..."
docker compose up -d

echo ""
if [ "$MODE" = "install" ]; then
  echo "==> Nervur deployed!"
  echo "    Matrix domain: https://${DOMAIN}"
  echo "    Federation:    ${DOMAIN}:8448"
  echo "    Admin UI:      http://localhost:3000 (SSH tunnel required)"
  echo ""
  echo "    To access the admin UI from your machine:"
  echo "    ssh -L 4444:localhost:3000 root@\$(curl -s ifconfig.me)"
  echo "    Then open http://localhost:4444 in your browser"
else
  echo "==> Nervur updated!"
  echo "    Changed containers have been recreated."
  echo "    All data has been preserved."
fi
echo ""
echo "    Watchtower is running — new images will be auto-deployed every 5 minutes."
echo ""
