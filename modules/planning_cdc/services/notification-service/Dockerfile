# ─────────────────────────────────────────────────────────────
# RBM Platform — notification-service (production)
# Build from repo root:
#   docker build -f services/notification-service/Dockerfile .
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY services/notification-service/package.json ./services/notification-service/package.json

RUN npm install --workspace=services/notification-service --include-workspace-root --omit=dev \
    && npm cache clean --force

COPY services/notification-service/ ./services/notification-service/

# ── runtime ──
FROM node:20-alpine AS runner

RUN apk add --no-cache wget tini

RUN addgroup -g 1001 -S rbm && \
    adduser  -u 1001 -S rbm -G rbm -s /bin/sh

WORKDIR /app

COPY --from=builder --chown=rbm:rbm /app/node_modules ./node_modules
COPY --from=builder --chown=rbm:rbm /app/packages ./packages
COPY --from=builder --chown=rbm:rbm /app/services/notification-service ./services/notification-service
COPY --from=builder --chown=rbm:rbm /app/package.json ./package.json

USER rbm

WORKDIR /app/services/notification-service

ENV NODE_ENV=production \
    PORT=3005

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3005/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
