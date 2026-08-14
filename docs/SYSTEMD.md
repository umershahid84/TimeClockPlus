# Running TimeClockPlus as a systemd Service

This keeps the app (the single Node process that serves both `/api` and
the web UI) running continuously on a Linux server: it starts on boot,
restarts automatically if it crashes, and its logs go to `journalctl`.

**`npm run build` installs/refreshes the systemd unit for you** when run
as root (see "How the automatic install works" below) - so after the
one-time setup below, deploying an update is just `git pull`,
`sudo npm run build`, and `sudo systemctl restart timeclockplus`, and
starting it fresh is just `sudo systemctl start timeclockplus`.

## 1. Create a dedicated service user

The app itself still runs as this unprivileged account at runtime (via
`User=`/`Group=` in the unit file) - only the build/install step below
runs as root, to be able to write `/etc/systemd/system` and fix file
ownership.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin timeclockplus
```

## 2. Clone and configure the app

```bash
sudo mkdir -p /opt/timeclockplus
sudo git clone https://github.com/umershahid84/TimeClockPlus.git /opt/timeclockplus
cd /opt/timeclockplus
sudo cp .env.example .env
sudo vim .env   # fill in DB_*, JWT_SECRET, EMAIL_*, etc. - see SETUP_LOCAL.md / DEPLOY_CLOUD.md
```

## 3. Build (this installs the systemd unit too)

```bash
sudo npm install
sudo npm run build
```

Because this ran as root, `npm run build`'s `postbuild` step
(`scripts/postbuild-systemd.js`) automatically:

- writes `/etc/systemd/system/timeclockplus.service` from
  [`deploy/systemd/timeclockplus.service`](../deploy/systemd/timeclockplus.service),
  filling in `User=`/`Group=timeclockplus`, `WorkingDirectory=` (wherever
  you cloned the app), and `ExecStart=` (the exact `node` binary that ran
  the build - no more path guessing),
- runs `chown -R timeclockplus:timeclockplus` on `dist/`, `node_modules/`,
  `prisma/`, `package.json`, `package-lock.json`, and `.env`, since the
  service itself runs as the unprivileged user, not root,
- runs `systemctl daemon-reload` and `systemctl enable timeclockplus`
  (so it also starts on boot from here on).

If your service account isn't named `timeclockplus`, set
`TIMECLOCKPLUS_SERVICE_USER` (and `TIMECLOCKPLUS_SERVICE_GROUP` if it
differs) before running the build, e.g.
`sudo TIMECLOCKPLUS_SERVICE_USER=tcp npm run build`.

Double-check the `mariadb.service` dependency in the installed unit's
`After=` line matches your system's MariaDB unit name (`mariadb.service`
or `mysql.service` - check with `systemctl list-units | grep -i sql`), or
remove that line if MariaDB runs on a different host.

## 4. Run migrations and create the initial admin account

One-time, and after every schema change - needs the real database, so
this stays a deliberate manual step rather than something the build does
silently:

```bash
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npx prisma migrate deploy'
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npm run setup -- --email=admin@example.com'
```

## 5. Start it

```bash
sudo systemctl start timeclockplus
sudo systemctl status timeclockplus
```

You should see `active (running)`. Visit the app at
`http://<server>:<PORT>` (default port 4000, from `.env`). It's already
enabled for boot from step 3, so this is the only command needed to start
it from here on (after a reboot, a manual stop, etc.).

## 6. Logs

```bash
journalctl -u timeclockplus -f          # follow live
journalctl -u timeclockplus --since today
```

## 7. Deploying an update

```bash
cd /opt/timeclockplus
sudo git pull
sudo npm install
sudo npm run build              # rebuilds + refreshes the unit + re-chowns + re-enables
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npx prisma migrate deploy'
sudo systemctl restart timeclockplus
```

## How the automatic install works (and when it doesn't)

`postbuild` (wired up in `package.json`, implemented in
[`scripts/postbuild-systemd.js`](../scripts/postbuild-systemd.js)) runs
after every `npm run build`, on every platform, but only *acts* when
`process.platform === "linux"` **and** it's running as root (`process.getuid() === 0`).
Everywhere else - a contributor's laptop, `npm run dev`, CI, macOS/Windows,
or `npm run build` without `sudo` - it prints a one-line note and exits
`0`: your build output is unaffected either way, and the build never
fails because of this step.

