/**
 * @chicken-scratch/capture — the shared stroke-capture UI.
 *
 * One source of truth for the canvas, device-capability detection, and
 * stroke collection, used by both the main frontend and the standalone
 * forgery-study app. Drawn strokes must be captured identically across
 * apps or scores stop being comparable to production — hence one package.
 */
export { SignatureCanvas } from './components/SignatureCanvas';
export { ShapeCanvas } from './components/ShapeCanvas';
export { useSignaturePad } from './hooks/useSignaturePad';
export { useDeviceCapabilities } from './hooks/useDeviceCapabilities';
export { collectStrokes, buildSignatureData } from './lib/stroke-collector';
export { TiltCapture } from './lib/tilt-capture';
export type { TiltEntry } from './lib/tilt-capture';
export { detectDeviceCapabilities } from './lib/device-capabilities';
export { collectDeviceFingerprint } from './lib/device-fingerprint';
