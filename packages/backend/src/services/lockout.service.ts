import { query } from '../db/connection.js';
import { THRESHOLDS } from '@chicken-scratch/shared';

export interface LockoutStatus {
  locked: boolean;
  lockedUntil?: Date;
  failureCount?: number;
  retryAfterSeconds?: number;
}

/**
 * Check whether a user is currently locked out due to too many failed attempts.
 *
 * Logic: if there are >= LOCKOUT_MAX_FAILURES failed attempts within the last
 * LOCKOUT_WINDOW_MS, the user is locked until the oldest of those failures
 * is older than LOCKOUT_DURATION_MS.
 */
export async function checkLockout(userId: string): Promise<LockoutStatus> {
  const windowStart = new Date(Date.now() - THRESHOLDS.LOCKOUT_WINDOW_MS);

  const result = await query<{ created_at: string }>(`
    SELECT created_at FROM auth_attempts
    WHERE user_id = $1
      AND authenticated = FALSE
      AND created_at >= $2
    ORDER BY created_at DESC
    LIMIT $3
  `, [userId, windowStart.toISOString(), THRESHOLDS.LOCKOUT_MAX_FAILURES]);

  const failures = result.rows;

  if (failures.length >= THRESHOLDS.LOCKOUT_MAX_FAILURES) {
    // The Nth-oldest failure is the one that triggered the lockout
    const triggerFailure = new Date(failures[THRESHOLDS.LOCKOUT_MAX_FAILURES - 1].created_at);
    const lockedUntil = new Date(triggerFailure.getTime() + THRESHOLDS.LOCKOUT_DURATION_MS);

    if (lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      return {
        locked: true,
        lockedUntil,
        failureCount: failures.length,
        retryAfterSeconds,
      };
    }
  }

  return { locked: false, failureCount: failures.length };
}

/**
 * Get a human-readable lockout message.
 */
export function lockoutMessage(status: LockoutStatus): string {
  const mins = Math.ceil((status.retryAfterSeconds ?? 0) / 60);
  return `Account temporarily locked after ${THRESHOLDS.LOCKOUT_MAX_FAILURES} failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
}
