# Cloud Deployment Guide (Free / Free-Tier Services)

TimeClockPlus is a single integrated application — one build, one running
process serving both the API and the web UI. That means cloud deployment
only requires **one** web service (plus a database), not a separate
frontend and backend deployment.

This guide uses services that offer a free tier as of this writing.
Free-tier terms change over time — check current pricing pages before
committing to a provider.

Suggested stack:

- **Database:** [Aiven for MySQL](https://aiven.io/mysql) free plan, or any
  MySQL/MariaDB-compatible free tier (e.g. a small MariaDB instance on
  [Railway](https://railway.app) or [Clever Cloud](https://www.clever-cloud.com/)).
  The app's database driver works against any MariaDB/MySQL-compatible
  server, local or hosted.
- **Application hosting:** [Railway](https://railway.app) or
  [Render](https://render.com) free/starter tiers — both support Node.js
  web services and provide HTTPS automatically. Because this is a single
  integrated app, you deploy exactly one service.
- **Email:** [Brevo](https://www.brevo.com/) (formerly Sendinblue) free
  SMTP tier, or Mailgun/SendGrid free tiers — or an internal SMTP relay if
  your organization already runs one.

None of these are hard dependencies — swap in any provider that gives you
a MySQL-protocol database, a place to run a Node.js process, and SMTP
credentials.

## 1. Create the cloud database

1. Sign up with your chosen provider and create a new MySQL/MariaDB
   database instance.
2. Note the connection details: host, port, database name, username,
   password. You'll map these directly to `DB_HOST`, `DB_PORT`,
   `DB_NAME`, `DB_USER`, `DB_PASS` below.

## 2. Configure environment variables / secrets

Never commit real secrets. In your hosting provider's dashboard, set the
following environment variables for the service:

| Variable | Description |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_DIALECT` | From step 1 |
| `JWT_SECRET` | Long random string (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN`, `JWT_ALGORITHM` | Session lifetime and signing algorithm (defaults: `10h`, `HS256`) |
| `SEND_EMAILS`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SENDER` | From your email provider |
| `TEST_EMAIL_USER` | Optional: in non-production environments, redirects all outgoing mail here instead of real recipients |
| `CORS_ORIGIN` | The application's own public URL (same-origin, since API and UI are served together) |
| `APP_BASE_URL` | Same as `CORS_ORIGIN` — used to build login links in emails |
| `PORT` | Usually provided automatically by the platform |
| `NODE_ENV` | `production` |

## 3. Deploy the application

1. Push this repository to GitHub (or connect your existing remote).
2. In Railway/Render, create a new Web Service pointing at the repository
   root (there is only one project to point at).
3. Build command: `npm install && npm run build && npx prisma migrate deploy`
4. Start command: `npm start`
5. Most providers auto-provision HTTPS for you; no extra configuration is
   required for TLS termination at the edge.

The built server serves the web UI itself, so no separate static-site
deployment is needed.

## 4. Create the initial Administrator

Run the setup script once against the deployed database, either via the
provider's one-off "run command" feature or from your local machine with
the `DB_*` variables pointed at the cloud database:

```bash
DB_HOST=... DB_PORT=... DB_NAME=... DB_USER=... DB_PASS=... \
JWT_SECRET=... \
EMAIL_HOST=... EMAIL_USER=... EMAIL_PASS=... \
npm run setup -- --email=admin@yourcompany.com
```

## 5. Verify HTTPS and connectivity

1. Confirm the deployed URL loads over `https://` and both the web UI and
   `/api/health` respond.
2. Set `CORS_ORIGIN` and `APP_BASE_URL` to match that URL exactly.
3. Log in using the Administrator credentials emailed in step 4.

## 6. Ongoing schema changes

When you change `prisma/schema.prisma`, generate and apply a new
migration locally, commit the generated migration files, then let your
deploy pipeline run `npx prisma migrate deploy` against the cloud database
(this repo's suggested build command already does this on every deploy).
