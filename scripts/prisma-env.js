#!/usr/bin/env node
// Thin wrapper around `npx prisma <args>` so every prisma:* npm script
// (and anyone scripting deploys around them) gets a DATABASE_URL derived
// from the same DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS values the app
// itself uses (see src/server/config/env.ts) - .env only needs to hold
// those DB_* variables, not a second, easily-stale copy of the same
// credentials as a raw connection string.
//
// A bare `npx prisma migrate deploy` does NOT go through the app's own
// code (src/server/config/env.ts), so without this wrapper it fails with
// "Environment variable not found: DATABASE_URL" even when DB_* is fully
// configured. Keep the assembly logic below in sync with env.ts's.
require("dotenv/config");
const { spawnSync } = require("node:child_process");

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "3306";
  const name = process.env.DB_NAME || "tcp";
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS || "";
  if (!user) {
    console.error("Missing required environment variable: DB_USER (set it in .env)");
    process.exit(1);
  }
  process.env.DATABASE_URL = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

const args = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env: process.env });
process.exit(result.status === null ? 1 : result.status);
