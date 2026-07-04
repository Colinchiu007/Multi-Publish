import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

let _key: Buffer | null = null;

export function init(encryptionKey: string): void {
  _key = crypto.scryptSync(encryptionKey, "salt", 32);
}

export function encrypt(plaintext: string): string {
  if (!_key) throw new Error("Credential store not initialized");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, _key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(ciphertext: string): string {
  if (!_key) throw new Error("Credential store not initialized");
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, _key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(Buffer.from(encryptedHex, "hex")) + decipher.final("utf-8");
}