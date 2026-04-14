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

export const EnrollmentRequestSchema = z.object({
  username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  signatureData: RawSignatureDataSchema,
});

export const VerifyRequestSchema = z.object({
  username: z.string().min(1).max(50),
  signatureData: RawSignatureDataSchema,
});

export const ShapeEnrollmentRequestSchema = z.object({
  username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  shapeType: z.enum(['circle', 'square', 'triangle', 'house', 'smiley']),
  signatureData: RawSignatureDataSchema,
});

const ShapeDataSchema = z.object({
  shapeType: z.enum(['circle', 'square', 'triangle', 'house', 'smiley']),
  signatureData: RawSignatureDataSchema,
});

export const FullVerifyRequestSchema = z.object({
  username: z.string().min(1).max(50),
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
  username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(['enroll', 'verify']),
});

export type ValidatedEnrollmentRequest = z.infer<typeof EnrollmentRequestSchema>;
export type ValidatedVerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type ValidatedShapeEnrollmentRequest = z.infer<typeof ShapeEnrollmentRequestSchema>;
export type ValidatedFullVerifyRequest = z.infer<typeof FullVerifyRequestSchema>;
