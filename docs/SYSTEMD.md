# Running TimeClockPlus as a systemd Service

This keeps the app (the single Node process that serves both `/api` and
the web UI) running continuously on a Linux server: it starts on boot,
restarts automatically if it crashes, and its logs go to `journalctl`.

## The minimal flow: 3 commands, wherever you extracted the app

No `git clone` needed, no dedicated `/opt` directory, no separate service
account to create first. Download the repo (as a zip, or however you
like) and extract it anywhere - your home directory is fine - then from
inside that folder:

```bash
cp .env.example .env
vim .env              # fill in DB_*, JWT_SECRET, EMAIL_*, etc. - see SETUP_LOCAL.md / DEPLOY_CLOUD.md
npm run prisma:deploy
npm run setup -- --email=admin@example.com

npm install
npm run build
sudo systemctl start timeclockplus
```

That's the whole thing. `npm run build`'s `postbuild` step
(`scripts/postbuild-systemd.js`) installs the systemd unit for you:

- writes `/etc/systemd/system/timeclockplus.service` with `WorkingDirectory=`
  set to wherever you extracted the app and `ExecStart=` set to the exact
  `node` binary that ran the build - no path guessing, no fixed location,
- sets `User=`/`Group=` to **you** (whoever ran the build) unless you've
  set up a dedicated service account (see "Optional hardening" below),
- runs `systemctl daemon-reload` and `systemctl enable timeclockplus` so
  it also starts on boot from here on.

Since this step needs root to write `/etc/systemd/system`, and you're
intentionally not prefixing `npm run build` itself with `sudo`, the
script shells out to `sudo` internally just for that part - so **the
first time**, `npm run build` will pop up your normal `sudo` password
prompt partway through. That's expected; sudo caches it for a few
minutes, so `sudo systemctl start timeclockplus` right after usually
won't ask again.

```bash
sudo systemctl status timeclockplus
journalctl -u timeclockplus -f
```

You should see `active (running)`. Visit the app at
`http://<server>:<PORT>` (default port 4000, from `.env`).

**Updating later** is the same shape: `npm install && npm run build`
(rebuilds and refreshes the unit in one step) then
`sudo systemctl restart timeclockplus`. Re-run `npm run prisma:deploy`
first if the update includes a schema change.

## Optional hardening: dedicated service account + fixed install path