If you'd rather keep the original fully-separated-privilege workflow
(build only ever runs as the unprivileged `timeclockplus` user, you
install/edit the unit by hand), that still works exactly as before -
just don't run `npm install`/`npm run build` as root, and follow the
manual "Install the systemd unit" steps: `sudo cp
deploy/systemd/timeclockplus.service /etc/systemd/system/`, edit
`User=`/`Group=`/`WorkingDirectory=`/`ExecStart=` by hand, then
`sudo systemctl daemon-reload && sudo systemctl enable --now timeclockplus`.

## 8. Common commands

| Action | Command |
|---|---|
| Stop | `sudo systemctl stop timeclockplus` |
| Restart | `sudo systemctl restart timeclockplus` |
| Disable on boot | `sudo systemctl disable timeclockplus` |
| Check status | `sudo systemctl status timeclockplus` |

## 9. HTTPS

systemd keeps the app itself running, but it doesn't terminate TLS. Put a
reverse proxy (nginx, Caddy, etc.) in front of it on port 443 and forward
to the app's `PORT`; Caddy in particular can obtain and renew a
Let's Encrypt certificate automatically with a one-line config. This is a
separate concern from the service staying up, and can be added
independently of everything above.

## 10. Troubleshooting a failed start

Always start with the actual error, not guesswork:

```bash
sudo systemctl status timeclockplus
journalctl -u timeclockplus -n 50 --no-pager
```

Common causes, in order of likelihood:

- **`npm run build` was never run as root, or failed.** The automatic
  unit install/chown/enable (step 3) only happens when `sudo npm run
  build` succeeds as root. If you ran `npm install`/`npm run build`
  without `sudo`, or the build itself errored out, `dist/server/index.js`
  (the `ExecStart=` target) won't exist and the unit won't be installed
  at all yet. Check with
  `sudo -u timeclockplus test -f /opt/timeclockplus/dist/server/index.js && echo OK`,
  and re-run `sudo npm run build` from `/opt/timeclockplus` if it's missing.
- **`.env` missing or incomplete.** The app reads its configuration from
  `WorkingDirectory/.env` (step 2) and throws
  `Missing required environment variable: ...` on boot if a required
  variable (e.g. `DB_USER`, `JWT_SECRET`) isn't set. Confirm the file
  exists and is readable by the service user:
  `sudo -u timeclockplus cat /opt/timeclockplus/.env`.
- **Wrong `node` path, or a stale hand-edited unit.** If you followed the
  automated flow (step 3), `ExecStart=` was already filled in with the
  exact `node` binary that ran the build, so this shouldn't happen -
  re-run `sudo npm run build` to refresh it. If you're on the manual
  workflow instead, compare `sudo -u timeclockplus which node` against
  the `ExecStart=` line in `/etc/systemd/system/timeclockplus.service`,
  fix it by hand, then
  `sudo systemctl daemon-reload && sudo systemctl restart timeclockplus`.
- **Database not reachable.** If MariaDB isn't running yet, or
  `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` in `.env` are wrong,
  the log will show a Prisma "Can't reach database server" error.
  `Restart=on-failure` will keep retrying, but only up to
  `StartLimitBurst=5` times within `StartLimitIntervalSec=60` - after
  that the unit is left in a `failed` state and needs
  `sudo systemctl reset-failed timeclockplus` once the database is
  actually reachable, followed by `sudo systemctl start timeclockplus`.
- **No schema / no admin account yet.** Building (step 3) only installs
  the code - you still need to run step 4
  (`npx prisma migrate deploy` and `npm run setup -- --email=...`) once
  against the real database before the app has anything to serve.
- **Permissions on `WorkingDirectory` or `.env`.** `sudo npm run build`
  chowns `dist/`, `node_modules/`, `prisma/`, `package.json`,
  `package-lock.json`, and `.env` to the service user automatically, but
  only those - if you added other files the app needs to read at
  runtime, or ran `git pull`/edited files as a different user afterward,
  re-run `sudo npm run build`, or manually
  `sudo chown -R timeclockplus:timeclockplus /opt/timeclockplus`.
- **`User=`/`Group=`/`WorkingDirectory=` in the unit file don't match**
  where you actually deployed the app. On the automated flow this is
  fixed by re-running `sudo npm run build` (optionally with
  `TIMECLOCKPLUS_SERVICE_USER`/`TIMECLOCKPLUS_SERVICE_GROUP` set); on the
  manual flow, re-copy and re-edit
  `/etc/systemd/system/timeclockplus.service` by hand - either way the
  running config is whatever `daemon-reload` last picked up from
  `/etc/systemd/system/`, not the copy in the repo.

Once you've made a change, always re-run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart timeclockplus
sudo systemctl status timeclockplus
```
