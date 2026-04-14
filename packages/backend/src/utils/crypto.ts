import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

let encryptionKey: Buffer | null = null;

/**
 * Initialize the encryption module with a key from the environment.
 * Call this once at startup. If no key is set, encryption is disabled
 * (data stored as plaintext — acceptable for local development).
 */
export function initEncryption(): void {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn('ENCRYPTION_KEY not set — biometric data will be stored unencrypted.');
    encryptionKey = null;
    return;
  }

  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (256 bits).');
  }

  encryptionKey = Buffer.from(keyHex, 'hex');
  console.log('Encryption enabled for biometric data at rest.');
}

/**
 * Returns true if encryption is configured.
 */
export function isEncryptionEnabled(): boolean {
  return encryptionKey !== null;
}

/**
 * Encrypt a string value. Returns prefixed ciphertext.
 * If encryption is not configured, returns the plaintext unchanged.
 */
export function encrypt(plaintext: string): string {
  if (!encryptionKey) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: enc:<iv>:<authTag>:<ciphertext> (all base64)
  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value. If the value doesn't have the encrypted prefix,
 * returns it as-is (plaintext passthrough for backwards compatibility).
 */
export function decrypt(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value; // plaintext passthrough
  }

  if (!encryptionKey) {
    throw new Error('Cannot decrypt data — ENCRYPTION_KEY not set.');
  }

  const payload = value.substring(ENCRYPTED_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value.');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt a JSON-serializable value. Convenience wrapper.
 */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/**
 * Decrypt a value and parse as JSON. Handles plaintext passthrough.
 */
export function decryptJson<T = unknown>(value: string): T {
  return JSON.parse(decrypt(value)) as T;
}

/**
 * Generate a new random encryption key (for setup).
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
