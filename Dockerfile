FROM node:24-alpine

# git: some deps resolve from git; tzdata: TZ support; su-exec: drop to PUID/PGID
RUN apk add --no-cache git tzdata su-exec

WORKDIR /app

COPY ["package.json", "./"]
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/logs && \
    chmod +x /app/docker-entrypoint.sh

# Runs as root only to apply TZ + PUID/PGID, then the entrypoint drops privileges.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
