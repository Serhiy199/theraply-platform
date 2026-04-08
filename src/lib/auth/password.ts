import bcrypt from "bcryptjs";

const DEFAULT_SALT_ROUNDS = 12;

export async function hashPassword(password: string, saltRounds = DEFAULT_SALT_ROUNDS) {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export { DEFAULT_SALT_ROUNDS };
