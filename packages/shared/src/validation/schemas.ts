import { z } from 'zod';

const StrokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().min(0).max(1),
  timestamp: z.number(),
  tiltX: z.number().optional(),
  tiltY: z.number().optional(),
});

const StrokeSchema = z.object({
  points: z.array(StrokePointSchema).min(1),
  startTime: z.number(),
  endTime: z.number(),
});

const DeviceFingerprintSchema = z.object({
  canvasHash: z.string(),
  webglRenderer: z.string(),
  webglVendor: z.string(),
  screenWidth: z.number(),
  screenHeight: z.number(),
  devicePixelRatio: z.number(),
  maxTouchPoints: z.number(),
  hardwareConcurrency: z.number(),
  deviceMemory: z.number().nullable(),
  timezone: z.string(),
  language: z.string(),
  languages: z.array(z.string()),
  platform: z.string(),
  colorDepth: z.number(),
  userAgent: z.string(),
}).optional();

const DeviceCapabilitiesSchema = z.object({
  supportsPressure: z.boolean(),
  supportsTouch: z.boolean(),
  inputMethod: z.enum(['mouse', 'touch', 'stylus']),
  browser: z.string(),
  os: z.string(),
  fingerprint: DeviceFingerprintSchema,
});

const RawSignatureDataSchema = z.object({
  strokes: z.array(StrokeSchema).min(1),
  canvasSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  deviceCapabilities: DeviceCapabilitiesSchema,
  capturedAt: z.string().datetime(),
});

/**
 * Username constraints — applied uniformly to every endpoint that accepts
 * one. Accepts both raw usernames (signed-up via the internal flow) AND
 * tenant-prefixed internal usernames (`t:<tenantUuid>:<externalUserId>`)
 * that flow through the mobile-session handoff. Tenant prefixes are 38
 * characters (`t:` + 36-char UUID + `:`) before the externalUserId.
 *
 * - max(150): accommodates 38-char tenant prefix + reasonable externalUserId
 *   (the tenant API caps externalUserId at ~100 chars in the route handler).
 * - regex allows colons so `t:<uuid>:<externalUserId>` passes. Still
 *   disallows slashes, spaces, and other characters that could cause
 *   URL / log-injection issues. Underscores and hyphens were already
 *   permitted for externalUserIds like `demo-c11c20229039`.
 */
const USERNAME_SCHEMA = z.string().min(1).max(150).regex(/^[a-zA-Z0-9_:-]+$/);

export const EnrollmentRequestSchema = z.object({
  username: USERNAME_SCHEMA,
  signatureData: RawSignatureDataSchema,
});

export const VerifyRequestSchema = z.object({
  username: USERNAME_SCHEMA,
  signatureData: RawSignatureDataSchema,
});

export const ShapeEnrollmentRequestSchema = z.object({
  username: USERNAME_SCHEMA,
  shapeType: z.enum(['circle', 'square', 'triangle', 'house', 'smiley']),
  signatureData: RawSignatureDataSchema,
});

const ShapeDataSchema = z.object({
  shapeType: z.enum(['circle', 'square', 'triangle', 'house', 'smiley']),
  signatureData: RawSignatureDataSchema,
});

export const FullVerifyRequestSchema = z.object({
  username: USERNAME_SCHEMA,
  signatureData: RawSignatureDataSchema,
  shapes: z.array(ShapeDataSchema).min(1).max(5),
  challengeId: z.string().uuid(),
  durationMs: z.number().int().positive().optional(),
  stepDurations: z.array(z.object({
    step: z.string(),
    durationMs: z.number().int().nonnegative(),
  })).optional(),
});

export const CreateSessionRequestSchema = z.object({
  username: USERNAME_SCHEMA,
  type: z.enum(['enroll', 'verify']),
});

export type ValidatedEnrollmentRequest = z.infer<typeof EnrollmentRequestSchema>;
export type ValidatedVerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type ValidatedShapeEnrollmentRequest = z.infer<typeof ShapeEnrollmentRequestSchema>;
export type ValidatedFullVerifyRequest = z.infer<typeof FullVerifyRequestSchema>;