The minimal flow above runs the app as your own login user, which is
fine for a lot of setups but means the Node process has your full user
permissions. If you'd rather it run as a locked-down account with no
shell and nothing else, set that account up **before** your first
`npm install`/`npm run build`, and the same 3-command flow picks it up
automatically - no extra flags needed:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin timeclockplus
sudo mkdir -p /opt/timeclockplus
sudo chown timeclockplus:timeclockplus /opt/timeclockplus
# extract the app into /opt/timeclockplus, then cd into it
```

From here, run the same steps as above (`cp .env.example .env` and edit
it, `npm run prisma:deploy`, `npm run setup`, `npm install`, `npm run
build`, `sudo systemctl start timeclockplus`) as whichever user owns the
files - `npm run build`'s postbuild step detects that the `timeclockplus`
account already exists and uses it for `User=`/`Group=` instead of
defaulting to you, and `chown -R`s `dist/`, `node_modules/`, `prisma/`,
`package.json`, `package-lock.json`, and `.env` to that account so the
unprivileged service process can actually read them.

If your dedicated account isn't named `timeclockplus`, set
`TIMECLOCKPLUS_SERVICE_USER` (and `TIMECLOCKPLUS_SERVICE_GROUP` if it
differs) before building, e.g.
`TIMECLOCKPLUS_SERVICE_USER=tcp npm run build`.

Either way, double-check the `mariadb.service` dependency in the
installed unit's `After=` line matches your system's MariaDB unit name
(`mariadb.service` or `mysql.service` - check with
`systemctl list-units | grep -i sql`), or remove that line if MariaDB
runs on a different host.

## How the automatic install works (and when it doesn't)

`postbuild` (wired up in `package.json`, implemented in
[`scripts/postbuild-systemd.js`](../scripts/postbuild-systemd.js)) runs
after every `npm run build`, on every platform, but only *acts* when
`process.platform === "linux"`. On macOS/Windows, in CI, or anywhere the
`deploy/systemd/timeclockplus.service` template isn't present, it prints
nothing extra and exits `0` - your build output is unaffected either
way, and the build never fails because of this step.

On Linux it always tries to install/refresh the unit: as a direct file
write if `npm run build` itself was run as root (`sudo npm install &&
sudo npm run build`), or via an internal `sudo` call (prompting for your
password in the terminal) otherwise. If `sudo` isn't available, or you
don't have permission to use it, the systemd steps fail gracefully with
a clear message and manual fallback command - your build output is still
there either way, install the unit by hand with:
`sudo cp deploy/systemd/timeclockplus.service /etc/systemd/system/`, edit
`User=`/`Group=`/`WorkingDirectory=`/`ExecStart=` to match your install,
then `sudo systemctl daemon-reload && sudo systemctl enable --now
timeclockplus`.

## Common commands

| Action | Command |
|---|---|
| Stop | `sudo systemctl stop timeclockplus` |
| Restart | `sudo systemctl restart timeclockplus` |
| Disable on boot | `sudo systemctl disable timeclockplus` |
| Check status | `sudo systemctl status timeclockplus` |
| Logs (live) | `journalctl -u timeclockplus -f` |
| Logs (today) | `journalctl -u timeclockplus --since today` |

## HTTPS

systemd keeps the app itself running, but it doesn't terminate TLS. Put a
reverse proxy (nginx, Caddy, etc.) in front of it on port 443 and forward
to the app's `PORT`; Caddy in particular can obtain and renew a
Let's Encrypt certificate automatically with a one-line config. This is a
separate concern from the service staying up, and can be added
independently of everything above.

## Troubleshooting a failed start

Always start with the actual error, not guesswork:

```bash
sudo systemctl status timeclockplus
journalctl -u timeclockplus -n 50 --no-pager
```

Common causes, in order of likelihood:

- **"Unit timeclockplus.service not loaded" / not found.** The unit was
  never installed on *this* machine - each server needs its own `npm run
  build` run against its own copy of the app; nothing carries over from
  another host. Check `ls -la /etc/systemd/system/timeclockplus.service`;
  if it's missing, `cd` into the folder where you extracted the app on
  this machine and run `npm install && npm run build`.
- **`npm run build` never actually finished, or was never run here.**
  `dist/server/index.js` (the `ExecStart=` target) only exists after a
  successful build. Check with
  `test -f dist/server/index.js && echo OK` from the app's folder, and
  re-run `npm install && npm run build` if it's missing - watch the
  build's own output for errors first.
- **`.env` missing or incomplete.** The app reads its configuration from
  `WorkingDirectory/.env` and throws
  `Missing required environment variable: ...` on boot if a required
  variable (e.g. `DB_USER`, `JWT_SECRET`) isn't set. Confirm the file
  exists in the app's folder and has real values, not just the
  `.env.example` placeholders.
- **Wrong `node` path, or a stale hand-edited unit.** The automated
  install always fills `ExecStart=` in with the exact `node` binary that
  ran the build, so this shouldn't happen unless you edited the unit by
  hand afterward - re-run `npm install && npm run build` to refresh it.
- **Database not reachable.** If MariaDB isn't running yet, or
  `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` in `.env` are wrong,
  the log will show a Prisma "Can't reach database server" error.
  `Restart=on-failure` will keep retrying, but only up to
  `StartLimitBurst=5` times within `StartLimitIntervalSec=60` - after
  that the unit is left in a `failed` state and needs
  `sudo systemctl reset-failed timeclockplus` once the database is
  actually reachable, followed by `sudo systemctl start timeclockplus`.
- **No schema / no admin account yet.** Building only installs the code -
  you still need `npm run prisma:deploy` and
  `npm run setup -- --email=...` once against the real database before
  the app has anything to serve.
- **Permissions.** `npm run build` chowns `dist/`, `node_modules/`,
  `prisma/`, `package.json`, `package-lock.json`, and `.env` to the
  service account automatically, but only if that account differs from
  whoever ran the build (i.e. only on the "optional hardening" path) -
  and only those specific paths. If you added other files the app needs
  to read at runtime, or ran `git pull`/edited files as a different user
  afterward, re-run `npm install && npm run build`.
- **`User=`/`Group=`/`WorkingDirectory=` in the unit file don't match**
  where you actually deployed the app. Re-running `npm install && npm run
  build` from the correct folder fixes this - the running config is
  whatever `daemon-reload` last picked up from
  `/etc/systemd/system/timeclockplus.service`, not the copy in the repo.

Once you've made a change, always re-run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart timeclockplus
sudo systemctl status timeclockplus
```
