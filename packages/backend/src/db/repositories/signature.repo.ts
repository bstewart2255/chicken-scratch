import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import { encryptJson, decrypt } from '../../utils/crypto.js';
import type { AllFeatures, MLFeatureVector, RawSignatureData, DeviceCapabilities } from '@chicken-scratch/shared';

export interface EnrollmentSampleRow {
  id: string;
  user_id: string;
  sample_number: number;
  stroke_data: string;
  features: string;
  ml_features: string;
  device_capabilities: string;
  created_at: string;
}

export interface BaselineRow {
  id: string;
  user_id: string;
  avg_features: string;
  avg_ml_features: string;
  feature_std_devs: string;
  has_pressure_data: boolean;
  created_at: string;
  updated_at: string;
}

function decryptSampleRow(row: EnrollmentSampleRow): EnrollmentSampleRow {
  return {
    ...row,
    stroke_data: decrypt(row.stroke_data),
    features: decrypt(row.features),
    ml_features: decrypt(row.ml_features),
  };
}

function decryptBaselineRow(row: BaselineRow): BaselineRow {
  return {
    ...row,
    avg_features: decrypt(row.avg_features),
    avg_ml_features: decrypt(row.avg_ml_features),
    feature_std_devs: decrypt(row.feature_std_devs),
  };
}

export async function createSample(
  userId: string,
  sampleNumber: number,
  strokeData: RawSignatureData,
  features: AllFeatures,
  mlFeatures: MLFeatureVector,
  deviceCapabilities: DeviceCapabilities,
): Promise<EnrollmentSampleRow> {
  const id = uuid();
  const result = await query<EnrollmentSampleRow>(`
    INSERT INTO enrollment_samples (id, user_id, sample_number, stroke_data, features, ml_features, device_capabilities)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    id,
    userId,
    sampleNumber,
    encryptJson(strokeData),
    encryptJson(features),
    encryptJson(mlFeatures),
    JSON.stringify(deviceCapabilities),
  ]);
  return result.rows[0];
}

export async function getSampleCount(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM enrollment_samples WHERE user_id = $1',
    [userId],
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getSamples(userId: string): Promise<EnrollmentSampleRow[]> {
  const result = await query<EnrollmentSampleRow>(
    'SELECT * FROM enrollment_samples WHERE user_id = $1 ORDER BY sample_number',
    [userId],
  );
  return result.rows.map(decryptSampleRow);
}

export async function upsertBaseline(
  userId: string,
  avgFeatures: AllFeatures,
  avgMlFeatures: MLFeatureVector,
  featureStdDevs: Record<string, number>,
  hasPressureData: boolean,
): Promise<BaselineRow> {
  const id = uuid();
  const result = await query<BaselineRow>(`
    INSERT INTO baselines (id, user_id, avg_features, avg_ml_features, feature_std_devs, has_pressure_data)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(user_id) DO UPDATE SET
      avg_features = EXCLUDED.avg_features,
      avg_ml_features = EXCLUDED.avg_ml_features,
      feature_std_devs = EXCLUDED.feature_std_devs,
      has_pressure_data = EXCLUDED.has_pressure_data,
      updated_at = NOW()
    RETURNING *
  `, [
    id,
    userId,
    encryptJson(avgFeatures),
    encryptJson(avgMlFeatures),
    encryptJson(featureStdDevs),
    hasPressureData,
  ]);
  return result.rows[0];
}

export async function getBaseline(userId: string): Promise<BaselineRow | undefined> {
  const result = await query<BaselineRow>(
    'SELECT * FROM baselines WHERE user_id = $1',
    [userId],
  );
  const row = result.rows[0];
  return row ? decryptBaselineRow(row) : undefined;
}
