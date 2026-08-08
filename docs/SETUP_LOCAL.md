# Local Installation Guide

This guide sets up TimeClockPlus (API + web app) against a local MariaDB
instance.

## 1. Prerequisites

- Node.js 20+ and npm
- MariaDB 10.6+ (or MySQL 8+, which is wire-compatible with the Prisma
  `mysql` connector used here)

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
  -e MARIADB_DATABASE=timeclockplus \
  -e MARIADB_USER=tcp_user \
  -e MARIADB_PASSWORD=tcp_password \
  -e MARIADB_ROOT_PASSWORD=root_password \
  -p 3306:3306 \
  mariadb:11
```

## 3. Create the database and application user

Skip this step if you used the Docker command above (it already creates
the database and user).

```sql
CREATE DATABASE timeclockplus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tcp_user'@'localhost' IDENTIFIED BY 'tcp_password';
GRANT ALL PRIVILEGES ON timeclockplus.* TO 'tcp_user'@'localhost';
FLUSH PRIVILEGES;
```

## 4. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set at minimum:

- `DATABASE_URL="mysql://tcp_user:tcp_password@localhost:3306/timeclockplus"`
- `JWT_SECRET` to a long random string (e.g. `openssl rand -hex 32`)
- SMTP settings if you want real emails sent. If left blank, emails are
  logged to the console instead of sent (useful for local development).

```bash
cd ../frontend
cp .env.example .env
```

The frontend's Vite dev server proxies `/api` to `http://localhost:4000`
by default, so `VITE_API_BASE_URL` can be left blank locally.

## 5. Install dependencies and run migrations

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run prisma:generate
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
it to the console if SMTP isn't configured).

## 7. Start the application

In two terminals:

```bash
# Terminal 1 - API
cd backend
npm run dev

# Terminal 2 - Web app
cd frontend
npm run dev
```

Visit http://localhost:5173, log in with `admin` and the temporary
password, and set a new password when prompted.

## 8. Running tests

```bash
cd backend
npm test
```
