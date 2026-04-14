export interface StrokePoint {
  x: number;
  y: number;
  pressure: number; // 0-1 normalized, 0 if unsupported
  timestamp: number; // ms since epoch
  tiltX?: number;
  tiltY?: number;
}

export interface Stroke {
  points: StrokePoint[];
  startTime: number;
  endTime: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface RawSignatureData {
  strokes: Stroke[];
  canvasSize: CanvasSize;
  deviceCapabilities: DeviceCapabilities;
  capturedAt: string; // ISO 8601
}

export interface DeviceFingerprint {
  canvasHash: string;            // Hash of canvas rendering output
  webglRenderer: string;         // GPU model string
  webglVendor: string;           // GPU vendor string
  screenWidth: number;           // screen.width
  screenHeight: number;          // screen.height
  devicePixelRatio: number;      // window.devicePixelRatio
  maxTouchPoints: number;        // navigator.maxTouchPoints
  hardwareConcurrency: number;   // navigator.hardwareConcurrency (CPU cores)
  deviceMemory: number | null;   // navigator.deviceMemory (GB, Chrome only)
  timezone: string;              // e.g. "America/Chicago"
  language: string;              // navigator.language
  languages: string[];           // navigator.languages
  platform: string;              // navigator.platform
  colorDepth: number;            // screen.colorDepth
  userAgent: string;             // full UA string for model extraction
}

export interface DeviceCapabilities {
  supportsPressure: boolean;
  supportsTouch: boolean;
  inputMethod: 'mouse' | 'touch' | 'stylus';
  browser: string;
  os: string;
  fingerprint?: DeviceFingerprint;
}
