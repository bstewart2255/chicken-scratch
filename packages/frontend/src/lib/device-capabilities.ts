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
  const supportsPressure = 'PointerEvent' in window &&
    'pressure' in (PointerEvent.prototype || {});

  const supportsTouch = 'ontouchstart' in window ||
    navigator.maxTouchPoints > 0;

  let inputMethod: DeviceCapabilities['inputMethod'] = 'mouse';
  if (supportsTouch && supportsPressure) {
    inputMethod = 'stylus';
  } else if (supportsTouch) {
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
