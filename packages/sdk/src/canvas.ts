import SignaturePad from 'signature_pad';
import type { Stroke, RawSignatureData, DeviceCapabilities } from './types.js';

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private pad: SignaturePad;
  private scrollHandler: ((e: TouchEvent) => void) | null = null;

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
  }

  buildSignatureData(deviceCapabilities: DeviceCapabilities): RawSignatureData {
    const data = this.pad.toData();
    const strokes: Stroke[] = data.map(group => {
      const points = group.points.map(p => ({
        x: p.x,
        y: p.y,
        pressure: (p as any).pressure ?? 0,
        timestamp: (p as any).time ?? Date.now(),
      }));
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
    this.pad.off();
    this.canvas.remove();
  }
}
