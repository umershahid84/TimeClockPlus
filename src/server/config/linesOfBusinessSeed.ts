import { prisma } from "./prisma";

export const CORE_LINES_OF_BUSINESS: {
  code: "PUBLIC_PARKING" | "EMPLOYEE_PARKING" | "GROUND_TRANSPORTATION";
  name: string;
}[] = [
  { code: "PUBLIC_PARKING", name: "Public Parking" },
  { code: "EMPLOYEE_PARKING", name: "Employee Parking" },
  { code: "GROUND_TRANSPORTATION", name: "Ground Transportation" },
];

/**
 * Idempotently ensures the three core lines of business exist. Normally
 * created once by the setup script, but run again on every server boot as
 * a self-healing safety net - if a database was ever recreated, migrated
 * fresh, or partially seeded outside of `npm run setup`, the app should
 * not silently present an empty "Line of Business" dropdown with no way
 * to recover short of re-running setup by hand.
 */
export async function ensureCoreLinesOfBusinessSeeded(): Promise<void> {
  for (const lob of CORE_LINES_OF_BUSINESS) {
    await prisma.lineOfBusiness.upsert({
      where: { code: lob.code },
      update: {},
      create: lob,
    });
  }
}
