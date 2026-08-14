# TimeClockPlus

A Timeclock and Employee Scheduling application for three lines of
business — **Public Parking**, **Employee Parking**, and **Ground
Transportation** — covering employee management, effective-dated
scheduling, timesheets with decimal-hour payroll calculations, reporting,
and role-based administration.

This is a **single integrated application**: one project, one
`package.json`, one `npm install`, one build, one running process. There
is no separate frontend/backend project to install, run, or deploy —
Express serves both the `/api` routes and the built React app.

## Architecture

```
prisma/             Database schema (Prisma ORM, MariaDB)
src/
  server/            Express API: routes, middleware, services, config, CLI scripts
  client/            React + TypeScript single-page app (built by Vite)
docs/                Local and cloud setup guides
dist/                Build output (git-ignored): dist/server + dist/client
```

In development, `npm run dev` runs the API (`tsx watch`) and the Vite dev
server side by side, with Vite proxying `/api` to the API process. In
production, `npm run build` compiles both, and `npm start` runs a single
Node process that serves `/api/*` and the built `dist/client` static
assets (with SPA fallback) from the same port.

Key design decisions (mapped to the requirements they satisfy):

- **Effective-dated schedules** (`employee_schedules` table): every
  schedule change inserts a new row with an `effectiveDate`; the prior
  row's `endDate` is set rather than overwritten. Reports resolve the
  schedule that was actually in effect for each date in the requested
  range, so historical accuracy is preserved even after schedules change.
- **Decimal-hour payroll math** (`src/server/utils/time.ts`): hours are
  always computed from actual clock-in/clock-out timestamps plus unpaid
  break minutes, then rounded once to 2 decimal places — never from
  pre-rounded intermediate values. Overnight shifts are resolved by
  rolling the end time forward a day when it would otherwise appear to
  precede the start time.
- **Line-of-business separation + RBAC**: every employee, schedule, and
  timesheet belongs to a line of business. Supervisors are granted access
  to specific lines of business (`user_lines_of_business`); Administrators
  see everything. A Supervisor can be granted Administrator privileges
  without losing their existing line-of-business assignments.
- **Audit trail** (`audit_logs` table): employee, schedule, timesheet, and
  permission changes record actor, timestamp, previous value, and new
  value.
- **Secure auth**: bcrypt password hashing, JWT sessions, rate-limited
  login/forgot-password endpoints, account lockout after repeated
  failures, one-time password-reset codes that expire and are single-use,
  and a forgot-username flow that never reveals whether an account exists.
- **Configuration via environment variables only** — no hard-coded
  database, email, or JWT credentials anywhere in the source. See
  `.env.example` for the full list.

## Getting started

- Local installation: see [`docs/SETUP_LOCAL.md`](docs/SETUP_LOCAL.md)
- Cloud deployment (free-tier friendly): see [`docs/DEPLOY_CLOUD.md`](docs/DEPLOY_CLOUD.md)
- Running continuously on a Linux server (systemd): see [`docs/SYSTEMD.md`](docs/SYSTEMD.md)

Quick start (after installing MariaDB — see the local setup guide):

```bash
cp .env.example .env     # edit DB_*, JWT_SECRET, EMAIL_* as needed
npm install
npx prisma migrate dev --name init
npm run setup -- --email=admin@example.com
npm run dev               # runs API + web app together
```

Then open http://localhost:5173 and sign in with the `admin` User ID and
the temporary password emailed (or printed to the console if email isn't
configured).

For a production-style run of the single integrated process:

```bash
npm run build
npm start
```

This serves the whole application — API and web UI — from one process on
`PORT` (default 4000).

## Running continuously with systemd (Linux)

Full walkthrough: [`docs/SYSTEMD.md`](docs/SYSTEMD.md). This lets the app
start on boot, restart automatically if it crashes, and log to
`journalctl`, so `sudo systemctl start timeclockplus` (and `enable` for
boot) just works.

```bash
# 1. Dedicated service user
sudo useradd --system --create-home --shell /usr/sbin/nologin timeclockplus

# 2. Deploy the app as that user
sudo mkdir -p /opt/timeclockplus
sudo chown timeclockplus:timeclockplus /opt/timeclockplus
sudo -u timeclockplus -H bash -c '
  git clone https://github.com/umershahid84/TimeClockPlus.git /opt/timeclockplus
  cd /opt/timeclockplus
  npm install
  npm run build
'

# 3. Configure it
sudo -u timeclockplus cp /opt/timeclockplus/.env.example /opt/timeclockplus/.env
sudo -u timeclockplus -H vim /opt/timeclockplus/.env   # fill in DB_*, JWT_SECRET, EMAIL_*, etc.
sudo chmod 600 /opt/timeclockplus/.env

# 4. Create the database schema and the first admin account
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npx prisma migrate deploy'
sudo -u timeclockplus -H bash -c 'cd /opt/timeclockplus && npm run setup -- --email=admin@example.com'

# 5. Install the unit
sudo cp /opt/timeclockplus/deploy/systemd/timeclockplus.service /etc/systemd/system/
# Open it and check User=, Group=, WorkingDirectory=, and that ExecStart=
# points at the right `node` binary (`sudo -u timeclockplus which node`) -
# see docs/SYSTEMD.md for the full checklist, including the MariaDB unit
# name check.
sudo systemctl daemon-reload

# 6. Start it
sudo systemctl enable --now timeclockplus
sudo systemctl status timeclockplus
journalctl -u timeclockplus -f
```

**If `systemctl start` fails**, the fix is almost always visible in
`journalctl -u timeclockplus -n 50 --no-pager` — the two most common
causes are: (a) steps 3-4 above were skipped, so `.env` is missing or the
database has no schema/admin yet, or (b) `ExecStart=`'s `node` path
doesn't match `sudo -u timeclockplus which node` (common with nvm-based
Node installs). See the troubleshooting notes in
[`docs/SYSTEMD.md`](docs/SYSTEMD.md) for the full list of things to check.

## Roles

| Capability | Administrator | Supervisor |
|---|---|---|
| View all lines of business | ✔ | Only assigned lines (or if separately granted) |
| Add/edit/archive/remove employees | ✔ | If authorized for that line of business |
| Create/edit schedules | ✔ | For assigned line(s) of business |
| Enter/approve timesheets | ✔ | For assigned line(s) of business |
| Manage supervisor accounts & permissions | ✔ | ✘ |
| Grant Administrator privileges to a Supervisor | ✔ | ✘ |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run the API and web app together for local development |
| `npm run build` | Build the client and compile the server for production |
| `npm start` | Run the built application (single process) |
| `npm run setup -- --email=admin@example.com` | Create the initial Administrator account |
| `npm run prisma:migrate` | Create/apply a database migration in development |
| `npm run prisma:deploy` | Apply migrations in production/CI |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check both server and client |

## Testing

```bash
npm test
```

Includes unit tests for the decimal-hour calculation engine, covering the
worked examples from the requirements (15-minute increments, the
15:00–23:30 and 15:00–23:45 examples, and an overnight 22:00–06:30 shift).
