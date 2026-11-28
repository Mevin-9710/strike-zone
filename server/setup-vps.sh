#!/usr/bin/env bash
# Blastline game server: one-command setup on a fresh Ubuntu/Debian VPS (1 CPU / 1 GB RAM is enough for testing).
#
#   curl -fsSL https://raw.githubusercontent.com/Mevin-9710/strike-zone/main/server/setup-vps.sh | sudo bash
#   (to try a branch before it is merged: ... /strike-zone/<branch>/server/setup-vps.sh | sudo bash -s -- <branch>)
#
# What it does: installs Node 20 + Caddy, downloads server.mjs, runs it as a systemd service (auto-restart, starts on boot),
# and puts Caddy in front for HTTPS/WSS with a free certificate on <your-ip>.sslip.io (no domain needed).
# Re-run it any time to update the server to the latest code on that branch.
set -euo pipefail
BRANCH="${1:-main}"
RAW="https://raw.githubusercontent.com/Mevin-9710/strike-zone/${BRANCH}/server"
DIR=/opt/blastline
PORT=8787

[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

# Node 20
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

# Caddy (HTTPS reverse proxy)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

# server files
id blastline >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin blastline
mkdir -p "$DIR"
curl -fsSL "$RAW/server.mjs" -o "$DIR/server.mjs"
curl -fsSL "$RAW/package.json" -o "$DIR/package.json"
curl -fsSL "$RAW/los.mjs" -o "$DIR/los.mjs"
curl -fsSL "$RAW/maps.json" -o "$DIR/maps.json"
(cd "$DIR" && npm install --omit=dev --silent)
chown -R blastline:blastline "$DIR"

cat > /etc/systemd/system/blastline.service <<EOF
[Unit]
Description=Blastline game server
After=network.target
[Service]
User=blastline
WorkingDirectory=$DIR
Environment=PORT=$PORT
ExecStart=$(command -v node) $DIR/server.mjs
Restart=always
RestartSec=2
MemoryMax=400M
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now blastline >/dev/null
systemctl restart blastline

# HTTPS on <ip>.sslip.io (or set DOMAIN=game.example.com before running to use your own domain)
IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
HOST="${DOMAIN:-${IP//./-}.sslip.io}"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  reverse_proxy localhost:$PORT
}
EOF
systemctl reload caddy || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

sleep 3
echo
echo "Blastline server is running."
echo "  Status:  curl https://$HOST   (first HTTPS request can take ~20 s while the certificate is issued)"
echo "  Logs:    journalctl -u blastline -f"
echo "  Server URL for the game:  wss://$HOST"
echo "  Try it:  https://<your-vercel-preview>/play/?mp=wss://$HOST"
