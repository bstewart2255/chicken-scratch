import { v4 as uuid } from 'uuid';
import { getDb } from '../connection.js';
import { encryptJson, decrypt } from '../../utils/crypto.js';
import type { AllFeatures, RawSignatureData, DeviceCapabilities, ChallengeItemType, ShapeSpecificFeatures } from '@chicken-scratch/shared';

export interface ShapeSampleRow {
  id: string;
  user_id: string;
  shape_type: string;
  stroke_data: string;
  biometric_features: string;
  shape_features: string;
  device_capabilities: string;
  created_at: string;
}

export interface ShapeBaselineRow {
  id: string;
  user_id: string;
  shape_type: string;
  avg_biometric_features: string;
  avg_shape_features: string;
  created_at: string;
  updated_at: string;
}

function decryptSampleRow(row: ShapeSampleRow): ShapeSampleRow {
  return {
    ...row,
    stroke_data: decrypt(row.stroke_data),
    biometric_features: decrypt(row.biometric_features),
    shape_features: row.shape_features ? decrypt(row.shape_features) : row.shape_features,
  };
}

function decryptBaselineRow(row: ShapeBaselineRow): ShapeBaselineRow {
  return {
    ...row,
    avg_biometric_features: decrypt(row.avg_biometric_features),
    avg_shape_features: row.avg_shape_features ? decrypt(row.avg_shape_features) : row.avg_shape_features,
  };
}

export function createShapeSample(
  userId: string,
  shapeType: ChallengeItemType,
  strokeData: RawSignatureData,
  biometricFeatures: AllFeatures,
  shapeFeatures: ShapeSpecificFeatures | null,
  deviceCapabilities: DeviceCapabilities,
): ShapeSampleRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO shape_samples (id, user_id, shape_type, stroke_data, biometric_features, shape_features, device_capabilities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, shape_type) DO UPDATE SET
      stroke_data = excluded.stroke_data,
      biometric_features = excluded.biometric_features,
      shape_features = excluded.shape_features,
      device_capabilities = excluded.device_capabilities
  `).run(
    id,
    userId,
    shapeType,
    encryptJson(strokeData),
    encryptJson(biometricFeatures),
    shapeFeatures !== null ? encryptJson(shapeFeatures) : JSON.stringify(null),
    JSON.stringify(deviceCapabilities), // not biometric — no encryption needed
  );
  return db.prepare('SELECT * FROM shape_samples WHERE user_id = ? AND shape_type = ?').get(userId, shapeType) as ShapeSampleRow;
}

export function getShapeSample(userId: string, shapeType: ChallengeItemType): ShapeSampleRow | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM shape_samples WHERE user_id = ? AND shape_type = ?'
  ).get(userId, shapeType) as ShapeSampleRow | undefined;
  return row ? decryptSampleRow(row) : undefined;
}

export function getShapeSamples(userId: string): ShapeSampleRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM shape_samples WHERE user_id = ? ORDER BY shape_type'
  ).all(userId) as ShapeSampleRow[];
  return rows.map(decryptSampleRow);
}

export function upsertShapeBaseline(
  userId: string,
  shapeType: ChallengeItemType,
  avgBiometricFeatures: AllFeatures,
  avgShapeFeatures: ShapeSpecificFeatures | null,
): ShapeBaselineRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO shape_baselines (id, user_id, shape_type, avg_biometric_features, avg_shape_features)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, shape_type) DO UPDATE SET
      avg_biometric_features = excluded.avg_biometric_features,
      avg_shape_features = excluded.avg_shape_features,
      updated_at = datetime('now')
  `).run(
    id,
    userId,
    shapeType,
    encryptJson(avgBiometricFeatures),
    avgShapeFeatures !== null ? encryptJson(avgShapeFeatures) : JSON.stringify(null),
  );
  return db.prepare('SELECT * FROM shape_baselines WHERE user_id = ? AND shape_type = ?').get(userId, shapeType) as ShapeBaselineRow;
}

export function getShapeBaseline(userId: string, shapeType: ChallengeItemType): ShapeBaselineRow | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM shape_baselines WHERE user_id = ? AND shape_type = ?'
  ).get(userId, shapeType) as ShapeBaselineRow | undefined;
  return row ? decryptBaselineRow(row) : undefined;
}

export function getShapeBaselines(userId: string): ShapeBaselineRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM shape_baselines WHERE user_id = ? ORDER BY shape_type'
  ).all(userId) as ShapeBaselineRow[];
  return rows.map(decryptBaselineRow);
}
