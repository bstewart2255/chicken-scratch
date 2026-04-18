import { describe, it, expect } from 'vitest';
import { detectDeviceClass } from '../features/device-class.js';
import type { RawSignatureData } from '@chicken-scratch/shared';

function mkData(inputMethod: 'touch' | 'mouse' | 'stylus'): RawSignatureData {
  return {
    strokes: [],
    canvasSize: { width: 400, height: 200 },
    capturedAt: new Date().toISOString(),
    deviceCapabilities: {
      supportsPressure: inputMethod === 'stylus',
      supportsTouch: inputMethod !== 'mouse',
      inputMethod,
      browser: 'Test',
      os: 'Test',
    },
  };
}

describe('detectDeviceClass', () => {
  it('classifies finger-on-touchscreen as mobile', () => {
    expect(detectDeviceClass(mkData('touch'))).toBe('mobile');
  });

  it('classifies mouse as desktop', () => {
    expect(detectDeviceClass(mkData('mouse'))).toBe('desktop');
  });

  it('classifies stylus as desktop (precision pointer)', () => {
    // Apple Pencil / Surface Pen land here today. Revisit if product data
    // shows users find this confusing on tablets.
    expect(detectDeviceClass(mkData('stylus'))).toBe('desktop');
  });

  it('falls through to desktop on missing inputMethod rather than throwing', () => {
    const data = mkData('mouse');
    // @ts-expect-error — intentionally producing a malformed payload
    delete data.deviceCapabilities.inputMethod;
    expect(detectDeviceClass(data)).toBe('desktop');
  });
});
