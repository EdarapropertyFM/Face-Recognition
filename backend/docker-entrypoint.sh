#!/bin/sh
# Bring the database schema up to date, then start the API.
#
# A freshly cloned deployment starts against an empty database, so something
# has to create the tables. Doing it here rather than by hand means the
# server cannot be started against a schema nobody migrated, which is the
# failure that leaves every request returning a 500.
set -e

echo "[entrypoint] waiting for the database at ${DB_HOST}:${DB_PORT}..."
# The database container reports healthy before it finishes its first-run
# initialisation, so this waits on a real connection rather than on compose.
i=0
until node -e "
const { Client } = require('pg');
new Client({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
}).connect().then((c) => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[entrypoint] database unreachable after 60 attempts, giving up" >&2
    exit 1
  fi
  sleep 2
done

echo "[entrypoint] running migrations..."
node ./node_modules/typeorm/cli.js -d dist/src/database/data-source.js migration:run

echo "[entrypoint] starting the API"
exec node dist/src/main
