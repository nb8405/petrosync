# PetroSync Reverse Proxy Deployment Assets

These files implement an offline-first reverse proxy layer for a single petrol
pump controller.

- `nginx/conf.d/petrosync-http.conf` goes in `/etc/nginx/conf.d/`.
- `nginx/snippets/*.conf` go in `/etc/nginx/snippets/`.
- `nginx/sites-available/petrosync-lan.conf` is for LAN-only HTTP or private TLS off.
- `nginx/sites-available/petrosync-https.conf` is for internet-facing HTTPS.
- `systemd/petrosync-backend.service` runs the Node.js backend on loopback.
- `env/backend.env.example` is copied to `/etc/petrosync/backend.env`.
- `logrotate/*` go in `/etc/logrotate.d/`.
- `firewall/ufw-petrosync.sh` is an optional UFW baseline.

Production path assumptions:

- App root: `/opt/petrosync`
- Frontend build: `/opt/petrosync/client/build`
- Backend: `/opt/petrosync/server`
- Backend listener: `127.0.0.1:5000`
- Public entry point: NGINX on `80` or `443`

Enable one NGINX site at a time:

```sh
sudo cp deploy/nginx/conf.d/petrosync-http.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/snippets/petrosync-*.conf /etc/nginx/snippets/
sudo cp deploy/nginx/sites-available/petrosync-lan.conf /etc/nginx/sites-available/petrosync.conf
sudo ln -s /etc/nginx/sites-available/petrosync.conf /etc/nginx/sites-enabled/petrosync.conf
sudo nginx -t
sudo systemctl reload nginx
```

For HTTPS, edit `server_name`, certificate paths, and CORS origins first.
