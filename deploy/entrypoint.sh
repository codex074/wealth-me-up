#!/bin/sh
set -eu

DATA_DIR="/data"
MARKER="${DATA_DIR}/.migrated"
WRANGLER="node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js"

mkdir -p "${DATA_DIR}"

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
  --local-upstream wealth-me-up.codex074.com \
  --upstream-protocol https \
  --inspector-port 0
