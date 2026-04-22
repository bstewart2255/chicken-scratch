import { v4 as uuid } from 'uuid';
import { query } from '../connection.js';
import { encryptJson, decrypt } from '../../utils/crypto.js';
import type { AllFeatures, RawSignatureData, DeviceCapabilities, ChallengeItemType, ShapeSpecificFeatures, DeviceClass } from '@chicken-scratch/shared';

export interface ShapeSampleRow {
  id: string;
  user_id: string;
  shape_type: string;
  stroke_data: string;
  biometric_features: string;
  shape_features: string;
  device_capabilities: string;
  device_class: DeviceClass;
  created_at: string;
}

export interface ShapeBaselineRow {
  id: string;
  user_id: string;
  shape_type: string;
  avg_biometric_features: string;
  avg_shape_features: string;
  /**
   * Per-user per-feature stddevs for Mahalanobis scaling of the biometric
   * sub-score. Null when the baseline pre-dates migration 019 (v3 truncated
   * prod, so in practice null only appears on local/staging data enrolled
   * before the deploy). The matcher handles null by falling back to the
   * legacy relative-error formula.
   *
   * Format: encrypted JSON of Record<string, number> keyed "<bucket>.<feature>"
   * (e.g. "timing.rhythmConsistency"), identical shape to baselines.feature_std_devs.
   */
  biometric_std_devs: string | null;
  device_class: DeviceClass;
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
    biometric_std_devs: row.biometric_std_devs ? decrypt(row.biometric_std_devs) : row.biometric_std_devs,
  };
}

export async function createShapeSample(
  userId: string,
  shapeType: ChallengeItemType,
  strokeData: RawSignatureData,
  biometricFeatures: AllFeatures,
  shapeFeatures: ShapeSpecificFeatures | null,
  deviceCapabilities: DeviceCapabilities,
  deviceClass: DeviceClass,
): Promise<ShapeSampleRow> {
  const id = uuid();
  const result = await query<ShapeSampleRow>(`
    INSERT INTO shape_samples (id, user_id, shape_type, stroke_data, biometric_features, shape_features, device_capabilities, device_class)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT(user_id, shape_type, device_class) DO UPDATE SET
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
    deviceClass,
  ]);
  return result.rows[0];
}

export async function getShapeSample(
  userId: string,
  shapeType: ChallengeItemType,
  deviceClass: DeviceClass,
): Promise<ShapeSampleRow | undefined> {
  const result = await query<ShapeSampleRow>(
    'SELECT * FROM shape_samples WHERE user_id = $1 AND shape_type = $2 AND device_class = $3',
    [userId, shapeType, deviceClass],
  );
  const row = result.rows[0];
  return row ? decryptSampleRow(row) : undefined;
}

export async function getShapeSamples(userId: string, deviceClass?: DeviceClass): Promise<ShapeSampleRow[]> {
  // Optional deviceClass filter: diagnostics code wants all samples across classes;
  // enrollment flow only cares about the current class.
  const sql = deviceClass
    ? 'SELECT * FROM shape_samples WHERE user_id = $1 AND device_class = $2 ORDER BY shape_type'
    : 'SELECT * FROM shape_samples WHERE user_id = $1 ORDER BY shape_type';
  const params = deviceClass ? [userId, deviceClass] : [userId];
  const result = await query<ShapeSampleRow>(sql, params);
  return result.rows.map(decryptSampleRow);
}

export async function upsertShapeBaseline(
  userId: string,
  shapeType: ChallengeItemType,
  avgBiometricFeatures: AllFeatures,
  avgShapeFeatures: ShapeSpecificFeatures | null,
  biometricStdDevs: Record<string, number> | null,
  deviceClass: DeviceClass,
): Promise<ShapeBaselineRow> {
  const id = uuid();
  const result = await query<ShapeBaselineRow>(`
    INSERT INTO shape_baselines (id, user_id, shape_type, avg_biometric_features, avg_shape_features, biometric_std_devs, device_class)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(user_id, shape_type, device_class) DO UPDATE SET
      avg_biometric_features = EXCLUDED.avg_biometric_features,
      avg_shape_features = EXCLUDED.avg_shape_features,
      biometric_std_devs = EXCLUDED.biometric_std_devs,
      updated_at = NOW()
    RETURNING *
  `, [
    id,
    userId,
    shapeType,
    encryptJson(avgBiometricFeatures),
    avgShapeFeatures !== null ? encryptJson(avgShapeFeatures) : JSON.stringify(null),
    biometricStdDevs !== null ? encryptJson(biometricStdDevs) : null,
    deviceClass,
  ]);
  return result.rows[0];
}

export async function getShapeBaseline(
  userId: string,
  shapeType: ChallengeItemType,
  deviceClass: DeviceClass,
): Promise<ShapeBaselineRow | undefined> {
  const result = await query<ShapeBaselineRow>(
    'SELECT * FROM shape_baselines WHERE user_id = $1 AND shape_type = $2 AND device_class = $3',
    [userId, shapeType, deviceClass],
  );
  const row = result.rows[0];
  return row ? decryptBaselineRow(row) : undefined;
}

export async function getShapeBaselines(userId: string, deviceClass?: DeviceClass): Promise<ShapeBaselineRow[]> {
  const sql = deviceClass
    ? 'SELECT * FROM shape_baselines WHERE user_id = $1 AND device_class = $2 ORDER BY shape_type'
    : 'SELECT * FROM shape_baselines WHERE user_id = $1 ORDER BY shape_type';
  const params = deviceClass ? [userId, deviceClass] : [userId];
  const result = await query<ShapeBaselineRow>(sql, params);
  return result.rows.map(decryptBaselineRow);
}
