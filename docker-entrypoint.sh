#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# The DB and logs live in bind-mounted volumes; make them writable by the
# requested user so files created in the container match host ownership.
mkdir -p /app/data /app/logs
chown -R "${PUID}:${PGID}" /app/data /app/logs

exec su-exec "${PUID}:${PGID}" "$@"
