import type { DeviceCapabilities } from '@chicken-scratch/shared';
import { collectDeviceFingerprint } from './device-fingerprint.js';

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  return 'Unknown';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  // `supportsPressure` reports whether the PointerEvent API exposes a
  // `pressure` field — NOT whether a stylus is in use. iPhone Safari
  // reports supportsPressure=true with fingers (always 0 for real touch,
  // but the field exists). The old heuristic "supportsTouch &&
  // supportsPressure → stylus" mis-classified every iPhone finger-touch
  // as stylus, which cascaded server-side to device_class='desktop'
  // (detectDeviceClass maps stylus → desktop), producing a baseline that
  // a desktop verify could match against despite being a completely
  // different biometric modality.
  //
  // Real finger-vs-stylus disambiguation can only happen at pointer-event
  // time via `PointerEvent.pointerType === 'pen'`. The stroke collector
  // could upgrade inputMethod → 'stylus' there if product requires it.
  const supportsPressure = 'PointerEvent' in window &&
    'pressure' in (PointerEvent.prototype || {});

  const supportsTouch = 'ontouchstart' in window ||
    navigator.maxTouchPoints > 0;

  let inputMethod: DeviceCapabilities['inputMethod'] = 'mouse';
  if (supportsTouch) {
    inputMethod = 'touch';
  }

  return {
    supportsPressure,
    supportsTouch,
    inputMethod,
    browser: detectBrowser(),
    os: detectOS(),
    fingerprint: collectDeviceFingerprint(),
  };
}
