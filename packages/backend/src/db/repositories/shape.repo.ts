import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
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

export async function createShapeSample(
  userId: string,
  shapeType: ChallengeItemType,
  strokeData: RawSignatureData,
  biometricFeatures: AllFeatures,
  shapeFeatures: ShapeSpecificFeatures | null,
  deviceCapabilities: DeviceCapabilities,
): Promise<ShapeSampleRow> {
  const id = uuid();
  const result = await query<ShapeSampleRow>(`
    INSERT INTO shape_samples (id, user_id, shape_type, stroke_data, biometric_features, shape_features, device_capabilities)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(user_id, shape_type) DO UPDATE SET
      stroke_data = EXCLUDED.stroke_data,
      biometric_features = EXCLUDED.biometric_features,
      shape_features = EXCLUDED.shape_features,
      device_capabilities = EXCLUDED.device_capabilities
    RETURNING *
  `, [
    id,
    userId,
    shapeType,
    encryptJson(strokeData),
    encryptJson(biometricFeatures),
    shapeFeatures !== null ? encryptJson(shapeFeatures) : JSON.stringify(null),
    JSON.stringify(deviceCapabilities),
  ]);
  return result.rows[0];
}

export async function getShapeSample(userId: string, shapeType: ChallengeItemType): Promise<ShapeSampleRow | undefined> {
  const result = await query<ShapeSampleRow>(
    'SELECT * FROM shape_samples WHERE user_id = $1 AND shape_type = $2',
    [userId, shapeType],
  );
  const row = result.rows[0];
  return row ? decryptSampleRow(row) : undefined;
}

export async function getShapeSamples(userId: string): Promise<ShapeSampleRow[]> {
  const result = await query<ShapeSampleRow>(
    'SELECT * FROM shape_samples WHERE user_id = $1 ORDER BY shape_type',
    [userId],
  );
  return result.rows.map(decryptSampleRow);
}

export async function upsertShapeBaseline(
  userId: string,
  shapeType: ChallengeItemType,
  avgBiometricFeatures: AllFeatures,
  avgShapeFeatures: ShapeSpecificFeatures | null,
): Promise<ShapeBaselineRow> {
  const id = uuid();
  const result = await query<ShapeBaselineRow>(`
    INSERT INTO shape_baselines (id, user_id, shape_type, avg_biometric_features, avg_shape_features)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(user_id, shape_type) DO UPDATE SET
      avg_biometric_features = EXCLUDED.avg_biometric_features,
      avg_shape_features = EXCLUDED.avg_shape_features,
      updated_at = NOW()
    RETURNING *
  `, [
    id,
    userId,
    shapeType,
    encryptJson(avgBiometricFeatures),
    avgShapeFeatures !== null ? encryptJson(avgShapeFeatures) : JSON.stringify(null),
  ]);
  return result.rows[0];
}

export async function getShapeBaseline(userId: string, shapeType: ChallengeItemType): Promise<ShapeBaselineRow | undefined> {
  const result = await query<ShapeBaselineRow>(
    'SELECT * FROM shape_baselines WHERE user_id = $1 AND shape_type = $2',
    [userId, shapeType],
  );
  const row = result.rows[0];
  return row ? decryptBaselineRow(row) : undefined;
}

export async function getShapeBaselines(userId: string): Promise<ShapeBaselineRow[]> {
  const result = await query<ShapeBaselineRow>(
    'SELECT * FROM shape_baselines WHERE user_id = $1 ORDER BY shape_type',
    [userId],
  );
  return result.rows.map(decryptBaselineRow);
}
