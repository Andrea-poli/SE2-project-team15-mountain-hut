#!/bin/sh
# Mountain Hut container start (D2). Runs before the server, every time the container starts.
#
# 1. SESSION_SECRET is required: the server refuses to start without it, and an image must never
#    contain one (it is public on DockerHub), so it always comes from the environment.
# 2. First start only: when the database file does not exist yet (new, empty volume), fill it with
#    the demo data. The seed refuses NODE_ENV=production (it would wipe a real database), so it runs
#    here with NODE_ENV=development, and only when there is nothing to wipe. From the second start on
#    the file exists and the data is kept (bookings made in the demo survive a restart).
#    SEED_DEMO_DATA=false skips it (an empty hut, staff accounts must then be created another way).
set -e

if [ -z "$SESSION_SECRET" ]; then
  echo "SESSION_SECRET is missing: start the container with -e SESSION_SECRET=<a long random text>" >&2
  echo "(e.g. the output of: openssl rand -hex 32). See the README, section Docker." >&2
  exit 1
fi

DB_FILE="${DB_PATH:-${DATA_DIR:-/data}/mountain-hut.db}"
case "$DB_FILE" in
  /data/*) ;;
  *) echo "Warning: the database is at $DB_FILE, outside the /data volume:" >&2
     echo "it is lost when the container is removed." >&2
     echo "(DATA_DIR or DB_PATH set from a development .env? In Docker leave them out.)" >&2 ;;
esac
if [ ! -f "$DB_FILE" ] && [ "${SEED_DEMO_DATA:-true}" != "false" ]; then
  echo "First start: no database at $DB_FILE, loading the demo data (SEED_DEMO_DATA=false to skip)."
  NODE_ENV=development node server/src/seedCli.js
fi

exec "$@"
