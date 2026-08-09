# Running TimeClockPlus as a systemd Service

This keeps the app (the single Node process that serves both `/api` and
the web UI) running continuously on a Linux server: it starts on boot,
restarts automatically if it crashes, and its logs go to `journalctl`.

A ready-to-edit unit file is provided at
[`deploy/systemd/timeclockplus.service`](../deploy/systemd/timeclockplus.service).

## 1. Create a dedicated service user

Running as a non-root user limits the blast radius if the app is ever
compromised.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin timeclockplus
```

## 2. Deploy the app

```bash
sudo mkdir -p /opt/timeclockplus
sudo chown timeclockplus:timeclockplus /opt/timeclockplus

# As the timeclockplus user (or via sudo -u timeclockplus -H bash):
sudo -u timeclockplus -H bash -c '
  git clone https://github.com/umershahid84/TimeClockPlus.git /opt/timeclockplus
  cd /opt/timeclockplus
  npm install
  npm run build
'
```

Copy `.env.example` to `.env` in `/opt/timeclockplus` and fill in real
values (database, JWT secret, email, etc. - see
[`SETUP_LOCAL.md`](SETUP_LOCAL.md) and [`DEPLOY_CLOUD.md`](DEPLOY_CLOUD.md)
for what each variable means). Make sure it's only readable by the
service user, since it holds secrets:

```bash
sudo chown timeclockplus:timeclockplus /opt/timeclockplus/.env
sudo chmod 600 /opt/timeclockplus/.env
```

Run migrations and the initial admin setup once, as the service user:

```bash
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npx prisma migrate deploy'
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npm run setup -- --email=admin@example.com'
```

## 3. Install the systemd unit

```bash
sudo cp /opt/timeclockplus/deploy/systemd/timeclockplus.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Before enabling it, open `/etc/systemd/system/timeclockplus.service` and check:

- `User=` / `Group=` match the user you created in step 1.
- `WorkingDirectory=` matches where you deployed the app.
- `ExecStart=` points at the right `node` binary - run
  `sudo -u timeclockplus which node` and update the path if it isn't
  `/usr/bin/node` (common with nvm-based Node installs, which put `node`
  under the user's home directory instead).
- The `mariadb.service` dependency in `After=` matches your system's
  MariaDB unit name (`mariadb.service` or `mysql.service` - check with
  `systemctl list-units | grep -i sql`), or remove that dependency if
  MariaDB runs on a different host.

## 4. Start it and enable it on boot

```bash
sudo systemctl enable --now timeclockplus
sudo systemctl status timeclockplus
```

You should see `active (running)`. Visit the app at
`http://<server>:<PORT>` (default port 4000, from `.env`).

## 5. Logs

```bash
journalctl -u timeclockplus -f          # follow live
journalctl -u timeclockplus --since today
```

## 6. Deploying an update

```bash
sudo -u timeclockplus -H bash -c '
  cd /opt/timeclockplus
  git pull
  npm install
  npm run build
  npx prisma migrate deploy
'
sudo systemctl restart timeclockplus
```

## 7. Common commands

| Action | Command |
|---|---|
| Stop | `sudo systemctl stop timeclockplus` |
| Restart | `sudo systemctl restart timeclockplus` |
| Disable on boot | `sudo systemctl disable timeclockplus` |
| Check status | `sudo systemctl status timeclockplus` |

## 8. HTTPS

systemd keeps the app itself running, but it doesn't terminate TLS. Put a
reverse proxy (nginx, Caddy, etc.) in front of it on port 443 and forward
to the app's `PORT`; Caddy in particular can obtain and renew a
Let's Encrypt certificate automatically with a one-line config. This is a
separate concern from the service staying up, and can be added
independently of everything above.
