# encurt.ai

**Language:** English | [Português (Brasil)](README.pt-BR.md)

encurt.ai is a URL shortener with click tracking, link management, and an administrative console. The repository is an npm workspace monorepo: a Vue 3 and JavaScript web client and a Node.js, TypeScript, Fastify API. SQLite is the working database adapter.

## Features

- Create short links with optional custom codes, expiration dates, and descriptions (up to 200 characters).
- Copy, edit, pause, and reactivate links; inactive or expired links do not redirect.
- Track total clicks and view daily aggregate statistics. Click records contain the internal link ID and UTC timestamp, not visitor IP addresses or browser identifiers.
- Register and sign in with cookie-based sessions; edit the account name and change the password on the profile page.
- Use the interface in Brazilian Portuguese or English.
- Administer users and links, assign user/admin roles, deactivate accounts, and view aggregate system metrics. Administrative mutations are audited.
- Deactivating an account revokes its sessions and deactivates its links. Reactivating an account does not reactivate those links automatically.
- Display dedicated 403, 404, and 500 pages in the web client.

## Repository layout

```text
apps/
  api/     Fastify API, TypeScript domain services, Drizzle repositories, SQLite schema
  web/     Vue 3 client, JavaScript, Vue Router, Vite
README.md              English documentation
README.pt-BR.md        Portuguese documentation
ARCHITECTURE.md        Architecture, security requirements, and implementation notes
DESIGN.md              Product and UI requirements with reference mockups
user-ui.svg            User dashboard mockup
admin-ui.svg           Admin console mockup
```

The API is organized around platform and admin modules, with route composition in `apps/api/src/app.ts`, domain services in `apps/api/src/modules`, and Drizzle-backed repositories. The web client keeps routing, API calls, session state, notifications, and reusable UI components in separate modules.

## Requirements

- Node.js 22.18 or later (Node 22 LTS recommended).
- npm (the repository uses npm workspaces).

## Local development

Run commands from the repository root. Install dependencies:

```sh
npm install
```

Create a local environment file if one does not exist:

```powershell
Copy-Item .env.example .env
```

The checked-in example values are for local development only. Start the API and web client in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Open the Vite URL printed in the web terminal (normally `http://localhost:5173`). Vite proxies `/api` requests and short-code routes to the API at `http://localhost:3000`. Set `API_PROXY_TARGET` when the API runs elsewhere.

## Deploying with a custom domain

For a typical deployment, put a reverse proxy such as Nginx, Caddy, or a managed load balancer in front of the API, and serve the built web client as static files. Point the domain's DNS records (`A`/`AAAA`, or a `CNAME` where appropriate) to the web server or load balancer, then provision HTTPS certificates before accepting user traffic.

The simplest setup uses one application domain, for example `app.example.com`, and a separate short-link domain, for example `go.example.com`:

1. Build the frontend with `npm run build`. Serve `apps/web/dist` from `app.example.com` and configure the web server to fall back to `index.html` for client-side routes such as `/dashboard` and `/profile`.
2. Proxy `https://app.example.com/api/...` to the API. Preserve the incoming `Host` header and forward the original protocol and client address (`X-Forwarded-Proto` and `X-Forwarded-For`). The browser and API should remain same-origin through this proxy so the session cookie works without enabling cross-origin credentials.
3. Point `go.example.com` to the same reverse proxy and route short-code requests such as `/aB123xy` to the API. Do not serve the web app's SPA fallback on this host: a short code must reach the API so it can return the redirect.
4. Set `BASE_URL=https://go.example.com` and `WEB_BASE_URL=https://app.example.com` in the API environment. Newly created short links will use the short-link domain, and browser visits to an unknown short code will redirect to the styled 404 page on the application domain. If the app and short links share one domain, set both values to that origin.
5. Set `NODE_ENV=production`, use a strong persistent `DATA_ENCRYPTION_KEY`, and keep `.env` and the SQLite database outside the public web root. Restart the API after changing environment variables.

