import crypto from 'crypto'

export function generateSecret(len = 32) {
  return crypto.randomBytes(len).toString('hex')
}

export function generateDockerCompose({
  containerName = 'nervur-homeserver',
  dataDir = './data',
  port = 8008,
  tunnelToken
} = {}) {
  let yml = `services:
  homeserver:
    image: ghcr.io/matrix-construct/tuwunel:latest
    container_name: ${containerName}
    restart: unless-stopped
    ports:
      - "${port}:8008"
    volumes:
      - ./tuwunel.toml:/etc/tuwunel.toml:ro
      - ${dataDir}:/data
    environment:
      - TUWUNEL_CONFIG=/etc/tuwunel.toml
    healthcheck:
      test: ["CMD", "curl", "-fsSL", "http://localhost:8008/_matrix/client/versions"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
`
  if (tunnelToken) {
    yml += `
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: nervur-cloudflared
    restart: unless-stopped
    network_mode: host
    command: tunnel --no-autoupdate run --token \${TUNNEL_TOKEN}
    env_file:
      - .env
    depends_on:
      - homeserver
`
  }
  return yml
}

export function generateTuwunelConfig({
  serverName = 'nervur.local',
  port = 8008,
  registrationSecret,
  dataDir = '/data',
  tunnelToken,
  domain
} = {}) {
  // Generate well_known when there's URL delegation (domain != serverName) or a Cloudflare tunnel.
  // - Delegation: domain differs from serverName, well-known must point clients to the HS hostname.
  // - Tunnel: federation port is 443 (tunnel only proxies HTTPS), not the default 8448.
  //   Without well-known, remote servers would try port 8448 which doesn't exist behind a tunnel.
  // - Neither: use localhost well-known for local development.
  const hasDelegation = domain && domain !== serverName
  const hasTunnel = !!tunnelToken
  let wellKnown
  if (domain && (hasDelegation || hasTunnel)) {
    const federationPort = hasTunnel ? 443 : 8448
    wellKnown = `[global.well_known]
client = "https://${domain}"
server = "${domain}:${federationPort}"
`
  } else {
    wellKnown = `[global.well_known]
client = "http://localhost:${port}"
`
  }

  return `[global]
server_name = "${serverName}"
address = "0.0.0.0"
port = 8008
database_path = "${dataDir}/rocksdb"
allow_registration = true
registration_token = "${registrationSecret}"

${wellKnown}`
}

export function generateEnvFile({ serverName = 'nervur.local', port = 8008, tunnelToken } = {}) {
  let env = `SERVER_NAME=${serverName}
PORT=${port}
`
  if (tunnelToken) {
    env += `TUNNEL_TOKEN=${tunnelToken}\n`
  }
  return env
}
