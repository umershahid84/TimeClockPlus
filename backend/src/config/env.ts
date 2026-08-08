import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  tempPasswordExpiryHours: Number(process.env.TEMP_PASSWORD_EXPIRY_HOURS ?? 72),
  passwordResetCodeExpiryMinutes: Number(process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES ?? 15),
  maxFailedLoginAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5),
  accountLockoutMinutes: Number(process.env.ACCOUNT_LOCKOUT_MINUTES ?? 15),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
  },
  emailFrom: process.env.EMAIL_FROM ?? "TimeClockPlus <no-reply@example.com>",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",
  decimalHoursPrecision: Number(process.env.DECIMAL_HOURS_PRECISION ?? 2),
};
