import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
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
  has_pressure_data: number;
  created_at: string;
  updated_at: string;
}

export function createSample(
  userId: string,
  sampleNumber: number,
  strokeData: RawSignatureData,
  features: AllFeatures,
  mlFeatures: MLFeatureVector,
  deviceCapabilities: DeviceCapabilities,
): EnrollmentSampleRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO enrollment_samples (id, user_id, sample_number, stroke_data, features, ml_features, device_capabilities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    sampleNumber,
    encryptJson(strokeData),
    encryptJson(features),
    encryptJson(mlFeatures),
    JSON.stringify(deviceCapabilities), // not biometric — no encryption needed
  );
  return db.prepare('SELECT * FROM enrollment_samples WHERE id = ?').get(id) as EnrollmentSampleRow;
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

export function getSampleCount(userId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM enrollment_samples WHERE user_id = ?').get(userId) as { count: number };
  return row.count;
}

export function getSamples(userId: string): EnrollmentSampleRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM enrollment_samples WHERE user_id = ? ORDER BY sample_number'
  ).all(userId) as EnrollmentSampleRow[];
  return rows.map(decryptSampleRow);
}

export function upsertBaseline(
  userId: string,
  avgFeatures: AllFeatures,
  avgMlFeatures: MLFeatureVector,
  featureStdDevs: Record<string, number>,
  hasPressureData: boolean,
): BaselineRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO baselines (id, user_id, avg_features, avg_ml_features, feature_std_devs, has_pressure_data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      avg_features = excluded.avg_features,
      avg_ml_features = excluded.avg_ml_features,
      feature_std_devs = excluded.feature_std_devs,
      has_pressure_data = excluded.has_pressure_data,
      updated_at = datetime('now')
  `).run(
    id,
    userId,
    encryptJson(avgFeatures),
    encryptJson(avgMlFeatures),
    encryptJson(featureStdDevs),
    hasPressureData ? 1 : 0,
  );
  return db.prepare('SELECT * FROM baselines WHERE user_id = ?').get(userId) as BaselineRow;
}

export function getBaseline(userId: string): BaselineRow | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM baselines WHERE user_id = ?').get(userId) as BaselineRow | undefined;
  return row ? decryptBaselineRow(row) : undefined;
}
