# file-generator-service

Multi-format document generation sidecar (PDF / PPTX / XLSX / DOCX / CSV / ZIP).

Supersedes the retired `retired PDF sidecar` (D-20260415-08) with broader format
coverage and hardened controls for every finding in
`.cleanup/reports/phase1/retired PDF sidecar.md`.

## Spec

`docs/specs/file-generator-service.md` (D-20260415-15).

## Quick start

```sh
cd services/file-generator-service
npm install
JWT_ACCESS_SECRET=$(openssl rand -hex 32) \
  SERVICE_TOKEN_SECRET=$(openssl rand -hex 32) \
  STORAGE_SIGNING_SECRET=$(openssl rand -hex 32) \
  npm run dev
# curl http://localhost:3007/health
```

## Routes (Phase B — under construction)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | liveness + queue caps |
| POST | `/generate` | user JWT or svc token | sync generation, returns file buffer or signed URL |
| GET | `/signed/:token` | signature | redirect to `/download/:token` if valid |
| GET | `/download/:token` | signature | streaming download |

Gateway prefix: `/documents/` (nginx-proxy + api-gateway).

## Ports

- **3007** — sidecar (default, `PORT` override).

## Env

See `src/config.js` for the full list. Required at boot:

- `JWT_ACCESS_SECRET` — user-token verification.
- `SERVICE_TOKEN_SECRET` — svc-token verification (defaults to `JWT_ACCESS_SECRET`).
- `STORAGE_SIGNING_SECRET` — HMAC-SHA256 signed-URL secret (defaults to `JWT_ACCESS_SECRET`).
- `ACCEPTED_CALLERS` — CSV of svc names allowed to call this service. Default `api-server,sync-service,notification-service`.
