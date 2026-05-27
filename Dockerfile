# TiddlyWiki-CPL Server Dockerfile
# Runs the server version via scripts/server.ts (NOT a static site build image)
#
# Build without proxy (open network):
#   docker build -t tiddlywiki-cpl .
#
# Build behind a proxy (proxy must be reachable from inside the container;
# use the docker bridge gateway address, NOT 127.0.0.1):
#   # On Linux: forward host proxy to the bridge interface first:
#   socat TCP-LISTEN:1081,bind=172.17.0.1,fork,reuseaddr TCP:127.0.0.1:1080 &
#   docker build \
#     --build-arg HTTP_PROXY=http://172.17.0.1:1081 \
#     --build-arg HTTPS_PROXY=http://172.17.0.1:1081 \
#     -t tiddlywiki-cpl .
#
# Run (recommended: mount all three persistent directories):
#   docker run -p 8080:8080 \
#     -v $(pwd)/data:/app/data \
#     -v $(pwd)/repo-cache:/app/repo-cache \
#     -v $(pwd)/plugin-fetched:/app/wiki/files/plugin-fetched \
#     -e PORT=8080 -e HOST=0.0.0.0 \
#     tiddlywiki-cpl

# Declare proxy args before any FROM so they're available in all stages.
ARG HTTP_PROXY
ARG HTTPS_PROXY

FROM node:22-slim AS base

# Re-declare in this stage (ARGs don't cross stage boundaries automatically).
ARG HTTP_PROXY
ARG HTTPS_PROXY

# Install git + ca-certificates (git pull needs TLS) and pnpm via npm.
# HTTP_PROXY/HTTPS_PROXY are respected by npm; empty = direct connection.
RUN apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.3.0

WORKDIR /app

# ---- dependency install stage ----
FROM base AS deps

# Re-declare so pnpm install can see the proxy.
ARG HTTP_PROXY
ARG HTTPS_PROXY

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm 11 reads allowBuilds from pnpm-workspace.yaml to permit post-install
# build scripts (e.g. esbuild native binaries for tiddlywiki-plugin-dev).
RUN HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} \
    pnpm install --frozen-lockfile

# ---- runtime stage ----
FROM base AS runtime

WORKDIR /app

# Copy source and config
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json pnpm-workspace.yaml ./
COPY scripts/ ./scripts/
COPY src/ ./src/
# Copy wiki — but NOT wiki/files/plugin-fetched/ (gitignored, downloaded at
# runtime by the entrypoint).  plugin-offline/ IS included (committed, static
# fallback plugins that don't need fetching).
COPY wiki/ ./wiki/
RUN rm -rf /app/wiki/files/plugin-fetched

# TypeScript entrypoint: clones/pulls the repo at first/subsequent startups,
# fetches plugin JSONs, then starts the server.
# .git is NOT baked into the image — it lives in the repo-cache volume.
COPY docker-entrypoint.ts ./docker-entrypoint.ts

# Persistent mount points — create so Docker doesn't auto-create them as root.
#   /app/data       — stats, ratings, compatibility data
#   /app/repo-cache — git clone of the repo (updated at each startup)
#   /app/wiki/files/plugin-fetched — downloaded plugin JSONs (mount to persist
#     across restarts and avoid re-downloading on every container start)
RUN mkdir -p /app/data /app/repo-cache /app/wiki/files/plugin-fetched
VOLUME ["/app/data", "/app/repo-cache", "/app/wiki/files/plugin-fetched"]

# Expose default port (override with PORT env var)
EXPOSE 8080

# STARTUP SEQUENCE (docker-entrypoint.ts via ts-node):
#   1. git clone / git pull into /app/repo-cache (volume-mounted)
#   2. copy wiki/tiddlers/plugin-metadata from repo-cache into /app
#   3. fetch-plugins — download plugin JSONs into wiki/files/plugin-fetched/
#   4. scripts/server.ts --prod — build runtime plugins, start TiddlyWiki
#
# Use HOST=0.0.0.0 so the container is reachable from outside.
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

ENTRYPOINT ["node_modules/.bin/ts-node", "--transpile-only", "docker-entrypoint.ts"]
