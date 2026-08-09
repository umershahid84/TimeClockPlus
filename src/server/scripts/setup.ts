/**
 * Initial application setup: run once when standing up a new environment.
 *
 *   npm run setup -- --email=admin@example.com
 *
 * Creates the three lines of business (if missing) and the first
 * Administrator account (User ID "admin"), then emails the temporary
 * password + login link. Safe to re-run: it will refuse to create a
 * duplicate initial admin.
 *
 * If the account already exists but you never received (or lost) the
 * temporary password - e.g. because the mail server rejected the send -
 * re-run with --resend to generate a new temporary password for the
 * existing account and try sending it again:
 *
 *   npm run setup -- --resend --email=admin@example.com
 */
import readline from "node:readline/promises";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { generateTempPassword, hashPassword } from "../utils/auth";
import { sendInitialAdminEmail } from "../services/email";

const LINES_OF_BUSINESS: { code: "PUBLIC_PARKING" | "EMPLOYEE_PARKING" | "GROUND_TRANSPORTATION"; name: string }[] = [
  { code: "PUBLIC_PARKING", name: "Public Parking" },
  { code: "EMPLOYEE_PARKING", name: "Employee Parking" },
  { code: "GROUND_TRANSPORTATION", name: "Ground Transportation" },
];

const INITIAL_ADMIN_USER_ID = "admin";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function promptEmail(): Promise<string> {
  const argEmail = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
  if (argEmail) return argEmail;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = await rl.question("Administrator Email: ");
    return email.trim();
  } finally {
    rl.close();
  }
}

/**
 * Sends the account email but never lets a failed send (bad SMTP relay,
 * expired TLS cert, etc.) leave the operator locked out of an account they
 * can't see the password for: on any error, the temporary password is
 * printed to the console instead, and the script still exits successfully
 * since the account itself was created/updated correctly.
 */
async function sendCredentialsResilient(params: { to: string; userId: string; tempPassword: string }) {
  try {
    await sendInitialAdminEmail(params);
    console.log("\nA setup email has been sent to the Administrator.");
  } catch (err) {
    console.error("\nCould not send the setup email:", err instanceof Error ? err.message : err);
    console.log("The account was saved regardless - use these credentials to log in, then fix email delivery separately:");
  }
  // Always show the credentials here (not just when email is unconfigured):
  // if the send failed above, this may be the operator's only chance to
  // see this password - it cannot be retrieved later.
  console.log(`\nUser ID: ${params.userId}\nTemporary Password: ${params.tempPassword}`);
}

async function main() {
  console.log("Application Setup\n");

  for (const lob of LINES_OF_BUSINESS) {
    await prisma.lineOfBusiness.upsert({
      where: { code: lob.code },
      update: {},
      create: lob,
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { userId: INITIAL_ADMIN_USER_ID } });
  const resend = hasFlag("--resend");

  if (existingAdmin && !resend) {
    console.log("An Administrator account already exists. Setup has already been completed.");
    console.log(`If you never received (or lost) the temporary password, re-run with --resend to generate a new one:\n\n  npm run setup -- --resend --email=${existingAdmin.email}\n`);
    return;
  }

  const email = existingAdmin && !process.argv.some((a) => a.startsWith("--email=")) ? existingAdmin.email : await promptEmail();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("A valid email address is required.");
    process.exitCode = 1;
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const tempPasswordExpiresAt = new Date(Date.now() + env.tempPasswordExpiryHours * 60 * 60 * 1000);

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { email, passwordHash, mustChangePassword: true, tempPasswordExpiresAt, isActive: true, failedLoginAttempts: 0, lockedUntil: null },
    });
    console.log(`Generated a new temporary password for the existing "${INITIAL_ADMIN_USER_ID}" account.`);
  } else {
    await prisma.user.create({
      data: {
        userId: INITIAL_ADMIN_USER_ID,
        email,
        firstName: "System",
        lastName: "Administrator",
        passwordHash,
        role: "ADMINISTRATOR",
        isAdministrator: true,
        canViewAllLinesOfBiz: true,
        mustChangePassword: true,
        tempPasswordExpiresAt,
      },
    });
    console.log("Administrator account created successfully.");
  }

  await sendCredentialsResilient({ to: email, userId: INITIAL_ADMIN_USER_ID, tempPassword });
}

main()
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
