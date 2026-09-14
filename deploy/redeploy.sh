#!/usr/bin/env bash
# Syncs this repo to the "docker" LXC (103) on pve1 and brings the
# wealth-me-up stack up (build + start, idempotent). Run this any time
# after the first setup (deploy/setup-wizard.sh) to ship new changes.
#
# Requires: SSH access to root@pve1, and deploy/.env already populated
# with TUNNEL_TOKEN (setup-wizard.sh does this the first time).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PVE_HOST="pve1"
LXC_ID="103"
REMOTE_APP_DIR="/opt/wealth-me-up"
ENV_FILE="${REPO_ROOT}/deploy/.env"

for key in TUNNEL_TOKEN GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET ALLOWED_EMAILS; do
  if [[ ! -f "$ENV_FILE" ]] || ! grep -q "^${key}=." "$ENV_FILE"; then
    echo "deploy/.env is missing ${key} — run deploy/setup-wizard.sh first." >&2
    exit 1
  fi
done

echo "▸ Packing repo..."
TARBALL="$(mktemp -t wealth-me-up-deploy-XXXXXX.tar.gz)"
trap 'rm -f "$TARBALL"' EXIT
COPYFILE_DISABLE=1 tar -czf "$TARBALL" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.vinext' \
  --exclude='.wrangler' \
  --exclude='.sites-runtime' \
  --exclude='.agents' \
  --exclude='.codex' \
  --exclude='dist' \
  --exclude='.env*' \
  --exclude='.dev.vars*' \
  -C "$REPO_ROOT" .

echo "▸ Copying to pve1..."
scp -q "$TARBALL" "root@${PVE_HOST}:/root/wealth-me-up-deploy.tar.gz"

echo "▸ Pushing into LXC ${LXC_ID} and extracting..."
ssh "root@${PVE_HOST}" "
  set -e
  pct push ${LXC_ID} /root/wealth-me-up-deploy.tar.gz /root/wealth-me-up-deploy.tar.gz
  rm -f /root/wealth-me-up-deploy.tar.gz
  pct exec ${LXC_ID} -- sh -c 'mkdir -p ${REMOTE_APP_DIR} && tar xzf /root/wealth-me-up-deploy.tar.gz -C ${REMOTE_APP_DIR} && rm -f /root/wealth-me-up-deploy.tar.gz'
"

echo "▸ Pushing deploy/.env into the container..."
scp -q "$ENV_FILE" "root@${PVE_HOST}:/root/wealth-me-up.env"
ssh "root@${PVE_HOST}" "
  set -e
  chmod 600 /root/wealth-me-up.env
  pct push ${LXC_ID} /root/wealth-me-up.env ${REMOTE_APP_DIR}/deploy/.env --perms 0600
  rm -f /root/wealth-me-up.env
"

echo "▸ Building and starting the stack (this can take a few minutes on first run)..."
ssh "root@${PVE_HOST}" "pct exec ${LXC_ID} -- sh -c 'cd ${REMOTE_APP_DIR}/deploy && docker compose up -d --build'"

echo "▸ Status:"
ssh "root@${PVE_HOST}" "pct exec ${LXC_ID} -- sh -c 'cd ${REMOTE_APP_DIR}/deploy && docker compose ps'"

echo
echo "✓ Deployed. Tail logs with:"
echo "  ssh root@${PVE_HOST} \"pct exec ${LXC_ID} -- sh -c 'cd ${REMOTE_APP_DIR}/deploy && docker compose logs -f'\""
