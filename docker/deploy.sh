#!/usr/bin/env bash
# Nervur — fresh droplet deploy script
# Usage: curl -sSL https://raw.githubusercontent.com/nervur-ai/nervur/master/docker/deploy.sh | bash -s -- <matrix-domain>
# Example: bash deploy.sh matrix.nervur.com
set -euo pipefail

DOMAIN="${1:?Usage: deploy.sh <matrix-domain>}"
SERVER_NAME="${2:-$DOMAIN}"
INSTALL_DIR="/opt/nervur"

echo "==> Deploying Nervur on ${DOMAIN} (server_name: ${SERVER_NAME})"

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

# ── Setup directory ──
mkdir -p "${INSTALL_DIR}"

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

# ── Docker Compose ──
cat > "${INSTALL_DIR}/docker-compose.yml" <<'YAML'
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
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8008/_matrix/client/versions"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 10s

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
    depends_on:
      homeserver:
        condition: service_healthy

volumes:
  homeserver-data:
  brain-data:
YAML

# ── Caddy config ──
cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    reverse_proxy localhost:3000
    handle_path /_matrix/* {
        reverse_proxy localhost:8008
    }
}

${DOMAIN}:8448 {
    reverse_proxy localhost:8008
}
CADDY

systemctl restart caddy

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

# ── Pull and start ──
cd "${INSTALL_DIR}"
docker compose pull
docker compose up -d

echo ""
echo "==> Nervur deployed!"
echo "    Matrix domain: https://${DOMAIN}"
echo "    Federation:    ${DOMAIN}:8448"
echo "    Admin UI:      http://localhost:3000 (SSH tunnel: ssh -L 3000:localhost:3000 root@<ip>)"
echo ""
echo "    To access the admin UI from your machine:"
echo "    ssh -L 3000:localhost:3000 root@\$(curl -s ifconfig.me)"
echo "    Then open http://localhost:3000 in your browser"
