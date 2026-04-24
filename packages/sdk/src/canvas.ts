import SignaturePad from 'signature_pad';
import type { Stroke, RawSignatureData, DeviceCapabilities } from './types.js';

/**
 * Side-channel buffer of pen-tilt data, keyed by event timestamp.
 * signature_pad doesn't carry tiltX/tiltY through its Point objects, so
 * we capture them via a parallel pointer-event listener and merge back
 * in when building strokes. Empty for mouse/touch; populated for pen.
 */
interface TiltEntry { timestamp: number; tiltX: number; tiltY: number }

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private pad: SignaturePad;
  private scrollHandler: ((e: TouchEvent) => void) | null = null;
  private tiltListener: ((e: PointerEvent) => void) | null = null;
  private tiltEntries: TiltEntry[] = [];

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;';
    container.appendChild(this.canvas);

    this.scaleCanvas();
    this.pad = new SignaturePad(this.canvas, {
      penColor: '#1a1a2e',
      minWidth: 1.5,
      maxWidth: 3,
      throttle: 0,
      velocityFilterWeight: 0.7,
    });

    // Side-channel listener for pen tilt. Only records on pointerType='pen'
    // so we don't fill the buffer with zeros from mouse/touch events.
    this.tiltListener = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      this.tiltEntries.push({
        timestamp: Date.now(),
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
      });
    };
    this.canvas.addEventListener('pointerdown', this.tiltListener, { capture: true });
    this.canvas.addEventListener('pointermove', this.tiltListener, { capture: true });

    // Prevent page scroll while drawing
    this.scrollHandler = (e: TouchEvent) => {
      if (e.target === this.canvas) e.preventDefault();
    };
    document.addEventListener('touchmove', this.scrollHandler, { passive: false });

    // Handle resize
    window.addEventListener('resize', () => {
      const data = this.pad.toData();
      this.scaleCanvas();
      if (data.length > 0) this.pad.fromData(data);
    });
  }

  private findTilt(timestamp: number, matchWindowMs = 50): TiltEntry | undefined {
    if (this.tiltEntries.length === 0) return undefined;
    let best: TiltEntry | undefined = undefined;
    let bestDelta = Infinity;
    for (const entry of this.tiltEntries) {
      const delta = Math.abs(entry.timestamp - timestamp);
      if (delta < bestDelta) { bestDelta = delta; best = entry; }
    }
    return bestDelta <= matchWindowMs ? best : undefined;
  }

  private scaleCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
  }

  isEmpty(): boolean {
    return this.pad.isEmpty();
  }

  clear() {
    this.pad.clear();
    this.tiltEntries = [];
  }

  buildSignatureData(deviceCapabilities: DeviceCapabilities): RawSignatureData {
    const data = this.pad.toData();
    const strokes: Stroke[] = data.map(group => {
      const points = group.points.map(p => {
        const timestamp = (p as any).time ?? Date.now();
        const tilt = this.findTilt(timestamp);
        const point: any = {
          x: p.x,
          y: p.y,
          pressure: (p as any).pressure ?? 0,
          timestamp,
        };
        if (tilt) {
          point.tiltX = tilt.tiltX;
          point.tiltY = tilt.tiltY;
        }
        return point;
      });
      return {
        points,
        startTime: points[0]?.timestamp ?? Date.now(),
        endTime: points[points.length - 1]?.timestamp ?? Date.now(),
      };
    });

    const rect = this.canvas.getBoundingClientRect();
    return {
      strokes,
      canvasSize: { width: rect.width, height: rect.height },
      deviceCapabilities,
      capturedAt: new Date().toISOString(),
    };
  }

  destroy() {
    if (this.scrollHandler) {
      document.removeEventListener('touchmove', this.scrollHandler);
    }
    if (this.tiltListener) {
      this.canvas.removeEventListener('pointerdown', this.tiltListener, { capture: true });
      this.canvas.removeEventListener('pointermove', this.tiltListener, { capture: true });
      this.tiltListener = null;
    }
    this.tiltEntries = [];
    this.pad.off();
    this.canvas.remove();
  }
}
