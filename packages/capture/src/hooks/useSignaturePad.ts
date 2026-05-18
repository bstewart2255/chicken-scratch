import { useRef, useEffect, useCallback } from 'react';
import SignaturePad from 'signature_pad';
import { TiltCapture } from '../lib/tilt-capture.js';

export function useSignaturePad(
  externalPadRef?: React.MutableRefObject<SignaturePad | null>,
  externalTiltRef?: React.MutableRefObject<TiltCapture | null>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  // Side-channel tilt buffer for stylus users (signature_pad drops tilt data).
  // Empty for mouse/touch, populated for pen pointers.
  const tiltCaptureRef = useRef<TiltCapture | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Save current data before resize
    const pad = padRef.current;
    const data = pad ? pad.toData() : [];

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    // Restore data after resize
    if (pad) {
      pad.clear();
      if (data.length > 0) {
        pad.fromData(data);
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial sizing
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      penColor: '#1a1a2e',
      minWidth: 1.5,
      maxWidth: 3,
      throttle: 0,          // no throttle — capture every point for smooth mobile drawing
      velocityFilterWeight: 0.7,
    });
    padRef.current = pad;

    // Start tilt capture. No-op cost on mouse/touch; real data on stylus.
    const tilt = new TiltCapture(canvas);
    tiltCaptureRef.current = tilt;
    if (externalTiltRef) {
      externalTiltRef.current = tilt;
    }

    // Sync external ref immediately after pad creation
    if (externalPadRef) {
      externalPadRef.current = pad;
    }

    // Prevent page scroll/bounce while drawing on the canvas
    const preventScroll = (e: TouchEvent) => {
      if (e.target === canvas) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });

    // Handle orientation changes and window resizes
    const handleResize = () => {
      // Small delay to let the browser finish the layout change
      setTimeout(resizeCanvas, 150);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      padRef.current?.off();
      padRef.current = null;
      if (externalPadRef) {
        externalPadRef.current = null;
      }
      tiltCaptureRef.current?.destroy();
      tiltCaptureRef.current = null;
      if (externalTiltRef) {
        externalTiltRef.current = null;
      }
      document.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [resizeCanvas, externalPadRef, externalTiltRef]);

  const clear = useCallback(() => {
    padRef.current?.clear();
    tiltCaptureRef.current?.clear();
  }, []);

  const isEmpty = useCallback(() => {
    return padRef.current?.isEmpty() ?? true;
  }, []);

  return { canvasRef, padRef, tiltCaptureRef, clear, isEmpty };
}