If HTTPS terminates at a reverse proxy, set `TRUSTED_PROXY_IPS` to the proxy's exact source IP address(es), or to the smallest private CIDR range that contains them. Values are comma-separated IPv4/IPv6 addresses or CIDRs; hostnames, wildcards, and `/0` networks are rejected. Leave it empty when the API is accessed directly. The API trusts forwarded headers only when the TCP peer matches this list. Configure the proxy to overwrite `X-Forwarded-Proto` and `X-Forwarded-For`, preserve the public `Host`, and prevent direct public access to the API port. For a same-host proxy, an example is `TRUSTED_PROXY_IPS=127.0.0.1,::1`; use the actual addresses seen by the API in other deployments (including container or load-balancer networks).

For example, if users open `https://app.example.com`, their API calls should also use `https://app.example.com/api`; only generated short URLs need to use `https://go.example.com`. `API_PROXY_TARGET` is for the Vite development server and does not configure a production web server. The API does not currently serve `apps/web/dist` itself.

**Reverse-proxy limitation:** the API currently checks `Origin` against Fastify's request protocol and host, but Fastify is not configured to trust forwarded proxy headers. When HTTPS terminates at a reverse proxy and the proxy connects to the API over HTTP, browser mutations can be rejected because the API may see `http` while the browser sends an `https` Origin. Before using this topology, configure Fastify to trust only the known proxy address(es), and ensure the proxy overwrites forwarded headers rather than accepting client-supplied values. Do not enable unrestricted proxy trust on an API that can be reached directly. This deployment setting is not implemented yet; see the security notes below.

## Environment variables

The API loads `.env` from the repository root when present. Values already set in the process environment take precedence according to Node's `loadEnvFile` behavior.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_CLIENT` | `sqlite` | Database selection. SQLite is the only implemented adapter. |
| `SQLITE_FILE` | `./data/encurt-ai.sqlite` | SQLite database file path. |
| `PORT` | `3000` | API listening port. |
| `HOST` | `0.0.0.0` | API listening interface. |
| `BASE_URL` | `http://localhost:<PORT>` | Public base URL used to produce short links. |
| `WEB_BASE_URL` | `http://localhost:5173` outside production; unset in production | Frontend origin for browser requests to nonexistent short links. Set this to the public app origin in production. |
| `DATA_ENCRYPTION_KEY` | None in code; supplied by local `.env.example` | 64-character hexadecimal key used to encrypt profile names. |
| `TRUSTED_PROXY_IPS` | Empty (proxy headers are not trusted) | Comma-separated IP addresses or CIDRs for trusted reverse proxies. |
| `API_PROXY_TARGET` | `http://localhost:3000` | API target for the Vite development proxy. |
| `NODE_ENV` | Node.js default | Set to `production` to enable the session cookie's `Secure` attribute. |

Generate a production encryption key with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the key in a secret manager, preserve it between deployments, and do not commit `.env`. Losing or replacing the key without re-encrypting stored names makes those names unreadable. Passwords are stored as Argon2id hashes and are not encrypted or recoverable.

`DB_CLIENT=postgres` currently validates `DATABASE_URL` and then fails explicitly because a PostgreSQL adapter and migrations have not been implemented. It does not fall back to SQLite.

## npm scripts

Run these from the repository root:

| Command | Description |
| --- | --- |
| `npm run dev:api` | Start the API in watch mode. |
| `npm run dev:web` | Start the Vite development server. |
| `npm test` | Run API and web test suites. |
| `npm run typecheck` | Type-check the API TypeScript project. |
| `npm run build` | Build the API and web client. |
| `npm run bootstrap-admin -- --email <email> --password <password>` | Promote an existing account to admin in the configured SQLite database. |

The bootstrap command requires an existing account and a password of at least 12 characters. It does not create a new account. Register first, then run the command. Treat command-line passwords carefully because the shell or process tools may retain command history.

