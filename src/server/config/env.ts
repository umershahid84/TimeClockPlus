import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

const dbHost = process.env.DB_HOST ?? "localhost";
const dbPort = Number(process.env.DB_PORT ?? 3306);
const dbName = required("DB_NAME", "tcp");
const dbUser = required("DB_USER");
const dbPass = process.env.DB_PASS ?? "";
const dbDialect = process.env.DB_DIALECT ?? "mariadb";

if (dbDialect !== "mariadb" && dbDialect !== "mysql") {
  // eslint-disable-next-line no-console
  console.warn(`DB_DIALECT="${dbDialect}" is not "mariadb" or "mysql" - the app talks to the database over the MySQL wire protocol, so only MariaDB/MySQL-compatible servers are supported.`);
}

// Prisma's schema reads its connection string from DATABASE_URL. Rather
// than asking operators to maintain two representations of the same
// credentials, we assemble it here from the discrete DB_* variables so
// there is exactly one place (this .env file) that holds them.
const databaseUrl = `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPass)}@${dbHost}:${dbPort}/${dbName}`;
process.env.DATABASE_URL = databaseUrl;

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  port: Number(process.env.PORT ?? 4000),

  db: {
    host: dbHost,
    port: dbPort,
    name: dbName,
    user: dbUser,
    pass: dbPass,
    dialect: dbDialect,
  },
  databaseUrl,

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "10h",
  jwtAlgorithm: (process.env.JWT_ALGORITHM ?? "HS256") as "HS256" | "HS384" | "HS512",
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),

  tempPasswordExpiryHours: Number(process.env.TEMP_PASSWORD_EXPIRY_HOURS ?? 72),
  passwordResetCodeExpiryMinutes: Number(process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES ?? 15),
  maxFailedLoginAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5),
  accountLockoutMinutes: Number(process.env.ACCOUNT_LOCKOUT_MINUTES ?? 15),

  sendEmails: bool("SEND_EMAILS", true),
  email: {
    host: process.env.EMAIL_HOST ?? "",
    port: Number(process.env.EMAIL_PORT ?? 25),
    secure: bool("EMAIL_SECURE", false),
    user: process.env.EMAIL_USER ?? "",
    pass: process.env.EMAIL_PASS ?? "",
    sender: process.env.EMAIL_SENDER ?? process.env.EMAIL_USER ?? "no-reply@example.com",
    // Internal-only relays often present a self-signed or expired
    // certificate that a real client would never accept over the public
    // internet, but is fine on a trusted internal network. Set
    // EMAIL_TLS_REJECT_UNAUTHORIZED=false to accept it anyway rather than
    // failing every send with "certificate has expired"/"self signed
    // certificate". Set EMAIL_IGNORE_TLS=true to skip STARTTLS entirely if
    // the relay doesn't need encryption at all.
    rejectUnauthorizedTls: bool("EMAIL_TLS_REJECT_UNAUTHORIZED", true),
    ignoreTls: bool("EMAIL_IGNORE_TLS", false),
  },
  // When set (typically in non-production environments), every outgoing
  // email is redirected to this address instead of the real recipient, so
  // test runs and staging environments never email real employees.
  testEmailUser: process.env.TEST_EMAIL_USER,

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",

  decimalHoursPrecision: Number(process.env.DECIMAL_HOURS_PRECISION ?? 2),

  // Auto-applied to every new timesheet day (Add Day) as the unpaid meal
  // break, per the organization's payroll rules. A supervisor can still
  // override it per day. This same value is applied to BOTH the scheduled
  // shift length and the actual worked time when splitting Regular vs.
  // OT, so the two are always compared on the same basis - see
  // routes/timesheets.ts for why that matters.
  defaultUnpaidBreakMinutes: Number(process.env.DEFAULT_UNPAID_BREAK_MINUTES ?? 30),

  // IANA timezone the organization operates in. All times shown to users
  // (UI, reports, exports, audit logs) are converted to this timezone -
  // never displayed as UTC/Zulu. Timestamps are still stored in UTC.
  appTimezone: process.env.APP_TIMEZONE ?? "America/Los_Angeles",

  // Any Sunday that starts a real pay period. Every other pay period is
  // computed as a 14-day offset from this anchor (Sunday-Saturday, 14
  // days long), so the anchor only needs to be a known-correct reference
  // point, not the current period.
  payPeriodAnchor: process.env.PAY_PERIOD_ANCHOR ?? "2026-07-26",
};
