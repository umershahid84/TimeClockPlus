/**
 * Initial application setup: run once when standing up a new environment.
 *
 *   npm run setup -- --email admin@example.com
 *
 * Creates the three lines of business (if missing) and the first
 * Administrator account, then emails the temporary password + login link.
 * Safe to re-run: it will refuse to create a duplicate initial admin.
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

async function main() {
  console.log("Application Setup\n");

  const existingAdminCount = await prisma.user.count({ where: { isAdministrator: true } });
  if (existingAdminCount > 0) {
    console.log("An Administrator account already exists. Setup has already been completed.");
    process.exit(0);
  }

  for (const lob of LINES_OF_BUSINESS) {
    await prisma.lineOfBusiness.upsert({
      where: { code: lob.code },
      update: {},
      create: lob,
    });
  }

  const email = await promptEmail();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("A valid email address is required.");
    process.exit(1);
  }

  const userId = "admin";
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.user.create({
    data: {
      userId,
      email,
      firstName: "System",
      lastName: "Administrator",
      passwordHash,
      role: "ADMINISTRATOR",
      isAdministrator: true,
      canViewAllLinesOfBiz: true,
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + env.tempPasswordExpiryHours * 60 * 60 * 1000),
    },
  });

  await sendInitialAdminEmail({ to: email, userId, tempPassword });

  console.log("\nAdministrator account created successfully.");
  console.log("A setup email has been sent to the Administrator.");
  if (!env.sendEmails || !env.email.host) {
    console.log(`\n(Email not configured/enabled - dev mode credentials below)\nUser ID: ${userId}\nTemporary Password: ${tempPassword}`);
  }
}

main()
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
