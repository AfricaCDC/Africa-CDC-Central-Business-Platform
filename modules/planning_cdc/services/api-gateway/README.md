# api-gateway

Internal Nginx reverse proxy for the RBM Platform. Sits **inside** the private
Docker network, behind `nginx-proxy` (the public TLS edge). Routes URL prefixes
to backend Node services and applies shared security, rate limiting, and error
envelope normalisation.

## Topology

```
Internet → nginx-proxy (TLS, HSTS, certbot) → api-gateway → one of:
                                                 ├─ api-server          :4000
                                                 ├─ file-service        :3003
                                                 ├─ notification-service:3005
                                                 ├─ sync-service        :3006
                                                 └─ web-app             :80
```

HSTS lives at `nginx-proxy` only (D-20260415-09). CSP, CORS, and all non-HSTS
security headers live here. They are in `security_headers.conf`, included at
server level AND in every location that declares its own `add_header` (nginx
drops inherited headers there): the SPA shell (`/`), `/assets/`, `/version.json`
and the 503 fallback page. Before D-20261108-02 the HTML page had no CSP.

## Route table

| URL prefix              | Upstream               | Rate-limit zone          | Body cap | Notes |
|-------------------------|------------------------|--------------------------|----------|-------|
| `/health`               | (self)                 | none                     | —        | Docker HEALTHCHECK |
| `/healthz`              | api-server `/healthz`  | `api_zone`               | 1 m      | Upstream liveness probe |
| `/api/auth/(login\|refresh\|register\|forgot-password\|reset-password)` | api-server | `auth_zone` 60r/m burst 3 | 64 k | Brute-force guard |
| `/sso/accept`           | api-server `/api/auth/cbp/accept` | `api_zone` burst 10 | 16 k | CBP Staff Portal SSO form POST (D-20261110-01); Apache strips `/staff/planning` |
| `/api/`                 | api-server             | `api_zone` 60r/s burst 60 | 50 m    | Multipart ceiling (budget execution workbook) |
| `/files/`               | file-service           | `upload_zone` 5r/s burst 10 | 100 m | Evidence uploads |
| `/notifications/`       | notification-service   | `api_zone` 20 burst      | 1 m      | |
| `/sync/`                | sync-service           | `api_zone` 10 burst      | 1 m      | |
| `/`                     | web-app                | `conn_per_ip` 200        | 1 m      | SPA catch-all |

All attack paths (`*.php`, `*.asp`, `/.git`, `/.env`, `/.cleanup`, `/wp-admin`,
`/wp-login.php`) return a canonical `{"success":false,"code":"FORBIDDEN_PATH"}`
envelope with HTTP 403 (was `return 444` — silent close — before T-28).

## Rate-limit zones

| Zone | Rate | Purpose |
|------|------|---------|
| `auth_zone`   | 60 req / minute / IP | Brute-force defence on login, refresh, register, forgot/reset password |
| `api_zone`    | 60 req / second / IP | Authenticated API traffic; matches app-level `generalLimiter` |
| `upload_zone` | 5  req / second / IP | Large multipart uploads to `/files/` |
| `conn_per_ip` | 200 concurrent / IP on `/` and `/api/` (staff share office IPs, D-20261106-11); 20 on auth, 10 on files | Slowloris / FD-exhaustion defence |

**Important:** every zone keys off the **real client IP**, which requires the
`set_real_ip_from` + `real_ip_header X-Forwarded-For` + `real_ip_recursive on`
block at the top of the `server` scope. Without that, every request appears to
come from the nginx-proxy IP and zones degrade to a global cap (F-001 regression).

## Error envelope

Gateway-level errors on backend prefixes (`/api/`, `/files/`, `/notifications/`,
`/sync/`, `/healthz`) return the canonical shape:

```json
{ "success": false, "message": "<human>", "code": "<MACHINE_CODE>" }
```

| Trigger                        | HTTP | `code`              |
|--------------------------------|------|---------------------|
| Upstream returned 404 / catch-all | 404  | `NOT_FOUND`         |
| Body exceeded `client_max_body_size` | 413  | `PAYLOAD_TOO_LARGE` |
| Rate-limit exceeded            | 429  | `RATE_LIMITED`      |
| Upstream 502 / 503 / 504       | 502  | `UPSTREAM_DOWN`     |
| Attack path                    | 403  | `FORBIDDEN_PATH`    |

The SPA catch-all (`location /`) deliberately **does not** install JSON error
pages — the frontend renders its own 404 UI for deep links.

## Observability

Every request carries a gateway-generated `X-Request-ID` (if the client did not
already send one). The access log format `gateway` includes `$request_id`
under the `rid=` field so logs can be correlated with downstream pino JSON
logs in api-server / notification-service / sync-service / file-service.

## Dev / local

Lenny runs services natively (no Docker). `vite.config.js` proxies `/api` and
`/uploads` directly to `http://localhost:4000`. Other prefixes are intentionally
**not** proxied in dev — local dev exercises those services only through
api-server or by hitting their ports directly.

## CI / build-time checks

- `nginx -t` runs inside the Dockerfile `RUN` step so syntactic errors fail the
  image build.
- `scripts/check-nginx.sh` (guardrails plan §4) greps for retired routes
  (`/notifications/ws`, `/pdf/`) and asserts CSP has no `unsafe-*` directives.

## Notable removed routes

| Removed    | Reason | Ref |
|------------|--------|-----|
| `/notifications/ws` | No WebSocket handler ever existed in notification-service; the `proxy_read_timeout 3600s` was a DoS amplifier on the dead route. | F-011, `docs/OBSOLETE.md` |
| `/pdf/`    | pdf-service retired — no callers (see D-20260415-08). | D-20260415-08 |
