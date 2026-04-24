import type { Stroke, StrokePoint, RawSignatureData, CanvasSize } from '@chicken-scratch/shared';
import type { DeviceCapabilities } from '@chicken-scratch/shared';
import SignaturePad from 'signature_pad';
import type { TiltCapture } from './tilt-capture.js';

/**
 * Collect stroke data from a SignaturePad instance.
 * SignaturePad stores data as groups of points — we convert to our Stroke format.
 *
 * Optional `tiltCapture`: a side-channel buffer of pen-tilt data captured
 * during drawing (see tilt-capture.ts). signature_pad itself doesn't carry
 * tiltX/tiltY through, so if a stylus user is drawing we need to merge in
 * tilt data from our own pointer listeners. For non-stylus input the
 * buffer is empty and this has no effect.
 */
export function collectStrokes(pad: SignaturePad, tiltCapture?: TiltCapture): Stroke[] {
  const data = pad.toData();
  return data.map(group => {
    const points: StrokePoint[] = group.points.map(p => {
      const timestamp = p.time ?? Date.now();
      const base: StrokePoint = {
        x: p.x,
        y: p.y,
        pressure: ('pressure' in p) ? (p as { pressure?: number }).pressure ?? 0 : 0,
        timestamp,
      };
      // Merge in tilt from the side-channel listener if this capture
      // produced any (stylus users only — mouse/touch don't fire tilt events).
      const tilt = tiltCapture?.findClosest(timestamp);
      if (tilt) {
        base.tiltX = tilt.tiltX;
        base.tiltY = tilt.tiltY;
      }
      return base;
    });

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
  tiltCapture?: TiltCapture,
): RawSignatureData {
  const strokes = collectStrokes(pad, tiltCapture);
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