## Main user flows

1. Register or sign in. Public registration always creates a regular user account.
2. From Dashboard, create a link, optionally setting a custom code, expiration, and description.
3. Copy a short URL, edit its description, inspect aggregate click metrics, or pause/reactivate it.
4. Open the avatar menu to navigate to Dashboard, Profile, and (for admins) Admin, or sign out.
5. On Profile, edit the account name or change the password. Changing the password revokes other active sessions and issues a new session to the current browser.
6. Admins can search and page through users and links, change user roles, deactivate/reactivate accounts, manage links, inspect aggregate metrics, and review audit records through the admin API.

## API overview

Authenticated endpoints use the `encurt_session` HttpOnly cookie. Requests that mutate data reject a mismatched `Origin` header when one is supplied. See the API README for detailed request and response behavior.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Check API and database health. |
| `POST` | `/api/auth/register` | Public | Create an account and session. |
| `POST` | `/api/auth/login` | Public | Create a session. |
| `POST` | `/api/auth/logout` | Session if present | Revoke the current session. |
| `GET` | `/api/me` | User | Get the current account. |
| `PATCH` | `/api/me/name` | User | Update the account name. |
| `PATCH` | `/api/me/password` | User | Change password and rotate session. |
| `GET` | `/api/me/urls`, `/api/me/stats` | User | Search own links and view aggregate metrics. |
| `POST` | `/api/urls` | User | Create a short link. |
| `GET`, `PATCH` | `/api/urls/:code` | Owner or admin | Read link details; change active state or description. |
| `GET` | `/api/urls/:code/stats` | Owner or admin | Read daily aggregate link metrics. |
| `GET` | `/:code` | Public | Record an eligible click and redirect with HTTP 302. |
| `GET` | `/api/admin/overview`, `/api/admin/users`, `/api/admin/urls` | Admin | Read aggregate metrics and paginated records. |
| `PATCH` | `/api/admin/users/:id`, `/api/admin/urls/:code` | Admin | Update role/account state or link state. |
| `DELETE` | `/api/admin/urls/:code` | Admin | Delete a link. |

API errors use `{ "error": { "code", "message", "requestId" } }`. The request ID is also included in server-side error logs.
For an unknown short code, browser navigation (`Accept: text/html`) redirects to `${WEB_BASE_URL}/404`; API clients receive the normal JSON 404 response.

## Security and privacy

- Passwords use Argon2id. Session tokens are opaque random values in HttpOnly cookies; only their SHA-256 hashes are stored in the database. Cookies use `SameSite=Lax` and become `Secure` when `NODE_ENV=production`.
- Profile names are encrypted using AES-256-GCM with `DATA_ENCRYPTION_KEY`.
- Authorization is enforced by the API for authenticated routes, admin actions, and link ownership. Public registration cannot assign an admin role.
- Fastify security headers, request validation, parameterized ORM queries, and rate limits are enabled.
- Click tracking stores the link ID and timestamp only. It does not store IP, user-agent, referrer, visitor ID, or query-string data.
- Admin changes are audited. Logs redact cookies, authorization headers, and request URLs.

Before production, review the known limitations in [`apps/api/README.md`](apps/api/README.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md), particularly Origin enforcement when the header is absent, the disabled Content Security Policy configuration, production rate-limit settings, key management/rotation, and the lack of a PostgreSQL adapter. Deploy behind HTTPS and serve the built web assets from an explicitly configured web server or hosting service; the API does not currently serve the Vite build.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

The web workspace runs Vitest with jsdom and Vue Test Utils. The API workspace runs Vitest against unit services, migrations, and Fastify endpoints.

## Further documentation

- [Architecture and security requirements](ARCHITECTURE.md)
- [Product and UI design](DESIGN.md)
- [API development and endpoint notes](apps/api/README.md)
- [User dashboard reference](user-ui.svg)
- [Admin console reference](admin-ui.svg)
