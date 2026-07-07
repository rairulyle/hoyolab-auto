#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Apply the timezone if a valid one was provided.
if [ -n "${TZ:-}" ] && [ -f "/usr/share/zoneinfo/${TZ}" ]; then
	cp "/usr/share/zoneinfo/${TZ}" /etc/localtime
	echo "${TZ}" > /etc/timezone
fi

# The DB and logs live in bind-mounted volumes; make them writable by the
# requested user so files created in the container match host ownership.
mkdir -p /app/data /app/logs
chown -R "${PUID}:${PGID}" /app/data /app/logs

exec su-exec "${PUID}:${PGID}" "$@"
