import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Credential Store crypto verification ----

describe("credential-store crypto", () => {
  it("encrypt/decrypt roundtrip with aes-256-gcm", () => {
    const crypto = require("crypto");
    const key = crypto.scryptSync("test-master-key", "test-salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plaintext = "sensitive-data-here";
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = decipher.update(encrypted, null, "utf8") + decipher.final("utf8");
    expect(decrypted).toBe(plaintext);
  });

  it("decrypt fails with wrong key", () => {
    const crypto = require("crypto");
    const key1 = crypto.scryptSync("correct-key", "salt", 32);
    const key2 = crypto.scryptSync("wrong-key", "salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key1, iv);
    const encrypted = Buffer.concat([cipher.update("secret", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key2, iv);
    decipher.setAuthTag(authTag);
    expect(() => decipher.update(encrypted, null, "utf8") + decipher.final("utf8")).toThrow();
  });

  it("handles long text (10k chars)", () => {
    const crypto = require("crypto");
    const key = crypto.scryptSync("key", "salt", 32);
    const iv = crypto.randomBytes(16);
    const longText = "a".repeat(10000);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(longText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = decipher.update(encrypted, null, "utf8") + decipher.final("utf8");
    expect(decrypted).toBe(longText);
  });
});

// ---- Credential Store public API ----

describe("credential-store public API", () => {
  beforeEach(() => { vi.resetModules(); });

  it("exports all expected functions", () => {
    const cs = require("../services/credential-store");
    expect(typeof cs.saveCredential).toBe("function");
    expect(typeof cs.loadCredential).toBe("function");
    expect(typeof cs.deleteCredential).toBe("function");
    expect(typeof cs.listAccounts).toBe("function");
    expect(typeof cs.hasCredential).toBe("function");
  });

  it("hasCredential returns false for non-existent account", () => {
    const cs = require("../services/credential-store");
    const result = cs.hasCredential("nonexistent", "/tmp/.test-credentials");
    expect(result).toBe(false);
  });
});

// ---- SQLite Wrapper ----

describe("sqlite-wrapper", () => {
  beforeEach(() => { vi.resetModules(); });

  it("exports Database class", () => {
    const Database = require("../services/sqlite-wrapper");
    expect(typeof Database).toBe("function");
    expect(Database.name).toBe("Database");
  });
});
