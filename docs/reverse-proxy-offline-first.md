# PetroSync Reverse Proxy and Offline-First Deployment

## Recommendation

Use NGINX as the PetroSync reverse proxy.

NGINX is the best fit for individual petrol pump deployments because it is
stable, widely packaged for offline Linux installations, simple to operate on a
LAN, efficient for serving the React build, and mature as a TLS termination and
reverse proxy layer. Caddy is excellent for automatic internet HTTPS, but that
automation is less useful for offline stations. HAProxy is excellent for high
volume proxying, but it is less convenient for serving static React assets.
Traefik is useful in dynamic container platforms, but it adds operational
complexity that is not needed at one pump.

The supplied NGINX design keeps core pump operations independent of the cloud:

- React static files are served from the local pump controller.
- API calls are proxied to the local Node.js backend.
- PostgreSQL remains local.
- ATOS/ATG and printer integrations remain on the local LAN.
- Internet access is optional and used only for remote access, certificates,
  monitoring, or future synchronization.

Primary deployment files:

- [deploy/nginx/conf.d/petrosync-http.conf](../deploy/nginx/conf.d/petrosync-http.conf)
- [deploy/nginx/sites-available/petrosync-lan.conf](../deploy/nginx/sites-available/petrosync-lan.conf)
- [deploy/nginx/sites-available/petrosync-https.conf](../deploy/nginx/sites-available/petrosync-https.conf)
- [deploy/nginx/snippets/petrosync-proxy.conf](../deploy/nginx/snippets/petrosync-proxy.conf)
- [deploy/nginx/snippets/petrosync-security-headers.conf](../deploy/nginx/snippets/petrosync-security-headers.conf)
- [deploy/systemd/petrosync-backend.service](../deploy/systemd/petrosync-backend.service)
- [deploy/env/backend.env.example](../deploy/env/backend.env.example)
- [deploy/logrotate/petrosync-nginx](../deploy/logrotate/petrosync-nginx)
- [deploy/firewall/ufw-petrosync.sh](../deploy/firewall/ufw-petrosync.sh)

## Single Pump Architecture

```text
┌────────────────────────────── Local petrol pump LAN ──────────────────────────────┐
│                                                                                   │
│  Cashier PCs / tablets / office PC                                                │
│            │                                                                      │
│            │  http://petrosync.local or https://pump.example.com                  │
│            ▼                                                                      │
│  ┌──────────────────────── Pump controller / local server ─────────────────────┐  │
│  │                                                                            │  │
│  │  NGINX reverse proxy                                                       │  │
│  │  - serves React build                                                       │  │
│  │  - terminates TLS when enabled                                              │  │
│  │  - rate limits and logs requests                                            │  │
│  │  - proxies /api and /healthz only to Node                                   │  │
│  │          │                                                                 │  │
│  │          │ 127.0.0.1:5000                                                   │  │
│  │          ▼                                                                 │  │
│  │  Node.js PetroSync backend                                                  │  │
│  │          │                                                                 │  │
│  │          │ 127.0.0.1:5432 or local Unix/private socket                      │  │
│  │          ▼                                                                 │  │
│  │  PostgreSQL database                                                        │  │
│  │                                                                            │  │
│  └───────────────┬─────────────────────┬──────────────────────┬───────────────┘  │
│                  │                     │                      │                  │
│             ATOS/ATG devices       Printers              Local backups            │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘

Optional internet path:

Remote admin/VPN/monitoring ──► router/firewall ──► NGINX 443 only
```

Node and PostgreSQL are not exposed to LAN users. The backend now supports a
production loopback default through [server/index.js](../server/index.js)
and the environment template sets `HOST=127.0.0.1`.

## Future Multi-Branch Architecture

```text
Branch A pump LAN ─┐
Branch B pump LAN ─┼── outbound sync/VPN tunnel ──► central sync gateway/API
Branch C pump LAN ─┘                                  │
                                                       ▼
                                            central dashboard database
                                            monitoring and alerting
```

Recommended future pattern:

- Keep each branch operationally independent with its own NGINX, Node.js, and
  PostgreSQL.
- Use outbound-only sync jobs from each branch so fuel sales continue when the
  internet is down.
- Add a central API gateway later for remote dashboards and monitoring.
- Add multiple backend instances only when the pump controller actually runs
  more than one Node.js process. The current `upstream petrosync_backend` block
  is already structured so additional `server` lines can be added later.
- Prefer VPN or private network access for remote administration. Avoid exposing
  raw PostgreSQL, ATOS/ATG, or printer services to the internet.

## NGINX Configuration

### HTTP Context

