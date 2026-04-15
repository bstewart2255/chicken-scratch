import jwt from 'jsonwebtoken';

const SDK_TOKEN_TTL = 15 * 60; // 15 minutes in seconds

export interface SdkTokenPayload {
  tenantId: string;
  externalUserId: string;
  type: 'sdk';
}

function getSecret(): string {
  // Use ENCRYPTION_KEY as the JWT signing secret (it's already a strong 256-bit key)
  // Falls back to ADMIN_API_KEY for dev environments without encryption
  const secret = process.env.ENCRYPTION_KEY || process.env.ADMIN_API_KEY;
  if (!secret) {
    throw new Error('Cannot sign SDK tokens — set ENCRYPTION_KEY or ADMIN_API_KEY.');
  }
  return secret;
}

/**
 * Create a short-lived JWT for SDK use.
 * The token is scoped to a specific tenant + user and expires in 15 minutes.
 * Called by the customer's backend (authenticated with their API key).
 */
export function createSdkToken(tenantId: string, externalUserId: string): {
  token: string;
  expiresIn: number;
  expiresAt: string;
} {
  const payload: SdkTokenPayload = {
    tenantId,
    externalUserId,
    type: 'sdk',
  };

  const token = jwt.sign(payload, getSecret(), {
    expiresIn: SDK_TOKEN_TTL,
    issuer: 'chicken-scratch',
  });

  const expiresAt = new Date(Date.now() + SDK_TOKEN_TTL * 1000).toISOString();

  return { token, expiresIn: SDK_TOKEN_TTL, expiresAt };
}

/**
 * Verify and decode an SDK token.
 * Returns the payload if valid, null if expired/invalid.
 */
export function verifySdkToken(token: string): SdkTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      issuer: 'chicken-scratch',
    }) as SdkTokenPayload & jwt.JwtPayload;

    if (decoded.type !== 'sdk') return null;

    return {
      tenantId: decoded.tenantId,
      externalUserId: decoded.externalUserId,
      type: 'sdk',
    };
  } catch {
    return null;
  }
}
