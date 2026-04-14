import type { DeviceFingerprint } from '@chicken-scratch/shared';

/**
 * Generate a canvas fingerprint hash.
 * Different GPUs/drivers render text and shapes slightly differently,
 * producing a unique-ish hash per device.
 */
function getCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    // Draw text with specific font rendering
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('chickenScratch', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint', 4, 35);

    // Draw a gradient arc
    ctx.beginPath();
    ctx.arc(50, 25, 20, 0, Math.PI * 2);
    const gradient = ctx.createLinearGradient(30, 5, 70, 45);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(1, '#0000ff');
    ctx.fillStyle = gradient;
    ctx.fill();

    const dataUrl = canvas.toDataURL();
    // Simple hash of the data URL
    return hashString(dataUrl);
  } catch {
    return 'error';
  }
}

/**
 * Simple string hash (djb2 variant). Not cryptographic,
 * just needs to be consistent and fast.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Get WebGL renderer and vendor strings.
 */
function getWebGLInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return { renderer: 'none', vendor: 'none' };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return {
        renderer: gl.getParameter(gl.RENDERER) || 'unknown',
        vendor: gl.getParameter(gl.VENDOR) || 'unknown',
      };
    }

    return {
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown',
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
    };
  } catch {
    return { renderer: 'error', vendor: 'error' };
  }
}

/**
 * Collect all device fingerprint signals available from browser APIs.
 * No permissions required — all passive detection.
 */
export function collectDeviceFingerprint(): DeviceFingerprint {
  const webgl = getWebGLInfo();

  return {
    canvasHash: getCanvasHash(),
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    languages: [...(navigator.languages || [navigator.language])],
    platform: navigator.platform || 'unknown',
    colorDepth: screen.colorDepth || 0,
    userAgent: navigator.userAgent,
  };
}
