# ─────────────────────────────────────────────────────────────
# RBM Platform — api-server (production)
# Multi-stage build with monorepo workspace context.
# Build from repo root:
#   docker build -f services/api-server/Dockerfile .
# ─────────────────────────────────────────────────────────────

# ── Stage 1: deps + build ────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests so npm can resolve workspaces
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY services/api-server/package.json ./services/api-server/package.json

# Install api-server + workspace root + transitive workspace packages
# Use npm install (not ci) because services/* don't have their own lockfile
RUN npm install --workspace=services/api-server --include-workspace-root --omit=dev \
    && npm cache clean --force

# Copy the actual source after deps so layer cache is reused
COPY services/api-server/ ./services/api-server/
# The notification wizard previews emails with the notification-service
# templates (pure functions over @rbm/lib): ship them with the API.
COPY services/notification-service/src/templates/ ./services/notification-service/src/templates/

# ── Stage 2: runtime ─────────────────────────────────────────
FROM node:20-alpine AS runner

# Install wget for healthcheck (already in base image but be explicit) + tini for PID 1
RUN apk add --no-cache wget tini

# Create non-root user (uid/gid 1001 for parity with scmd)
RUN addgroup -g 1001 -S rbm && \
    adduser  -u 1001 -S rbm -G rbm -s /bin/sh

WORKDIR /app

# Copy installed deps + source from builder
COPY --from=builder --chown=rbm:rbm /app/node_modules ./node_modules
COPY --from=builder --chown=rbm:rbm /app/packages ./packages
COPY --from=builder --chown=rbm:rbm /app/services/api-server ./services/api-server
COPY --from=builder --chown=rbm:rbm /app/services/notification-service/src/templates ./services/notification-service/src/templates
COPY --from=builder --chown=rbm:rbm /app/package.json ./package.json

# Copy entrypoint and make it executable
COPY --chown=rbm:rbm services/api-server/entrypoint.sh /app/services/api-server/entrypoint.sh
RUN chmod +x /app/services/api-server/entrypoint.sh

USER rbm

WORKDIR /app/services/api-server

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "sh", "/app/services/api-server/entrypoint.sh"]