`server_tokens off` hides the exact NGINX version from error pages and response
headers.

`log_format petrosync_json` writes structured access logs with timestamp,
remote address, request id, host, method, URI, status, bytes, request duration,
upstream address, upstream status, upstream duration, referer, and user agent.
This makes field troubleshooting easier and keeps the logs suitable for future
shipping into a central dashboard.

`map $http_upgrade $connection_upgrade` creates a safe `Connection` header for
WebSocket upgrades. Normal HTTP requests send `close`; WebSocket requests send
`upgrade`.

`limit_req_zone $binary_remote_addr zone=petrosync_api:10m rate=10r/s` creates
a shared rate-limit bucket for API traffic per client IP.

`limit_req_zone $binary_remote_addr zone=petrosync_auth:10m rate=2r/s` applies
a stricter bucket for login and token endpoints.

`limit_conn_zone $binary_remote_addr zone=petrosync_addr:10m` enables per-IP
connection limiting.

`upstream petrosync_backend` defines the private backend pool. Today it has one
server, `127.0.0.1:5000`. `keepalive 32` keeps upstream connections reusable,
reducing connection churn. `max_fails=3 fail_timeout=10s` avoids repeatedly
sending traffic to a backend that is temporarily failing.

### Proxy Snippet

`proxy_http_version 1.1` is required for upstream keepalive and WebSocket
upgrade support.

`proxy_set_header Host $host` preserves the host requested by the browser.

`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, and
`X-Forwarded-Port` pass client and scheme information to Express. The backend
trusts loopback/private proxies in production.

`X-Request-ID $request_id` gives each request a trace identifier visible at the
proxy and available to the backend.

`Upgrade` and `Connection` headers allow future WebSocket endpoints to work
without changing the proxy.

`proxy_connect_timeout 5s`, `proxy_send_timeout 60s`, and
`proxy_read_timeout 60s` keep failed backend calls from hanging too long while
allowing normal local operations to complete.

`proxy_buffering off` avoids buffering dynamic operational API responses.

`proxy_request_buffering on` lets NGINX receive and size-check the request body
before sending it upstream.

`proxy_redirect off` prevents upstream redirects from being rewritten
unexpectedly.

### Security Headers

`X-Frame-Options DENY` blocks clickjacking by preventing framing.

`X-Content-Type-Options nosniff` prevents MIME sniffing.

`Referrer-Policy no-referrer` avoids leaking internal pump URLs in referrers.

`Permissions-Policy geolocation=(), microphone=(), camera=()` disables browser
features the app does not need.

`Content-Security-Policy` limits content to the same origin, permits inline
styles for the current React styling approach, permits local/data images and
fonts, restricts API/WebSocket connections to the same origin, blocks framing,
blocks plugins, and limits form submission to the same origin.

`Strict-Transport-Security` is enabled only on the HTTPS server. It must not be
sent from LAN-only HTTP deployments because browsers can remember HSTS and later
refuse plain HTTP access to an intentionally offline station.

### LAN Site

`listen 80 default_server` exposes PetroSync on the LAN without requiring an
internet certificate.

`server_name petrosync.local _` accepts a friendly LAN hostname and unmatched
LAN hostnames/IP access.

`root /opt/petrosync/client/build` serves the production React build locally.

`access_log` and `error_log` write centralized NGINX logs for the application.

`client_max_body_size 25m` matches the backend JSON body limit and supports
backup/restore metadata without allowing unbounded uploads.

`keepalive_timeout 65s` and `send_timeout 60s` are conservative LAN-friendly
timeouts.

`limit_conn petrosync_addr 50` caps concurrent connections per client IP.

`gzip on` and related `gzip_*` directives compress text, JSON, JavaScript, CSS,
SVG, fonts, and WASM responses. Brotli is provided as an optional snippet only
because many stock NGINX builds do not include the Brotli module.

`location = /healthz` proxies the lightweight backend health check and disables
access logging for routine probes.

`location ^~ /api/auth/` uses the stricter auth rate limit and proxies to Node.

`location ^~ /api/` proxies all dynamic API calls, rate limits them, and sets
`Cache-Control: no-store`.

The static asset location caches only fingerprintable frontend assets:
JavaScript, CSS, images, icons, fonts, source maps, and similar files.

`location = /index.html` and `location /` set `Cache-Control: no-store` so app
shell updates are picked up after deployments. `try_files $uri $uri/ /index.html`
supports React Router deep links.

### HTTPS Site

The first server listens on port 80 and redirects normal traffic to HTTPS. The
ACME challenge path stays on HTTP so Let's Encrypt renewal can work.

The second server listens on `443 ssl http2`, serves the React build, terminates
TLS, adds HSTS, and uses the same proxy/static-cache behavior as the LAN site.

`ssl_certificate` and `ssl_certificate_key` point to certificate files. Replace
`pump.example.com` before deployment.

`ssl_session_cache`, `ssl_session_timeout`, and `ssl_session_tickets off`
improve TLS performance while avoiding reusable ticket keys.

`ssl_protocols TLSv1.2 TLSv1.3` disables old TLS versions.

`ssl_stapling on`, `ssl_stapling_verify on`, `resolver`, and `resolver_timeout`
support OCSP stapling for internet-facing certificates. If the station has no
internet, use the LAN config or disable stapling for a private certificate.

## Certificate Management

### LAN-Only

Use one of these modes:

- Plain HTTP on a trusted private LAN: simplest and fully offline.
- Locally managed certificate from a station or company CA: install the CA on
  cashier/admin devices and use the HTTPS site with local certificate paths.
- Self-signed certificate: acceptable for lab use, but not ideal for operators
  because browser warnings train unsafe behavior.

For LAN-only HTTP:

- Use [petrosync-lan.conf](../deploy/nginx/sites-available/petrosync-lan.conf).
- Keep `AUTH_COOKIE_ENABLED=false` in production HTTP mode. The backend
  intentionally requires secure cookies to be HTTPS-only.
- Set `CORS_ORIGINS` to the exact LAN URLs, for example
  `http://petrosync.local,http://192.168.1.10`.
