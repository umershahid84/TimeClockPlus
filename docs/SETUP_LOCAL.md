# Local Installation Guide

TimeClockPlus is a single integrated application (one project, one
`npm install`, one build). This guide sets it up against a local MariaDB
instance.

## 1. Prerequisites

- Node.js 20+ and npm
- MariaDB 10.6+ (or MySQL 8+, which is wire-compatible with the database
  driver used here)

## 2. Install MariaDB

### macOS (Homebrew)

```bash
brew install mariadb
brew services start mariadb
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install mariadb-server
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
```

### Windows

Download the MariaDB MSI installer from https://mariadb.org/download/ and
run it, keeping the default port (3306).

### Docker (any OS)

```bash
docker run -d --name timeclockplus-db \
  -e MARIADB_DATABASE=tcp \
  -e MARIADB_USER=account \
  -e MARIADB_PASSWORD=abcdefg \
  -e MARIADB_ROOT_PASSWORD=root_password \
  -p 3306:3306 \
  mariadb:11
```

## 3. Create the database and application user

Skip this step if you used the Docker command above (it already creates
the database and user).

```sql
CREATE DATABASE tcp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'account'@'localhost' IDENTIFIED BY 'abcdefg';
GRANT ALL PRIVILEGES ON tcp.* TO 'account'@'localhost';
FLUSH PRIVILEGES;
```

## 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```
DB_HOST = localhost
DB_PORT = 3306
DB_NAME = tcp
DB_USER = account
DB_PASS = abcdefg
DB_DIALECT = mariadb

JWT_SECRET = <a long random string, e.g. output of `openssl rand -hex 32`>
```

The application builds its database connection string from `DB_HOST`,
`DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASS` at startup — there is no
separate connection-string variable to keep in sync.

Email settings (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`,
`EMAIL_SENDER`, `EMAIL_SECURE`) are optional for local development. If
`SEND_EMAILS=false` or `EMAIL_HOST` is left blank, emails are logged to
the console instead of sent, so you can still exercise the
password-reset/supervisor-invite flows without a real mail server.

**Internal SMTP relays and TLS errors:** an internal-only relay often
presents a self-signed or expired certificate. If sending fails with
`certificate has expired` or `self signed certificate`, set
`EMAIL_TLS_REJECT_UNAUTHORIZED=false` in `.env` to accept it anyway (safe
on a trusted internal network). If the relay doesn't use STARTTLS at all,
set `EMAIL_IGNORE_TLS=true` instead.

## 5. Install dependencies and run migrations

```bash
npm install
npx prisma migrate dev --name init
```

This creates all tables (lines of business, users, employees,
effective-dated schedules, timesheets, timesheet entries, audit log,
password resets, system settings).

## 6. Create the initial Administrator account

```bash
npm run setup -- --email=admin@example.com
```

This seeds the three lines of business (Public Parking, Employee Parking,
Ground Transportation), creates the initial Administrator account with
User ID `admin`, and emails a temporary password + login link (or prints
it to the console if email isn't configured).

## 7. Start the application

```bash
npm run dev
```

This runs the API and the Vite dev server for the web app together in one
command. Visit http://localhost:5173, log in with `admin` and the
temporary password, and set a new password when prompted.

To run it the way it runs in production — a single built process serving
both the API and the web UI on one port:

```bash
npm run build
npm start
```

Then visit http://localhost:4000 (or whatever `PORT` you configured).

## 8. Running tests

```bash
npm test
```
