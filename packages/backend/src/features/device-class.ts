import type { DeviceClass, RawSignatureData } from '@chicken-scratch/shared';

/**
 * Derive device class from captured signature data.
 *
 * The biometric signal from a finger on a touchscreen (low-precision, no
 * reliable pressure, broad stroke geometry) differs enough from a precision
 * pointer (mouse/trackpad/stylus) that baselines aren't interchangeable.
 * We bucket accordingly: anything touch-based is `mobile`; anything pointer-
 * based (mouse, trackpad, pen) is `desktop`.
 *
 * Caveat: Apple Pencil on an iPad currently lands in `desktop` because its
 * input method is 'stylus' (precision pointer). If product data shows this
 * is confusing to users, split into a third `stylus` class — the schema
 * already accepts an arbitrary device_class string, this helper is the only
 * place that mints the value.
 */
export function detectDeviceClass(data: RawSignatureData): DeviceClass {
  const inputMethod = data.deviceCapabilities?.inputMethod;
  if (inputMethod === 'touch') return 'mobile';
  // 'mouse' | 'stylus' | anything-else falls through to desktop. We default
  // rather than throw so old/malformed capability payloads don't block auth
  // outright — the scoring will still reject if the signal doesn't match.
  return 'desktop';
}
