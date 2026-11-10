# Integrating a new module into CBP

This guide explains how to add a **new application module** to the Africa CDC Central Business Platform (CBP) so it:

1. Appears in the **Staff Portal / CBP modules launcher**
2. Calls the **Staff Share API** (staff directory, divisions, directorates, CBP nav, mail hub)
3. Optionally calls the **APM REST APIs** (approvals, documents, matrices, memos)

Use existing modules as references: **Helpdesk**, **Finance**, **Risk Register**, and **APM**.

---

## Architecture (what talks to what)

```text
┌─────────────────────────────────────────────────────────────┐
│  Staff Portal (modules/staff-portal)                        │
│  • Identity / SSO / permissions                             │
│  • Share API  /share/*  and  /backend/share/*               │
│  • cbp_modules table → launcher tiles + launch tokens       │
└───────────────┬─────────────────────────────┬───────────────┘
                │ Staff Share API             │ SSO launch
                │ (staff, divisions, …)       │ (?token= / bridge)
                ▼                             ▼
┌───────────────────────┐     ┌────────────────────────────────┐
│ New module            │────►│ APM (modules/apm)              │
│ modules/<your-app>    │     │ REST  /apm/api/apm/v1/*  (JWT) │
└───────────────────────┘     └────────────────────────────────┘
```

| Direction | Purpose |
|-----------|---------|
| **Module → Staff** | Sync staff/org data; load CBP nav; send mail via Share hub; validate Share credentials |
| **Staff → Module** | Launch tile with session token (`uses_staff_portal_token`); optional reverse Share endpoints if the module exposes its own Share copy |
| **Module → APM** | Read/act on approvals, documents, memos (mobile, integrations, cross-module features) |

Public URL layout (Apache maps folder → `modules/`):

