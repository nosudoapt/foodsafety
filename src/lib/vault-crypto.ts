import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "v1";
const AAD = "login_vault.secret";
const SALT = "foodsafety-vault-v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.VAULT_ENC_KEY;
  if (raw) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length !== 32) {
      throw new Error("VAULT_ENC_KEY must be a base64-encoded 32-byte key.");
    }
    cachedKey = decoded;
    return cachedKey;
  }

  const passphrase = process.env.VAULT_ENC_PASSPHRASE;
  if (passphrase) {
    cachedKey = scryptSync(passphrase, SALT, 32);
    return cachedKey;
  }

  throw new Error("Vault encryption key is not configured (VAULT_ENC_KEY).");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  cipher.setAAD(Buffer.from(AAD));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Malformed vault ciphertext.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(AAD));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
