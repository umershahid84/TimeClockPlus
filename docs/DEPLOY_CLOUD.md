# Cloud Deployment Guide (Free / Free-Tier Services)

This guide deploys TimeClockPlus using services that offer a free tier as
of this writing. Free-tier terms change over time — check current pricing
pages before committing to a provider.

Suggested stack:

- **Database:** [Aiven for MySQL](https://aiven.io/mysql) free plan, or any
  MySQL/MariaDB-compatible free tier (e.g. a small MariaDB instance on
  [Railway](https://railway.app) or [Clever Cloud](https://www.clever-cloud.com/)).
  Prisma's `mysql` provider works against any MariaDB/MySQL-compatible
  server, local or hosted.
- **API + Web app hosting:** [Railway](https://railway.app) or
  [Render](https://render.com) free/starter tiers — both support Node.js
  web services and static sites, and both provide HTTPS automatically.
- **Email:** [Brevo](https://www.brevo.com/) (formerly Sendinblue) free
  SMTP tier, or Mailgun/SendGrid free tiers.

None of these are hard dependencies — swap in any provider that gives you
a MySQL-protocol database, a place to run a Node.js process, and SMTP
credentials.

## 1. Create the cloud database

1. Sign up with your chosen provider and create a new MySQL/MariaDB
   database instance.
2. Note the connection details: host, port, database name, username,
   password. Most providers give you a ready-made connection string —
   if not, assemble one in the form:

   ```
   mysql://<user>:<password>@<host>:<port>/<database>
   ```

3. If the provider requires TLS, append `?ssl={"rejectUnauthorized":true}`
   or the provider's documented SSL query parameter to the connection
   string.

## 2. Configure environment variables / secrets

Never commit real secrets. In your hosting provider's dashboard, set the
following environment variables for the API service:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Connection string from step 1 |
| `JWT_SECRET` | Long random string (`openssl rand -hex 32`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | From your email provider |
| `EMAIL_FROM` | e.g. `TimeClockPlus <no-reply@yourdomain.com>` |
| `CORS_ORIGIN` | The deployed frontend's public URL |
| `APP_BASE_URL` | Same as `CORS_ORIGIN` — used to build login links in emails |
| `NODE_ENV` | `production` |

For the frontend static site build, set:

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | The deployed API's public URL, e.g. `https://timeclockplus-api.up.railway.app` |

## 3. Deploy the API

1. Push this repository to GitHub (or connect your existing remote).
2. In Railway/Render, create a new Web Service pointing at the `backend/`
   directory.
3. Build command: `npm install && npm run build && npx prisma migrate deploy`
4. Start command: `npm start`
5. Most providers auto-provision HTTPS for you; no extra configuration is
   required for TLS termination at the edge.

## 4. Create the initial Administrator

Run the setup script once against the deployed database, either via the
provider's one-off "run command" feature or from your local machine with
`DATABASE_URL` pointed at the cloud database:

```bash
cd backend
DATABASE_URL="<cloud connection string>" \
SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=... \
npm run setup -- --email=admin@yourcompany.com
```

## 5. Deploy the web app

1. Create a Static Site (Render) or a second service (Railway) pointing at
   `frontend/`.
2. Build command: `npm install && npm run build`
3. Publish directory: `dist`
4. Set `VITE_API_BASE_URL` as described above before building — Vite
   inlines env vars at build time.

## 6. Verify HTTPS and connect the pieces

1. Confirm both the API and web app URLs load over `https://`.
2. Update `CORS_ORIGIN` on the API to match the final web app URL exactly.
3. Log in at the web app URL using the Administrator credentials emailed
   in step 4.

## 7. Ongoing schema changes

When you change `backend/prisma/schema.prisma`, generate and apply a new
migration locally, commit the generated migration files, then let your
deploy pipeline run `npx prisma migrate deploy` against the cloud database
(this repo's suggested build command already does this on every deploy).
