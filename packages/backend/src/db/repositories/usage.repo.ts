import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';

export interface UsageCountRow {
  event_type: string;
  count: string;
}

export interface UsageTimeSeriesRow {
  date: string;
  enrollments: string;
  verifications: string;
}

export interface FleetStatsRow {
  total_verifications: string;
  verifications_today: string;
  recent_failure_rate: number;
}

export async function recordEvent(
  tenantId: string,
  eventType: 'enroll' | 'verify' | 'session' | 'consent',
  userId?: string,
): Promise<void> {
  const id = uuid();
  await query(
    `INSERT INTO usage_events (id, tenant_id, event_type, user_id) VALUES ($1, $2, $3, $4)`,
    [id, tenantId, eventType, userId ?? null],
  );
}

export async function getUsageTimeSeries(tenantId: string, days: number = 30): Promise<UsageTimeSeriesRow[]> {
  const result = await query<UsageTimeSeriesRow>(
    `SELECT
      date(created_at) AS date,
      SUM(CASE WHEN event_type = 'enroll' THEN 1 ELSE 0 END) AS enrollments,
      SUM(CASE WHEN event_type = 'verify' THEN 1 ELSE 0 END) AS verifications
    FROM usage_events
    WHERE tenant_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY date(created_at)
    ORDER BY date ASC`,
    [tenantId, days],
  );
  return result.rows;
}

export async function getFleetStats(): Promise<FleetStatsRow> {
  const result = await query<FleetStatsRow>(
    `SELECT
      (SELECT COUNT(*) FROM auth_attempts)::TEXT AS total_verifications,
      (SELECT COUNT(*) FROM auth_attempts WHERE created_at >= CURRENT_DATE)::TEXT AS verifications_today,
      COALESCE(
        (SELECT CAST(SUM(CASE WHEN authenticated = FALSE THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
         FROM auth_attempts
         WHERE created_at >= NOW() - INTERVAL '7 days'),
        0
      ) AS recent_failure_rate`,
  );
  return result.rows[0];
}
