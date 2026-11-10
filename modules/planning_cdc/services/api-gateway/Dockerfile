# ─────────────────────────────────────────────────────────────
# RBM Platform — api-gateway (Nginx)
# Internal reverse proxy: routes /api, /uploads, /files,
# /notifications, /sync to backend services. Built with
# context: ./services/api-gateway.
#
# Security-header ownership: nginx-proxy (TLS edge) owns HSTS.
# This gateway owns CSP and all non-HSTS headers. See D-20260415-09.
# ─────────────────────────────────────────────────────────────

FROM nginx:1.27-alpine

# Explicit wget install — some nginx:alpine patch releases ship a
# minimal BusyBox without wget (F-027); pin the dependency so the
# HEALTHCHECK below is stable across base-image bumps.
RUN apk add --no-cache wget \
 && rm /etc/nginx/conf.d/default.conf

# Copy our shared proxy params + main config
COPY proxy_params          /etc/nginx/proxy_params
COPY security_headers.conf /etc/nginx/security_headers.conf
COPY nginx.conf            /etc/nginx/conf.d/default.conf

# Smoke-test the config at build time so a typo fails the image build
# instead of a container crash-loop.
RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
