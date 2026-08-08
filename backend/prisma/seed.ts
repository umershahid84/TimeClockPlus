/** Seeds the three lines of business. Run via: npx tsx prisma/seed.ts */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.lineOfBusiness.upsert({
    where: { code: "PUBLIC_PARKING" },
    update: {},
    create: { code: "PUBLIC_PARKING", name: "Public Parking" },
  });
  await prisma.lineOfBusiness.upsert({
    where: { code: "EMPLOYEE_PARKING" },
    update: {},
    create: { code: "EMPLOYEE_PARKING", name: "Employee Parking" },
  });
  await prisma.lineOfBusiness.upsert({
    where: { code: "GROUND_TRANSPORTATION" },
    update: {},
    create: { code: "GROUND_TRANSPORTATION", name: "Ground Transportation" },
  });
  console.log("Seeded lines of business.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