- Do not enable HSTS.

For private LAN HTTPS:

- Use [petrosync-https.conf](../deploy/nginx/sites-available/petrosync-https.conf)
  with local certificate paths.
- Use an internal DNS name if possible.
- Set `AUTH_COOKIE_SECURE=true`.
- Keep the app functional if the internet is disconnected by using certificates
  that can be renewed locally or have a planned operational renewal process.

### Internet-Facing

Use HTTPS only:

- Put the pump behind a router/firewall or VPN.
- Expose only ports 80 and 443 to NGINX.
- Do not expose Node.js `5000`, PostgreSQL `5432`, ATOS/ATG devices, or printers.
- Use Let's Encrypt when the domain can reach the station or use DNS-01
  validation when inbound HTTP is not available.
- Set `CORS_ORIGINS=https://pump.example.com`.
- Set `AUTH_COOKIE_SECURE=true`.
- Keep HSTS enabled after confirming HTTPS is stable.

For remote administration, VPN is preferred over public exposure.

## Backend Compatibility

The React app already uses relative `/api` calls in production through
[client/src/utils/apiClient.js](../client/src/utils/apiClient.js).
NGINX serves the React build and proxies `/api/*` to Node, so the frontend does
not need a hard-coded backend host.

The backend now supports:

- `HOST=127.0.0.1` so Node binds only to loopback in production.
- `TRUST_PROXY=loopback, linklocal, uniquelocal` so Express reads proxy IP and
  scheme safely from NGINX.
- `/healthz` for local proxy/service checks without exposing detailed system
  health.

Keep dynamic operational data uncached. The NGINX config sets `no-store` on all
API responses so fuel sales, inventory, DSR entries, backups, reports, and
financial data are always fetched from the backend.

## Deployment Steps

Build and install the app:

```sh
cd /opt/petrosync/client
npm ci
npm run build

cd /opt/petrosync/server
npm ci --omit=dev
npm run migrate
```

Create the service user and directories:

```sh
sudo useradd --system --home /opt/petrosync --shell /usr/sbin/nologin petrosync
sudo mkdir -p /etc/petrosync /opt/petrosync/server/logs /opt/petrosync/server/backups /opt/petrosync/server/exports
sudo chown -R petrosync:petrosync /opt/petrosync/server/logs /opt/petrosync/server/backups /opt/petrosync/server/exports
```

Install the backend service:

```sh
sudo cp deploy/env/backend.env.example /etc/petrosync/backend.env
sudo editor /etc/petrosync/backend.env
sudo cp deploy/systemd/petrosync-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now petrosync-backend
```

Install NGINX LAN mode:

```sh
sudo cp deploy/nginx/conf.d/petrosync-http.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/snippets/petrosync-*.conf /etc/nginx/snippets/
sudo cp deploy/nginx/sites-available/petrosync-lan.conf /etc/nginx/sites-available/petrosync.conf
sudo ln -s /etc/nginx/sites-available/petrosync.conf /etc/nginx/sites-enabled/petrosync.conf
sudo nginx -t
sudo systemctl reload nginx
```

Install log rotation:

