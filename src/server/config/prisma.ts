import { PrismaClient } from "@prisma/client";
// Importing env first ensures DATABASE_URL is assembled from DB_* and set
// on process.env before PrismaClient reads it.
import "./env";

export const prisma = new PrismaClient();
