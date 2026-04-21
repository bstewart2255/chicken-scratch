import { describe, it, expect, beforeAll } from 'vitest';
import { createAttestationToken, verifyAttestationToken } from '../services/attestation.service.js';

beforeAll(() => {
  // The service reads this env var at signing/validation time. Use a stable
  // test value so tokens sign and verify with the same key.
  process.env.ENCRYPTION_KEY ??= 'test-attestation-secret-0123456789abcdef0123456789abcdef';
});

describe('attestation tokens', () => {
  const tenantA = 'tenant-a-111';
  const tenantB = 'tenant-b-222';
  const user = 'user_42';

  it('round-trips a valid token back to its claims', () => {
    const { token } = createAttestationToken(tenantA, user, 'mobile');
    const decoded = verifyAttestationToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded!.tenantId).toBe(tenantA);
    expect(decoded!.externalUserId).toBe(user);
    expect(decoded!.deviceClass).toBe('mobile');
    expect(decoded!.verifiedAt).toBeInstanceOf(Date);
    expect(decoded!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered token', () => {
    const { token } = createAttestationToken(tenantA, user, 'desktop');
    // Flip a character in the signature segment (last of three JWT parts).
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A');
    const tampered = parts.join('.');

    expect(verifyAttestationToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = createAttestationToken(tenantA, user, 'mobile');
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'different-secret-abcdef0123456789abcdef0123456789abcdef';
    expect(verifyAttestationToken(token)).toBeNull();
    process.env.ENCRYPTION_KEY = original;
  });

  it('emits distinct tokens for distinct tenants (caller enforces binding)', () => {
    const a = createAttestationToken(tenantA, user, 'mobile').token;
    const b = createAttestationToken(tenantB, user, 'mobile').token;
    expect(a).not.toBe(b);

    // Both validate on our side — the tenant binding check happens at the
    // route level (/api/v1/attestation/verify compares against req.tenant.id).
    const decodedA = verifyAttestationToken(a);
    const decodedB = verifyAttestationToken(b);
    expect(decodedA?.tenantId).toBe(tenantA);
    expect(decodedB?.tenantId).toBe(tenantB);
  });
});
