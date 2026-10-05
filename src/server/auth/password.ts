import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string) {
  if (Buffer.byteLength(password, "utf8") > 72) throw new Error("Password exceeds bcrypt's 72-byte limit");
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string) {
  if (Buffer.byteLength(password, "utf8") > 72) return Promise.resolve(false);
  return bcrypt.compare(password, passwordHash);
}
