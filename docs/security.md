# Security notes

What was checked, what was decided, and what is knowingly missing. This is a portfolio project without users or
authentication, so the goal is sound defaults, not a hardened production setup.

## Checked

| Area | Result |
|---|---|
| Secrets in git | `.env` files are git-ignored; only `.env.example` files with placeholders are committed. The whole history was searched for passwords and webhook secrets: none. Docker images never contain `.env` (`.dockerignore`). |
| Secrets in logs | Database URLs and webhook secrets are never logged; generated webhook secrets aren't printed. A test checks that no customer name, email or address reaches the logs. |
| Personal data | Demo data is invented (`@example.com` addresses). Request logs drop the query string, because `?search=` can contain a name. |
| Input validation | Every body and query goes through a Zod schema with length limits; unknown fields are rejected; totals are computed by the server. Webhook bodies are only parsed after the signature checks out. |
| Error responses | One JSON format with a code, a message and a request id. Stack traces and database driver messages go to the log only, never into a response. |
| SQL injection | Every query uses parameters (`$1`, `$2`); column names come from a fixed list in the code. `LIKE` wildcards in searches are escaped. |
| Webhooks | HMAC-SHA256 over `timestamp.rawBody`, `crypto.timingSafeEqual`, a 5-minute replay window, deduplication by event id ([webhooks.md](webhooks.md)). |
| Body limits | JSON bodies up to 100 kB, webhook bodies up to 64 kB, answered with `413 PAYLOAD_TOO_LARGE`. nginx allows 2 MB, so the backend's JSON error is what the client sees. |
| Dependencies | `npm audit`: 0 known vulnerabilities in backend, frontend and e2e (including dev dependencies). |
| Containers | Backend runs as the `node` user, nginx as an unprivileged user. Database and app ports are bound to localhost; the backend isn't published at all. |

## Security headers: why not helmet

The browser loads the app from nginx (Docker) or Vite (development). The API only returns JSON. So the headers are
set where they matter:

- **nginx** ([`frontend/security-headers.conf`](../frontend/security-headers.conf)), for the HTML and the assets:
  - `Content-Security-Policy`: only our own scripts, styles, fonts and API, and no framing. The one inline script (the theme, applied before the first paint) is allowed by its hash. A test fails if the script changes and the hash doesn't.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that turns off camera, microphone, geolocation and payment.
  - No version in the `Server` header.
- **The API** ([`backend/src/middleware/securityHeaders.ts`](../backend/src/middleware/securityHeaders.ts)): `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`, because responses contain customer data. `X-Powered-By` is off.

helmet would add one dependency to the API for headers that mostly protect HTML pages, which the API doesn't serve.

**CORS** isn't enabled: the browser always talks to the same origin, and nginx or Vite forward `/api`. The API sends no `Access-Control-Allow-Origin` header, so other sites can't read its answers ([frontend.md](frontend.md#why-there-is-no-cors-setup)).

## Knowingly missing

- **No authentication or authorization.** Anyone who can reach the app can create, pay and ship orders. The Docker setup only listens on localhost.
- **No rate limiting.** Nothing stops many requests in a row; a reverse proxy or `express-rate-limit` would be the next step before exposing it.
- **No HTTPS, so no HSTS.** TLS would be terminated by a proxy or load balancer in front of nginx; HSTS belongs there.
- **Webhook secrets from the environment.** Fine for one server; a secrets manager and rotation would come with real couriers.
- **The webhook simulator is a dev tool.** It is off by default in production. The Docker demo turns it on on purpose, and it is labelled in the UI.
