import jwt from 'jsonwebtoken';
import type { DeviceClass } from '@chicken-scratch/shared';

/**
 * Attestation tokens are short-lived JWTs the chickenScratch backend signs
 * immediately after a successful biometric verify. The customer's browser
 * receives the token via the SDK's AuthResult; the customer's backend
 * then exchanges it for a trusted claim by calling
 * `POST /api/v1/attestation/verify`.
 *
 * Why this exists: without it, the customer's backend has no way to
 * distinguish "the user actually passed verify" from "the browser is
 * lying about having passed verify." Every action gated on recovery
 * (password reset, login, step-up) should demand an attestation token
 * and validate it server-to-server before proceeding.
 *
 * TTL is short (5 min) because this window is the narrow replay
 * opportunity an attacker has between signature-capture and server-to-
 * server validation.
 */

const ATTESTATION_TTL = 5 * 60; // 5 minutes in seconds

export interface AttestationPayload {
  tenantId: string;
  externalUserId: string;
  deviceClass: DeviceClass;
  type: 'attestation';
}

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.ADMIN_API_KEY;
  if (!secret) {
    throw new Error('Cannot sign attestation tokens — set ENCRYPTION_KEY or ADMIN_API_KEY.');
  }
  return secret;
}

/**
 * Sign an attestation that the user just passed biometric verification.
 * Called by the verify service immediately after a successful scoring.
 */
export function createAttestationToken(
  tenantId: string,
  externalUserId: string,
  deviceClass: DeviceClass,
): { token: string; expiresIn: number; expiresAt: string } {
  const payload: AttestationPayload = {
    tenantId,
    externalUserId,
    deviceClass,
    type: 'attestation',
  };

  const token = jwt.sign(payload, getSecret(), {
    expiresIn: ATTESTATION_TTL,
    issuer: 'chicken-scratch',
  });

  return {
    token,
    expiresIn: ATTESTATION_TTL,
    expiresAt: new Date(Date.now() + ATTESTATION_TTL * 1000).toISOString(),
  };
}

export interface VerifiedAttestation {
  tenantId: string;
  externalUserId: string;
  deviceClass: DeviceClass;
  verifiedAt: Date;
  expiresAt: Date;
}

/**
 * Validate an attestation token. Returns the decoded claims if the token
 * is authentic, unexpired, and of the right type — or null if any check
 * fails. The customer's backend calls this via the /api/v1/attestation/verify
 * endpoint; never call it from browser code.
 */
export function verifyAttestationToken(token: string): VerifiedAttestation | null {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      issuer: 'chicken-scratch',
    }) as AttestationPayload & jwt.JwtPayload;

    if (decoded.type !== 'attestation') return null;
    if (!decoded.tenantId || !decoded.externalUserId || !decoded.deviceClass) return null;
    if (decoded.iat == null || decoded.exp == null) return null;

    return {
      tenantId: decoded.tenantId,
      externalUserId: decoded.externalUserId,
      deviceClass: decoded.deviceClass,
      verifiedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000),
    };
  } catch {
    return null;
  }
}
