import { describe, it, expect, beforeEach } from 'vitest';
import { initEncryption, encrypt, decrypt, encryptJson, decryptJson, isEncryptionEnabled, generateKey } from '../utils/crypto.js';

describe('Encryption utilities', () => {
  describe('without encryption key', () => {
    beforeEach(() => {
      delete process.env.ENCRYPTION_KEY;
      initEncryption();
    });

    it('reports encryption disabled', () => {
      expect(isEncryptionEnabled()).toBe(false);
    });

    it('returns plaintext unchanged', () => {
      expect(encrypt('hello')).toBe('hello');
    });

    it('decrypts plaintext passthrough', () => {
      expect(decrypt('hello')).toBe('hello');
    });

    it('json round-trips without encryption', () => {
      const data = { foo: 'bar', num: 42 };
      const encrypted = encryptJson(data);
      expect(JSON.parse(encrypted)).toEqual(data);
    });
  });

  describe('with encryption key', () => {
    const testKey = generateKey(); // 64 hex chars

    beforeEach(() => {
      process.env.ENCRYPTION_KEY = testKey;
      initEncryption();
    });

    it('reports encryption enabled', () => {
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('encrypts to prefixed format', () => {
      const result = encrypt('secret data');
      expect(result).toMatch(/^enc:/);
      expect(result).not.toContain('secret data');
    });

    it('round-trips string data', () => {
      const original = 'biometric stroke data here';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('round-trips JSON data', () => {
      const original = { pressure: 0.7, velocity: 120, points: [1, 2, 3] };
      const encrypted = encryptJson(original);
      const decrypted = decryptJson(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const a = encrypt('same input');
      const b = encrypt('same input');
      expect(a).not.toBe(b); // different IVs
      expect(decrypt(a)).toBe(decrypt(b)); // same plaintext
    });

    it('rejects tampered ciphertext', () => {
      const encrypted = encrypt('important data');
      const tampered = encrypted.slice(0, -2) + 'XX';
      expect(() => decrypt(tampered)).toThrow();
    });

    it('rejects invalid key length', () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => initEncryption()).toThrow(/64 hex characters/);
    });
  });

  describe('generateKey', () => {
    it('produces 64-char hex string', () => {
      const key = generateKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('produces unique keys', () => {
      const a = generateKey();
      const b = generateKey();
      expect(a).not.toBe(b);
    });
  });
});
