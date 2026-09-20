# Relay (WebSocket) container — built from the repo root as context:
#   docker build -f apps/relay/Dockerfile -t firexp-relay .
#
# esbuild bundles everything (incl. @fire-stick/types) into a single
# dist/main.js, so the runtime image needs no node_modules.

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /repo

# Install workspace deps (root lockfile drives the whole monorepo).
COPY . .
RUN npm ci

# Build the shared types package first, then bundle the relay.
RUN npm run build -w @fire-stick/types \
 && npm run build:prod -w relay

# ── Runtime ───────────────────────────────────────────────────────────────────
# Distroless: just the Node runtime — no shell, npm, yarn or package manager.
# The esbuild bundle is self-contained, so nothing else is needed. This roughly
# halves the image vs node:alpine. ENTRYPOINT is already ["node"].
FROM gcr.io/distroless/nodejs24-debian12 AS relay
WORKDIR /app
ENV NODE_ENV=production

# Bundled server + static assets (phone page; videos/images are served from
# S3/CloudFront in prod and are gitignored, so they may be absent here).
COPY --from=builder /repo/apps/relay/dist ./dist
COPY --from=builder /repo/apps/relay/public ./public

EXPOSE 3001
CMD ["dist/main.js"]
