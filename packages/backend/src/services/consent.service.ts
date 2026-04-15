import * as consentRepo from '../db/repositories/consent.repo.js';
import * as tenantRepo from '../db/repositories/tenant.repo.js';
import * as userRepo from '../db/repositories/user.repo.js';
import { CURRENT_POLICY_VERSION } from '@chicken-scratch/shared';
import type { DeletionSummary } from '../db/repositories/user.repo.js';

export interface ConsentStatus {
  hasConsented: boolean;
  policyVersion: string | null;
  consentedAt: string | null;
  isCurrentVersion: boolean;
  withdrawn: boolean;
}

/**
 * Record explicit consent from a user.
 * Creates the internal user + tenant mapping if needed (first-time consent before enrollment).
 */
export async function recordConsent(
  tenantId: string,
  externalUserId: string,
  policyVersion: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<{ success: boolean; message: string; consentedAt: string }> {
  const internalUsername = tenantRepo.toInternalUsername(tenantId, externalUserId);

  // Find or create internal user + mapping
  let mapping = await tenantRepo.findTenantUser(tenantId, externalUserId);
  if (!mapping) {
    const user = await userRepo.createUser(internalUsername);
    mapping = await tenantRepo.createTenantUser(tenantId, externalUserId, user.id);
  }

  const consent = await consentRepo.recordConsent(
    tenantId,
    mapping.user_id,
    externalUserId,
    policyVersion,
    ipAddress,
    userAgent,
  );

  return {
    success: true,
    message: 'Consent recorded.',
    consentedAt: consent.consented_at,
  };
}

/**
 * Get the consent status for a user.
 * Returns whether they have an active consent for the current policy version.
 */
export async function getConsentStatus(
  tenantId: string,
  externalUserId: string,
): Promise<ConsentStatus> {
  const mapping = await tenantRepo.findTenantUser(tenantId, externalUserId);
  if (!mapping) {
    return {
      hasConsented: false,
      policyVersion: null,
      consentedAt: null,
      isCurrentVersion: false,
      withdrawn: false,
    };
  }

  const latest = await consentRepo.getLatestConsent(tenantId, mapping.user_id);
  if (!latest) {
    return {
      hasConsented: false,
      policyVersion: null,
      consentedAt: null,
      isCurrentVersion: false,
      withdrawn: false,
    };
  }

  const withdrawn = latest.withdrawn_at !== null;
  const isCurrentVersion = latest.policy_version === CURRENT_POLICY_VERSION;

  return {
    hasConsented: !withdrawn && isCurrentVersion,
    policyVersion: latest.policy_version,
    consentedAt: latest.consented_at,
    isCurrentVersion,
    withdrawn,
  };
}

/**
 * Withdraw all consent for a user AND immediately delete their biometric data.
 * Consent records are preserved (BIPA/GDPR require 7-year retention).
 * Required for GDPR Article 7(3) — withdrawal must be as easy as giving consent.
 */
export async function withdrawConsent(
  tenantId: string,
  externalUserId: string,
): Promise<{ success: boolean; message: string; deletionSummary?: DeletionSummary }> {
  const mapping = await tenantRepo.findTenantUser(tenantId, externalUserId);
  if (!mapping) {
    return { success: false, message: 'User not found.' };
  }

  // Mark consent withdrawn first
  await consentRepo.withdrawConsent(tenantId, mapping.user_id);

  // Immediately delete all biometric data (samples, baselines, attempts)
  // The user row and tenant mapping are removed — consent records are preserved
  const internalUsername = tenantRepo.toInternalUsername(tenantId, externalUserId);
  const deletionSummary = await userRepo.deleteUser(mapping.user_id, internalUsername);

  // Also remove the tenant_users mapping (user no longer exists in our system)
  await tenantRepo.deleteTenantUser(tenantId, externalUserId);

  return {
    success: true,
    message: 'Consent withdrawn and all biometric data permanently deleted.',
    deletionSummary,
  };
}

/**
 * Fully delete a user and all their biometric data.
 * Used for explicit right-to-erasure requests (BIPA/GDPR).
 * Consent records are preserved for 7-year legal retention.
 */
export async function deleteUser(
  tenantId: string,
  externalUserId: string,
): Promise<{ success: boolean; message: string; deletionSummary?: DeletionSummary }> {
  const mapping = await tenantRepo.findTenantUser(tenantId, externalUserId);
  if (!mapping) {
    return { success: false, message: 'User not found.' };
  }

  // Mark any active consents as withdrawn before deletion
  await consentRepo.withdrawConsent(tenantId, mapping.user_id);

  const internalUsername = tenantRepo.toInternalUsername(tenantId, externalUserId);
  const deletionSummary = await userRepo.deleteUser(mapping.user_id, internalUsername);

  // Remove the tenant_users mapping (consent records are kept, user row is gone)
  await tenantRepo.deleteTenantUser(tenantId, externalUserId);

  return {
    success: true,
    message: 'User and all biometric data permanently deleted. Consent records retained for compliance.',
    deletionSummary,
  };
}

/**
 * Gate check: verify a user has active consent before enrollment.
 * Returns an error message if consent is missing, or null if OK.
 */
export async function checkConsentGate(
  tenantId: string,
  externalUserId: string,
): Promise<string | null> {
  const status = await getConsentStatus(tenantId, externalUserId);

  if (!status.hasConsented) {
    if (status.withdrawn) {
      return 'User has withdrawn consent. Re-consent required before enrollment.';
    }
    if (status.policyVersion && !status.isCurrentVersion) {
      return `Consent was for policy version ${status.policyVersion}. Current version is ${CURRENT_POLICY_VERSION}. Re-consent required.`;
    }
    return 'Explicit consent required before biometric enrollment. Call POST /api/v1/consent first.';
  }

  return null;
}
