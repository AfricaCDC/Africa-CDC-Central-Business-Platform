# ─────────────────────────────────────────────────────────────
# RBM Platform — web-app (production)
# Stage 1 — Vite build, Stage 2 — nginx static serve.
# Build from repo root:
#   docker build -f services/web-app/Dockerfile .
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY services/web-app/package.json ./services/web-app/package.json

# Install dev deps too — needed for vite build
RUN npm install --workspace=services/web-app --include-workspace-root \
    && npm cache clean --force

# Copy source after deps for cache reuse
COPY services/web-app/ ./services/web-app/

# API URL override; empty = `${VITE_BASE_PATH}api` (D-20261110-01)
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
# Public sub-path the app is served under; `/` standalone, `/staff/planning/`
# embedded in the CBP (Apache strips the prefix, nginx here still serves at /)
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
# Address of the RBM team on the sign-in page; empty hides the links
ARG VITE_SUPPORT_EMAIL=
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL

RUN npm run build --workspace=services/web-app

# ── Stage 2: Serve via nginx ─────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Copy built assets
COPY --from=builder /app/services/web-app/dist /usr/share/nginx/html

# SPA-friendly default config
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # gzip\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;\n\
    gzip_min_length 1000;\n\
\n\
    # Static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 30d;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # SPA fallback\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Healthcheck\n\
    location = /healthz {\n\
        access_log off;\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
