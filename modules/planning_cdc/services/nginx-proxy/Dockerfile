# ─────────────────────────────────────────────────────────────
# RBM Platform — Public nginx-proxy (TLS termination)
# Sits in front of api-gateway in staging/prod.
# Built with context: ./services/nginx-proxy.
# ─────────────────────────────────────────────────────────────

FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
