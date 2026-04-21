import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import type { DeviceClass } from '@chicken-scratch/shared';

export type EventType =
  | 'enrollment_completed'
  | 'verification_passed'
  | 'verification_failed'
  | 'device_class_mismatch'
  | 'recovery_gate_blocked'
  | 'lockout_triggered'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'user_deleted';

export interface EventRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  external_user_id: string | null;
  event_type: EventType;
  device_class: DeviceClass | null;
  metadata: string | null;
  created_at: string;
}

export interface CreateEventInput {
  tenantId: string;
  userId?: string | null;
  externalUserId?: string | null;
  eventType: EventType;
  deviceClass?: DeviceClass | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append an event to the audit log. Never throws — audit writes are
 * best-effort; a failure to log should not fail the underlying operation.
 * Errors are logged to stderr for operator visibility.
 */
export async function recordEvent(input: CreateEventInput): Promise<void> {
  try {
    await query(`
      INSERT INTO events (id, tenant_id, user_id, external_user_id, event_type, device_class, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      uuid(),
      input.tenantId,
      input.userId ?? null,
      input.externalUserId ?? null,
      input.eventType,
      input.deviceClass ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]);
  } catch (err) {
    console.error(`[events.repo] Failed to record ${input.eventType} event for tenant ${input.tenantId}:`, err);
  }
}

export interface ListEventsOptions {
  limit?: number;    // default 50, max 200
  before?: string;   // ISO timestamp; returns events strictly older than this (cursor pagination)
  eventType?: EventType;
}

export interface ListEventsResult {
  events: EventRow[];
  /** If the page is full, a cursor the client can pass as `before` next call. */
  nextBefore: string | null;
}

/**
 * Tenant-scoped event listing, optionally filtered by user and/or type.
 * Uses cursor pagination on created_at (descending) — pass the last
 * event's created_at as `before` on the next request.
 */
export async function listEvents(
  tenantId: string,
  externalUserId: string | null,
  options: ListEventsOptions = {},
): Promise<ListEventsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const params: unknown[] = [tenantId];
  const where: string[] = ['tenant_id = $1'];

  if (externalUserId) {
    params.push(externalUserId);
    where.push(`external_user_id = $${params.length}`);
  }
  if (options.eventType) {
    params.push(options.eventType);
    where.push(`event_type = $${params.length}`);
  }
  if (options.before) {
    params.push(options.before);
    where.push(`created_at < $${params.length}`);
  }

  // Over-fetch by 1 to detect whether a next page exists.
  params.push(limit + 1);
  const sql = `
    SELECT * FROM events
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const result = await query<EventRow>(sql, params);
  const rows = result.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextBefore = hasMore ? page[page.length - 1].created_at : null;

  return { events: page, nextBefore };
}
