#!/bin/sh
set -eu

DATA_DIR="/data"
MARKER="${DATA_DIR}/.migrated"
WRANGLER="node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js"
VARS_FILE="dist/server/.dev.vars"
APP_ORIGIN="${APP_ORIGIN:-https://wealth-me-up.codex074.com}"
UPSTREAM_HOST="${APP_ORIGIN#https://}"
UPSTREAM_HOST="${UPSTREAM_HOST#http://}"

: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID is required}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"
: "${ALLOWED_EMAILS:?ALLOWED_EMAILS is required}"

mkdir -p "${DATA_DIR}"

# Wrangler reads .dev.vars from the directory of the config file it is given.
umask 077
{
  printf 'GOOGLE_CLIENT_ID=%s\n' "${GOOGLE_CLIENT_ID}"
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "${GOOGLE_CLIENT_SECRET}"
  printf 'SESSION_SECRET=%s\n' "${SESSION_SECRET}"
  printf 'ALLOWED_EMAILS=%s\n' "${ALLOWED_EMAILS}"
  printf 'APP_ORIGIN=%s\n' "${APP_ORIGIN}"
} > "${VARS_FILE}"
umask 022

if [ ! -f "${MARKER}" ]; then
  echo "Applying initial D1 migration to ${DATA_DIR} ..."
  ${WRANGLER} d1 execute DB \
    --local \
    --config dist/server/wrangler.json \
    --persist-to "${DATA_DIR}" \
    --file drizzle/0000_bumpy_tombstone.sql
  touch "${MARKER}"
fi

exec ${WRANGLER} dev \
  --local \
  --config dist/server/wrangler.json \
  --persist-to "${DATA_DIR}" \
  --ip 0.0.0.0 \
  --port 8787 \
  --local-upstream "${UPSTREAM_HOST}" \
  --upstream-protocol https \
  --inspector-port 0
