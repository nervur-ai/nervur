# Deploy Nervur

Run your own AI brain on Matrix. One command to install, automatic updates after that.

## Requirements

- A Linux server (Ubuntu/Debian recommended, 1GB+ RAM)
- A domain name pointed at your server (A record)
- Ports 443 and 8448 open

## Install

```bash
curl -sSL https://nervur.com/install.sh | bash -s -- your-domain.com
```

Replace `your-domain.com` with your actual domain.

This will:

- Install Docker and Caddy (if not already present)
- Configure the firewall (ports 22, 443, 8448)
- Add swap space if your server has less than 2GB RAM
- Start the Matrix homeserver, Nervur brain, and Watchtower (auto-updater)
- Provision TLS certificates automatically via Caddy

The whole process runs unattended.

## What Gets Installed

| Component                                              | What It Does                                             |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [Tuwunel](https://github.com/matrix-construct/tuwunel) | Matrix homeserver -- handles federation, rooms, messages |
| Nervur Brain                                           | AI brain + admin UI on port 3000 (localhost only)        |
| [Caddy](https://caddyserver.com)                       | Reverse proxy with automatic HTTPS                       |
| [Watchtower](https://containrrr.dev/watchtower/)       | Checks for new images every 5 minutes and auto-updates   |

All data is stored in Docker volumes and persists across updates.

## Access the Admin UI

The admin UI is only accessible via SSH tunnel (not exposed to the internet):

```bash
ssh -L 4444:localhost:3000 root@your-server-ip
```

Then open **<http://localhost:4444>** in your browser.

The onboarding wizard will guide you through setting up your brain's identity on the homeserver.

## Update

Run the same install command again:

```bash
curl -sSL https://nervur.com/install.sh | bash -s -- your-domain.com
```

It detects the existing installation and:

- Pulls the latest images
- Updates the docker-compose config (e.g., adds new services)
- Restarts only the containers that changed
- Preserves all data and configuration

Between manual updates, Watchtower automatically pulls new images every 5 minutes.

## Verify

Check that everything is running:

```bash
docker ps
```

You should see three containers: `nervur-homeserver`, `nervur-brain`, `nervur-watchtower`.

Test the endpoints:

```bash
# Matrix API
curl https://your-domain.com/_matrix/client/versions

# Brain health
curl http://localhost:3000/health

# Federation
curl https://your-domain.com/.well-known/matrix/server
```

## File Locations

| Path                                    | What                  |
| --------------------------------------- | --------------------- |
| `/opt/nervur/docker-compose.yml`        | Docker Compose config |
| `/opt/nervur/tuwunel.toml`              | Homeserver config     |
| `/etc/caddy/Caddyfile`                  | Reverse proxy config  |
| Docker volume: `nervur_homeserver-data` | Homeserver database   |
| Docker volume: `nervur_brain-data`      | Brain config and data |

## Logs

```bash
# All containers
docker compose -f /opt/nervur/docker-compose.yml logs -f

# Individual
docker logs -f nervur-homeserver
docker logs -f nervur-brain
docker logs -f nervur-watchtower
```

## Stop / Start

```bash
cd /opt/nervur

# Stop everything
docker compose down

# Start everything
docker compose up -d

# Restart a single service
docker compose restart brain
```

## Uninstall

```bash
cd /opt/nervur
docker compose down -v    # -v removes data volumes
rm -rf /opt/nervur
```

This removes all containers, data, and configuration. Caddy and Docker remain installed.
