import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Cryptographically random temporary password, e.g. "Kx9-mQ2p-Rt4v". */
export function generateTempPassword(): string {
  const part = () => crypto.randomBytes(3).toString("hex");
  return `${part()}-${part()}-${part()}`.toUpperCase();
}

/** Six-digit one-time code for password reset. */
export function generateOtc(): string {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, "0");
}

export function hashOtc(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export interface JwtPayload {
  userId: number;
  role: "ADMINISTRATOR" | "SUPERVISOR";
  isAdministrator: boolean;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: env.jwtAlgorithm,
  } as jwt.SignOptions);
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret, { algorithms: [env.jwtAlgorithm] }) as JwtPayload;
}
