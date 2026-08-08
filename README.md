# TimeClockPlus

A Timeclock and Employee Scheduling application for three lines of
business — **Public Parking**, **Employee Parking**, and **Ground
Transportation** — covering employee management, effective-dated
scheduling, timesheets with decimal-hour payroll calculations, reporting,
and role-based administration.

## Architecture

```
backend/    Node.js + TypeScript + Express API, Prisma ORM, MariaDB
frontend/   React + TypeScript + Vite single-page app
docs/       Local and cloud setup guides
```

Key design decisions (mapped to the requirements they satisfy):

- **Effective-dated schedules** (`employee_schedules` table): every
  schedule change inserts a new row with an `effectiveDate`; the prior
  row's `endDate` is set rather than overwritten. Reports resolve the
  schedule that was actually in effect for each date in the requested
  range, so historical accuracy is preserved even after schedules change.
- **Decimal-hour payroll math** (`backend/src/utils/time.ts`): hours are
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
- **Extensible employee fields**: `custom_field_definitions` /
  `employee_custom_field_values` let new employee attributes be added
  without a schema migration for every new field.

## Getting started

- Local installation: see [`docs/SETUP_LOCAL.md`](docs/SETUP_LOCAL.md)
- Cloud deployment (free-tier friendly): see [`docs/DEPLOY_CLOUD.md`](docs/DEPLOY_CLOUD.md)

Quick start (after installing MariaDB — see the local setup guide):

```bash
cd backend
cp .env.example .env   # edit DATABASE_URL, JWT_SECRET, SMTP settings
npm install
npx prisma migrate dev --name init
npm run setup -- --email=admin@example.com

cd ../frontend
cp .env.example .env
npm install
npm run dev             # in one terminal
```

```bash
cd backend
npm run dev              # in another terminal
```

Then open http://localhost:5173 and sign in with the `admin` User ID and
the temporary password emailed (or printed to the console if SMTP isn't
configured).

## Roles

| Capability | Administrator | Supervisor |
|---|---|---|
| View all lines of business | ✔ | Only assigned lines (or if separately granted) |
| Add/edit/archive/remove employees | ✔ | If authorized for that line of business |
| Create/edit schedules | ✔ | For assigned line(s) of business |
| Enter/approve timesheets | ✔ | For assigned line(s) of business |
| Manage supervisor accounts & permissions | ✔ | ✘ |
| Grant Administrator privileges to a Supervisor | ✔ | ✘ |

## Testing

```bash
cd backend
npm test
```

Includes unit tests for the decimal-hour calculation engine, covering the
worked examples from the requirements (15-minute increments, the
15:00–23:30 and 15:00–23:45 examples, and an overnight 22:00–06:30 shift).
