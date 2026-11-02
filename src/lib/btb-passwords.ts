import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export function validEmployeePassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 10 && password.length <= 128;
}

export async function hashEmployeePassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyEmployeePassword(password: string, encoded: string | null): Promise<boolean> {
  const parts = encoded?.split(":");
  const valid = parts?.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Unknown emails still do the same expensive password work.
  const salt = valid ? parts![1] : "00000000000000000000000000000000";
  const expected = Buffer.from(valid ? parts![2] : "0".repeat(128), "hex");
  const actual = await scrypt(password.slice(0, 128), salt, 64) as Buffer;
  return timingSafeEqual(actual, expected) && !!valid && password.length <= 128;
}
