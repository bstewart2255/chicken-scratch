import type { Stroke, StrokePoint, RawSignatureData, CanvasSize } from '@chicken-scratch/shared';
import type { DeviceCapabilities } from '@chicken-scratch/shared';
import SignaturePad from 'signature_pad';

/**
 * Collect stroke data from a SignaturePad instance.
 * SignaturePad stores data as groups of points — we convert to our Stroke format.
 */
export function collectStrokes(pad: SignaturePad): Stroke[] {
  const data = pad.toData();
  return data.map(group => {
    const points: StrokePoint[] = group.points.map(p => ({
      x: p.x,
      y: p.y,
      pressure: ('pressure' in p) ? (p as { pressure?: number }).pressure ?? 0 : 0,
      timestamp: p.time ?? Date.now(),
    }));

    return {
      points,
      startTime: points.length > 0 ? points[0].timestamp : 0,
      endTime: points.length > 0 ? points[points.length - 1].timestamp : 0,
    };
  });
}

export function buildSignatureData(
  pad: SignaturePad,
  canvas: HTMLCanvasElement,
  deviceCapabilities: DeviceCapabilities,
): RawSignatureData {
  const strokes = collectStrokes(pad);
  const canvasSize: CanvasSize = {
    width: canvas.width,
    height: canvas.height,
  };

  return {
    strokes,
    canvasSize,
    deviceCapabilities,
    capturedAt: new Date().toISOString(),
  };
}
