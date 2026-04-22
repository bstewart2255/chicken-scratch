import { describe, it, expect } from 'vitest';
import { toInternalUsername, fromInternalUsername } from '../db/repositories/tenant.repo.js';

describe('tenant internal-username parsing', () => {
  it('roundtrips a typical tenant/externalUserId pair', () => {
    const tenantId = '0df005d7-333d-4f77-a517-5e92f7c34789';
    const externalUserId = 'demo-c11c20229039';
    const internal = toInternalUsername(tenantId, externalUserId);
    expect(internal).toBe('t:0df005d7-333d-4f77-a517-5e92f7c34789:demo-c11c20229039');

    const parsed = fromInternalUsername(internal);
    expect(parsed).toEqual({ tenantId, externalUserId });
  });

  it('returns null for raw non-tenant usernames', () => {
    expect(fromInternalUsername('blair')).toBeNull();
    expect(fromInternalUsername('demo-e6346bf6')).toBeNull();
    expect(fromInternalUsername('')).toBeNull();
  });

  it('returns null for malformed tenant-prefixed strings', () => {
    expect(fromInternalUsername('t:')).toBeNull();            // missing everything after prefix
    expect(fromInternalUsername('t:no-colon-after-uuid')).toBeNull();
    expect(fromInternalUsername('t::empty-tenant')).toBeNull(); // empty tenantId
  });

  it('handles externalUserIds that happen to contain colons', () => {
    const tenantId = '0df005d7-333d-4f77-a517-5e92f7c34789';
    const externalUserId = 'has:colons:in:it';
    const internal = toInternalUsername(tenantId, externalUserId);
    const parsed = fromInternalUsername(internal);
    expect(parsed).toEqual({ tenantId, externalUserId });
  });
});
