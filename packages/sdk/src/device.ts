import type { DeviceCapabilities, DeviceFingerprint } from './types.js';

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

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}

function generateCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '14px Arial';
    ctx.fillText('chickenScratch', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.font = '18px Arial';
    ctx.fillText('fingerprint', 4, 35);

    const gradient = ctx.createLinearGradient(30, 5, 70, 45);
    gradient.addColorStop(0, '#f00');
    gradient.addColorStop(1, '#00f');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(50, 25, 20, 0, Math.PI * 2);
    ctx.fill();

    return hashString(canvas.toDataURL());
  } catch {
    return 'error';
  }
}

function getWebGLInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { renderer: 'unknown', vendor: 'unknown' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      return {
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown',
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
      };
    }
    return {
      renderer: gl.getParameter(gl.RENDERER) || 'unknown',
      vendor: gl.getParameter(gl.VENDOR) || 'unknown',
    };
  } catch {
    return { renderer: 'error', vendor: 'error' };
  }
}

export function collectFingerprint(): DeviceFingerprint {
  const { renderer, vendor } = getWebGLInfo();
  return {
    canvasHash: generateCanvasHash(),
    webglRenderer: renderer,
    webglVendor: vendor,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemory: (navigator as any).deviceMemory ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    languages: [...navigator.languages],
    platform: navigator.platform,
    colorDepth: screen.colorDepth,
    userAgent: navigator.userAgent,
  };
}

export function detectCapabilities(): DeviceCapabilities {
  const supportsPressure = 'PointerEvent' in window && 'pressure' in (PointerEvent.prototype || {});
  const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  let inputMethod: 'mouse' | 'touch' | 'stylus' = 'mouse';
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
    fingerprint: collectFingerprint(),
  };
}