| App | Typical public path |
|-----|---------------------|
| Staff SPA | `/{WEB_ROOT}/` |
| Staff API / Share | `/{WEB_ROOT}/backend` and `/{WEB_ROOT}/share` |
| APM | `/{WEB_ROOT}/apm` |
| Finance | `/{WEB_ROOT}/finance` |
| Helpdesk | `/{WEB_ROOT}/helpdesk` |
| Risk Register | `/{WEB_ROOT}/risk-register` |
| Result Based Management (RBM) | `/{WEB_ROOT}/planning` (reverse proxy, see [§1b](#1b-modules-with-their-own-stack-planning_cdc)) |

`WEB_ROOT` is usually `staff`, `cbp`, `demo_cbp`, etc. (see [SETUP.md](./SETUP.md)).

---

## 1. Place the module in the repo

```text
modules/
  staff-portal/
  apm/
  finance/
  helpdesk/
  risk-register/
  your-module/          ← new Laravel (or other) app
    backend/            ← preferred for SPA modules (portal/helpdesk style)
    .env / setup.env
    README.md
```

Wire into root setup when ready:

- Add DB / env keys in `./setup.sh` (and module `configure-env` if you have one)
- Apache / Compose path aliases (same pattern as finance/helpdesk)
- Optional Supervisor programs via `scripts/setup/install-supervisor.sh`

Until then you can develop under `modules/your-module` and point `APP_URL` at `/{WEB_ROOT}/your-module`.

### 1b. Modules with their own stack (planning_cdc)

`modules/planning_cdc` is the Result Based Management platform (RBM, also served at `pra.africacdc.org`). It is a Node/React stack with its own MySQL, Redis and nginx gateway, so Apache does not serve its files. Apache forwards `/staff/planning/` to the planning gateway and strips the prefix.

- **Source of truth.** `modules/planning_cdc` is a copy of the Azure DevOps repo `AfricaCDC/Tools/planning`, limited to what builds and runs the stack (`services/`, `packages/`, `scripts/` and the root build files). Its docs, workbooks and `services/api-server/src/db/data/` (budget and workplan snapshots) stay in Azure DevOps. Change the code there. Each push to its `main` opens or updates a sync PR here (branch `sync/planning-cdc`), one commit per sync. A commit made under `modules/planning_cdc` in this repo shows up reverted in the next sync PR.
- **Proxy.** `docker/apache/000-staff.conf` holds the `<Location /staff/planning/>` block (`mod_proxy_http`). A host-Apache install copies the block into its vhost and points `ProxyPass` at the gateway's published address. If `WEB_ROOT` is not `staff`, change the path in the block.
- **Network.** The CBP `docker-compose.yml` creates the `cbp-modules` network. Start the CBP first, then the planning stack with the overlay, which gives its gateway the alias `planning-gateway` on that network:

  ```bash
  cd modules/planning_cdc
  docker compose --env-file .env.production -f docker-compose.yml -f ../../docker/planning-cdc.compose.yml up -d --build
  ```

  The api-server runs `knex migrate:latest` at start. On an empty database, six data migrations need `services/api-server/src/db/data/`, which this copy leaves out: copy that folder from the Azure DevOps repo into `modules/planning_cdc` before the first `up --build`. An existing database does not need it.

- **Launcher.** `CORE_MODULES` key `pra` (the RBM card of the home catalog), base URL `planning`, permission 128 `cbp_pra`, resolver `staff_app_token`. An existing `pra` row is never overwritten, so a production row that points at `pra.africacdc.org` keeps working until an administrator changes it.
- **SSO.** The Staff Portal posts `staff_sso_jwt` to `/staff/planning/sso/accept`. The planning api-server checks the HS256 signature with `CBP_SSO_JWT_SECRET`, which must equal the CBP root `JWT_SECRET`. Unsigned tokens are refused. Only staff who already have an RBM account can sign in.
- **Planning env for this mode.** `VITE_BASE_PATH=/staff/planning/`, `APP_BASE_URL=https://<cbp-host>/staff/planning`, `MS_REDIRECT_URI=https://<cbp-host>/staff/planning/api/auth/microsoft/callback` (registered in Entra), `CORS_ORIGINS` including `https://<cbp-host>`, and `CBP_SSO_JWT_SECRET`. Staff and divisions sync keeps using `CBP_BASE_URL` with the Share API Basic credentials.
- **Same origin.** In this mode RBM shares the CBP origin, and with it `localStorage` and cookies under `/staff`. RBM keeps its tokens under the keys `token`, `refreshToken` and `user`; no CBP app uses those keys today.

---

## 2. Register the module in the CBP launcher (Staff)

Staff Portal stores launcher tiles in table `cbp_modules`. Admin UI: **Settings → CBP modules**.

### Required fields

| Field | Example | Notes |
|-------|---------|--------|
| `module_key` | `your_module` | Stable snake_case id; used by nav `exclude` / `active` |
| `system_name` | `Your Module` | Label on home + header |
| `base_url` | `your-module` | Path under Staff host (`/{WEB_ROOT}/your-module`) |
| `permission_code` | new permission id | Feature RBAC / admin assignment (enabled modules are shown to all signed-in users) |
| `uses_staff_portal_token` | `1` | Almost always **1** for Laravel modules (SSO bridge) |
| `target_resolver` | `staff_app_token` | Same as APM / Finance / Helpdesk / Risk |
| `is_enabled` / `is_production` | `1` | Visibility flags |
| `icon_class` | `fa-briefcase` | Font Awesome class |
| `sort_order` | `50` | Order on home |

Core definitions live in:

`modules/staff-portal/backend/Modules/Settings/app/Services/CbpModulesAdminService.php`  
(`CORE_MODULES` + `ensureCoreModules()`).

**For a permanent platform module**, add a row to `CORE_MODULES` so new installs seed it.  
**For a one-off / pilot**, create the row in Settings → CBP modules without editing PHP.

### Launch / SSO

With `uses_staff_portal_token = 1` and `target_resolver = staff_app_token`, Staff Portal opens:

```text
/{WEB_ROOT}/{base_url}/…?token=<staff-session-jwt>
```

Your module must:

1. Accept `token` (query or `Authorization: Bearer`)
2. Validate against Staff JWT (`JWT_SECRET` shared from root `.env` via `shared/load-staff-root-env.php`)
3. Map identity to **`auth_staff_id` / staff work email**
4. Create a local session (or SPA Bearer) and redirect to the app home

Copy the bridge pattern from Helpdesk / Finance / Risk Register auth middleware.

---

## 3. Link the module to Staff (Share API)

### Endpoints (Staff is source of truth)

| Method | Path | Use |
|--------|------|-----|
| `POST` | `/share/login` | Issue JWT (JSON username + password — preferred) |
| `POST` | `/share/token` | Issue JWT (HTTP Basic — legacy alternative) |
| `POST` | `/share/refresh_token` | Refresh JWT |
| `GET` | `/share/get_current_staff` | Staff + contracts (+ `associated_divisions`) |
| `GET` | `/share/divisions` | Divisions |
| `GET` | `/share/directorates` | Directorates |
| `GET` | `/share/users` | Users reference |
| `GET` | `/share/cbp_modules` | Launcher payload for header nav |
| `GET` | `/share/get_photo` / `get_signature` | Binary assets |
| `POST` | `/share/mail/send` | Outbound mail via portal hub |
| `GET` | `/share/docs` | Swagger UI |
| `GET` | `/share/openapi.yaml` | OpenAPI |

Also available under `/backend/share/…`. Legacy CI3-style URLs are rewritten by root `.htaccess`.

Full consumer notes: [modules/staff-portal/backend/Modules/Share/README.md](../modules/staff-portal/backend/Modules/Share/README.md).

### Auth (any one)

1. **Username + password** → `POST /share/login` → `Authorization: Bearer <jwt>` (preferred; KnowledgeHub-style)
2. **Legacy Basic token** → `POST /share/token` with HTTP Basic → JWT
3. **Static token** → `Authorization: Bearer {STAFF_API_TOKEN}` (and optional path segment)
4. **HTTP Basic** on protected routes (parity with portal login)

### Env keys (every consumer module)

```env
# Host Apache
STAFF_API_INTERNAL_BASE_URL=https://cbp.africacdc.org/staff/backend
# Local:
# STAFF_API_INTERNAL_BASE_URL=http://127.0.0.1/staff/backend
# Docker Compose network:
# STAFF_API_INTERNAL_BASE_URL=http://web/staff/backend

STAFF_API_USERNAME=service.account@africacdc.org
STAFF_API_PASSWORD=********
# Fallback if JWT issue fails:
STAFF_API_TOKEN=YWZyY2FjZGNzdGFmZnRyYWNrZXI
```

Resolution order (DB settings → env → defaults) is implemented in:

`shared/StaffApiCredentials.php`

HTTP client:

`shared/StaffShareHttp.php`  
(`Staff\Shared\StaffShareHttp`)

### Composer autoload (required)

In your module `composer.json`:

```json
"autoload": {
  "psr-4": {
    "Staff\\Shared\\": "../../shared/"
  }
}
```

Then `composer dump-autoload`. Same mapping is used by APM, Helpdesk, Finance, Risk Register.

### Minimal PHP usage

```php
use Staff\Shared\StaffApiCredentials;

$client = StaffApiCredentials::client(); // or StaffShareHttp::fromConfig(config('services.staff_api'))

if (! $client->isConfigured()) {
    throw new RuntimeException('Configure STAFF_API_USERNAME/PASSWORD and/or STAFF_API_TOKEN.');
}

$staff = $client->getJson('/share/get_current_staff');
$divisions = $client->getJson('/share/divisions');
```

### Recommended pieces to copy

| Piece | Reference |
|-------|-----------|
| Config array | APM `config/services.php` → `staff_api`, or Helpdesk `config/helpdesk.php` → `staff_api` |
| Settings UI + probe | `StaffApiSettingsController` in APM / Finance / Helpdesk / Risk Register |
| Staff sync command | APM `php artisan staff:sync` (`SyncStaffCommand`) |
| CBP nav proxy | Risk/Finance `CbpModulesController` + `StaffPortalOrgClient::fetchCbpModules()` |
| Mail via Share | `STAFF_MAIL_DISPATCH=auto` + portal `POST /share/mail/send` |

### Connectivity test

- Root wizard: `./setup.sh` probes Share after writing credentials ([SETUP.md](./SETUP.md))
- In-module: Settings → Staff API → **Test connection** (uses `StaffApiCredentials::probe`)
- Manual Swagger: `/{WEB_ROOT}/backend/share/docs`

---

## 4. Link the module to APM APIs

Use this when your module needs approvals, documents, matrices, or memo data **from APM** (not when you only need staff/org data — that stays on Staff Share).

### Docs and base URL

| Resource | Location |
|----------|----------|
| Human docs | [modules/apm/documentation/API_DOCUMENTATION.md](../modules/apm/documentation/API_DOCUMENTATION.md) |
| OpenAPI | [modules/apm/documentation/APM_API_OPENAPI.yaml](../modules/apm/documentation/APM_API_OPENAPI.yaml) |
| Swagger UI | `/{WEB_ROOT}/apm/docs` |
| API base | `/{WEB_ROOT}/apm/api/apm/v1` |

Examples:

- Local: `http://localhost/staff/apm/api/apm/v1`
- Production-style: `https://cbp.africacdc.org/staff/apm/api/apm/v1`

### Auth

1. `POST /auth/login` with staff `email` + `password` → `access_token` (JWT)
2. Or `POST /auth/microsoft` with Microsoft `access_token` / auth `code`
3. Call protected routes with `Authorization: Bearer <access_token>`
4. Refresh: `POST /auth/refresh` (supports near-expired tokens)

API users live in APM (`apm_api_users`, synced from staff). The staff profile must exist and be active in APM (run `php artisan staff:sync` on APM after Staff data changes).

### Common protected routes (JWT)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/auth/me` | Current API user + context |
| `GET` | `/pending-approvals` | Queue for the user |
| `GET` | `/pending-approvals/summary` | Counts |
| `GET` | `/documents/{id}` | Document + approval trail |
| `POST` | `/approvals/...` | Approve / return / act (see OpenAPI) |
| `GET` | `/memos` | Memo list |
| `GET` | `/matrices/...` | Matrix data |
| `GET` | `/reference/...` | Divisions / reference (as documented) |

Always treat [API_DOCUMENTATION.md](../modules/apm/documentation/API_DOCUMENTATION.md) and the OpenAPI file as the contract; paths above are summary only.

### Example: login then list pending

```bash
BASE='http://localhost/staff/apm/api/apm/v1'

TOKEN=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@africacdc.org","password":"********"}' \
  | jq -r '.data.access_token')

curl -sS "$BASE/pending-approvals" \
  -H "Authorization: Bearer $TOKEN"
```

### Module `.env` suggestion for APM client

```env
APM_API_BASE_URL=http://127.0.0.1/staff/apm/api/apm/v1
# Prefer per-user tokens from login; for server jobs use a dedicated API staff account:
# APM_API_USERNAME=
# APM_API_PASSWORD=
```

Do **not** reuse `STAFF_API_*` for APM — different base path and JWT issuer.

### When APM calls Staff (the reverse)

APM is itself a Staff consumer (`staff:sync`, `divisions:sync`, `directorates:sync`). Your module does not need to proxy Staff through APM; call Staff Share directly for directory data.

---

## 5. CBP header nav inside your SPA

Pattern used by Finance / Risk Register / Helpdesk:

1. Authenticated SPA calls **your** backend `GET /api/v1/cbp-modules`
2. Backend prefers Staff `GET /share/cbp_modules?staff_id=…&exclude=your_module&active=your_module`
3. On Share failure, fall back to a local `cbp_modules` table / `CbpModulesNav`

See:

- `modules/risk-register/backend/app/Http/Controllers/Api/V1/CbpModulesController.php`
- `modules/finance/backend/app/Http/Controllers/Api/V1/CbpModulesController.php`

Use a stable `MODULE_KEY` matching `cbp_modules.module_key`.

---

## 6. Checklist for a new module

### Staff / CBP shell

- [ ] App lives under `modules/<name>` with public URL `/{WEB_ROOT}/<name>`
- [ ] Row in `cbp_modules` (Settings UI and/or `CORE_MODULES`)
- [ ] Permission code assigned to the right Staff groups
- [ ] SSO bridge accepts Staff launch `token` and resolves `auth_staff_id`
- [ ] Composer maps `Staff\Shared\` → `../../shared/`
- [ ] `.env` has `STAFF_API_INTERNAL_BASE_URL` + username/password and/or token
- [ ] Settings page can save/probe Staff API (`StaffApiCredentials`)
- [ ] Optional: `staff:sync`-style artisan command for local staff cache
- [ ] Optional: `GET /api/v1/cbp-modules` proxy for top nav
- [ ] Optional: `STAFF_MAIL_DISPATCH=auto` for portal mail hub

### APM (only if needed)

- [ ] Document `APM_API_BASE_URL` in module `.env.example`
- [ ] Login (or Microsoft) → store JWT → call `/api/apm/v1/*`
- [ ] Ensure APM has synced staff (`php artisan staff:sync` on APM)
- [ ] Follow [API_DOCUMENTATION.md](../modules/apm/documentation/API_DOCUMENTATION.md) / OpenAPI for payloads
- [ ] Never send Staff Share static token as an APM JWT

### Platform ops

- [ ] Hook into `./setup.sh` DB name + env force-update when the module is official
- [ ] Storage under `STAFF_DATA_ROOT` / module `storage` ([STORAGE.md](./STORAGE.md))
- [ ] Queue/scheduler via Supervisor or Compose workers if you use jobs
- [ ] Module README with local run + URLs

---

## 7. Reference map

| Concern | Canonical code / docs |
|---------|------------------------|
| Share endpoints | `modules/staff-portal/backend/Modules/Share/README.md` |
| Share HTTP client | `shared/StaffShareHttp.php` |
| Credential resolve + probe | `shared/StaffApiCredentials.php` |
| CBP module admin | `CbpModulesAdminService` (staff-portal) |
| APM sync from Staff | `modules/apm` → `staff:sync`, `divisions:sync`, `directorates:sync` |
| APM REST | `modules/apm/documentation/API_DOCUMENTATION.md` |
| Root install | [SETUP.md](./SETUP.md) |
| Docker URLs | [docker/README.md](../docker/README.md) |

---

## 8. Common mistakes

1. **Pointing `STAFF_API_*` at `/staff` without `/backend`** — Share lives on Laravel under `/backend` (client normalizes `/staff` → `/staff/backend`, but set the correct URL).
2. **Using APM JWT against Share (or the reverse)** — different issuers and paths.
3. **Forgetting `staff:sync` on APM** — API login fails with 403 if the staff row is missing.
4. **Launcher when disabled / non-production** — tile hidden when `is_enabled=0`, or when `is_production=0` for non–role-10 users. `permission_code` does not hide the tile.
5. **Missing `Staff\Shared` autoload** — `Class Staff\Shared\StaffShareHttp not found`.
6. **Hard-coding production host** — use `STAFF_API_INTERNAL_BASE_URL` / `WEB_ROOT` from setup.