```sh
sudo cp deploy/logrotate/petrosync-nginx /etc/logrotate.d/
sudo cp deploy/logrotate/petrosync-backend /etc/logrotate.d/
sudo logrotate -d /etc/logrotate.d/petrosync-nginx
```

Apply firewall policy after confirming the LAN subnet:

```sh
cd /opt/petrosync
sudo LAN_CIDR=192.168.1.0/24 sh deploy/firewall/ufw-petrosync.sh
```

## Testing

Backend should listen only on loopback:

```sh
ss -ltnp | grep ':5000'
```

Expected: `127.0.0.1:5000`, not `0.0.0.0:5000`.

Proxy health check:

```sh
curl -i http://127.0.0.1/healthz
```

Expected: `200 OK` and JSON with `ok: true`.

API proxy:

```sh
curl -i http://127.0.0.1/api/auth/setup-status
```

Expected: a backend JSON response and security headers.

Static app:

```sh
curl -I http://127.0.0.1/
curl -I http://127.0.0.1/assets/some-built-file.js
```

Expected: app shell is `no-store`; static assets are cacheable.

Direct backend from another LAN device:

```sh
curl -i http://PUMP_SERVER_IP:5000/healthz
```

Expected: connection refused or blocked.

NGINX validation:

```sh
sudo nginx -t
sudo tail -f /var/log/nginx/petrosync-access.log
sudo journalctl -u petrosync-backend -f
```

Offline test:

1. Disconnect the internet uplink, leaving the LAN switch/router active.
2. Open the app from a cashier device.
3. Login, create/update DSR entries, run reports, print, and verify ATOS/ATG
   local device behavior.
4. Confirm no cloud service is required for the workflow.

## Rollback

Rollback NGINX:

```sh
sudo cp /etc/nginx/sites-available/petrosync.conf /etc/nginx/sites-available/petrosync.conf.rollback
sudo rm -f /etc/nginx/sites-enabled/petrosync.conf
sudo nginx -t
sudo systemctl reload nginx
```

Rollback backend service changes:

```sh
sudo systemctl stop petrosync-backend
sudo cp /etc/petrosync/backend.env.bak /etc/petrosync/backend.env
sudo systemctl start petrosync-backend
```

Emergency direct-backend access for a controlled maintenance window:

1. Temporarily set `HOST=0.0.0.0`.
2. Restrict firewall access to one admin machine.
3. Restart the backend.
4. Revert to `HOST=127.0.0.1` immediately after maintenance.

## Troubleshooting

`502 Bad Gateway`:

- Check `systemctl status petrosync-backend`.
- Check `curl http://127.0.0.1:5000/healthz` on the server.
- Confirm `upstream petrosync_backend` points to the configured `HOST` and
  `PORT`.

Browser cannot open app on LAN:

- Confirm the client build exists at `/opt/petrosync/client/build`.
- Check `nginx -t`.
- Check firewall rules allow LAN clients to ports 80 or 443.
- Confirm DNS or hosts file for `petrosync.local`, or use the server IP.

Login fails after enabling HTTPS:

- Confirm `CORS_ORIGINS` exactly matches the browser origin.
- Confirm `AUTH_COOKIE_SECURE=true` for HTTPS.
- Confirm browser time and server time are correct.

LAN HTTP stops working after HTTPS testing:

- The browser may have stored HSTS for the hostname.
- Use a different LAN hostname or clear the browser HSTS entry.
- Do not send HSTS from the LAN HTTP site.

Large request rejected:

- Check NGINX `client_max_body_size`.
- Check backend `JSON_BODY_LIMIT`.
- Keep both aligned.

Rate limit false positives:

- Adjust `rate=`, `burst=`, and `limit_conn` in
  [petrosync-http.conf](../deploy/nginx/conf.d/petrosync-http.conf)
  and the site config.
- If all clients appear as one IP because of another upstream proxy, configure
  real IP handling only for trusted proxy addresses.

TLS renewal fails:

- Confirm DNS points to the pump for HTTP-01, or use DNS-01 validation.
- Confirm `/.well-known/acme-challenge/` is reachable on port 80.
- For offline/private certificates, use the local CA renewal process instead of
  Let's Encrypt.

## Operational Rules

- Only NGINX listens on LAN-facing HTTP/HTTPS ports.
- Node.js binds to `127.0.0.1`.
- PostgreSQL binds to localhost or a private socket.
- API responses are never cached.
- Static frontend assets may be cached.
- Core pump workflows must never depend on internet connectivity.
- Remote access should be VPN-first.
- Cloud synchronization, when added, should be outbound and retryable.
