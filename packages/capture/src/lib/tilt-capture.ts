/**
 * Tilt capture — a side-channel listener that records pen tilt data
 * alongside whatever drawing library is recording x/y/pressure.
 *
 * signature_pad (used by both the main frontend and the SDK) supports
 * x, y, pressure, time but NOT tiltX/tiltY/twist — it's stylus-unaware.
 * On stylus-capable devices (Apple Pencil, Wacom) the PointerEvent does
 * expose those fields; we'd otherwise drop free biometric signal.
 *
 * Approach: attach our own pointer-event listeners to the canvas before
 * signature_pad binds its handlers. We record {timestamp, tiltX, tiltY,
 * twist} per event. When stroke-collector builds StrokePoint objects
 * from signature_pad's output, it can look up the closest-timestamp
 * entry in our buffer and populate the tilt fields.
 *
 * Matching by timestamp is approximate — signature_pad may drop or
 * filter some events — but close enough for aggregate features. Worst
 * case we miss tilt on a point and it stays undefined, which the
 * extractor already tolerates.
 */

export interface TiltEntry {
  timestamp: number;  // Date.now() at event time
  tiltX: number;
  tiltY: number;
  twist: number;
}

export class TiltCapture {
  private entries: TiltEntry[] = [];
  private listener: ((e: PointerEvent) => void) | null = null;
  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    this.listener = (e: PointerEvent) => {
      // Only record for stylus events — mouse and touch report tilt 0
      // and would just pad the buffer with noise. pointerType is the
      // authoritative signal for "this is a real pen" regardless of
      // what supportsPressure claims at capability-detection time.
      if (e.pointerType !== 'pen') return;
      this.entries.push({
        timestamp: Date.now(),
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        twist: (e as PointerEvent & { twist?: number }).twist ?? 0,
      });
    };
    // Capture phase so we run before signature_pad's bubbling handlers.
    target.addEventListener('pointerdown', this.listener, { capture: true });
    target.addEventListener('pointermove', this.listener, { capture: true });
  }

  /**
   * Find the tilt entry closest in time to the given timestamp. Returns
   * undefined if no entries (non-stylus input) or no entry within the
   * matchWindowMs tolerance (stale/stale-matched data).
   */
  findClosest(timestamp: number, matchWindowMs = 50): TiltEntry | undefined {
    if (this.entries.length === 0) return undefined;
    let best: TiltEntry | undefined = undefined;
    let bestDelta = Infinity;
    for (const entry of this.entries) {
      const delta = Math.abs(entry.timestamp - timestamp);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = entry;
      }
    }
    return bestDelta <= matchWindowMs ? best : undefined;
  }

  /** Non-stylus input produces no entries. */
  hasData(): boolean {
    return this.entries.length > 0;
  }

  clear(): void {
    this.entries = [];
  }

  destroy(): void {
    if (this.listener) {
      this.target.removeEventListener('pointerdown', this.listener, { capture: true });
      this.target.removeEventListener('pointermove', this.listener, { capture: true });
      this.listener = null;
    }
    this.entries = [];
  }
}
