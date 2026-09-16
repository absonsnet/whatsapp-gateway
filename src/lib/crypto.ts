import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from AUTH_SECRET using SHA-256.
 */
function getKey(): Buffer {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET environment variable is required for credential encryption");
    }
    return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a combined string: iv:authTag:ciphertext (all base64).
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Input format: iv:authTag:ciphertext (all base64).
 */
export function decrypt(encrypted: string): string {
    const key = getKey();
    const parts = encrypted.split(":");

    if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

/**
 * Encrypt a JSON object. Convenience wrapper around encrypt().
 */
export function encryptJson(data: object): string {
    return encrypt(JSON.stringify(data));
}

/**
 * Decrypt to a JSON object. Convenience wrapper around decrypt().
 */
export function decryptJson<T = any>(encrypted: string): T {
    return JSON.parse(decrypt(encrypted));
}
