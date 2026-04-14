import type { DeviceFingerprint } from '@chicken-scratch/shared';

export interface FingerprintMatch {
  /** Overall match score 0-100 */
  score: number;
  /** Whether this looks like the same device */
  sameDevice: boolean;
  /** Per-signal match details */
  signals: FingerprintSignal[];
}

export interface FingerprintSignal {
  name: string;
  enrolled: string;
  current: string;
  match: boolean;
  weight: number;
}

/**
 * Compare two device fingerprints and return a match score.
 *
 * Signals are weighted by how stable and discriminating they are:
 * - canvasHash: very discriminating, stable across sessions (high weight)
 * - webglRenderer: very discriminating, stable (high weight)
 * - screen dims + DPR: stable for same device (medium weight)
 * - platform + touch points: stable (medium weight)
 * - timezone/language: can change if traveling (low weight)
 * - userAgent: changes on browser update (low weight)
 */
export function compareFingerprints(
  enrolled: DeviceFingerprint,
  current: DeviceFingerprint,
): FingerprintMatch {
  const signals: FingerprintSignal[] = [];

  // High-weight signals (these rarely change on the same device)
  addSignal(signals, 'canvasHash', enrolled.canvasHash, current.canvasHash, 20);
  addSignal(signals, 'webglRenderer', enrolled.webglRenderer, current.webglRenderer, 15);
  addSignal(signals, 'webglVendor', enrolled.webglVendor, current.webglVendor, 5);

  // Medium-weight (hardware characteristics)
  addSignal(signals, 'screenRes',
    `${enrolled.screenWidth}x${enrolled.screenHeight}`,
    `${current.screenWidth}x${current.screenHeight}`, 10);
  addSignal(signals, 'devicePixelRatio',
    String(enrolled.devicePixelRatio),
    String(current.devicePixelRatio), 8);
  addSignal(signals, 'maxTouchPoints',
    String(enrolled.maxTouchPoints),
    String(current.maxTouchPoints), 7);
  addSignal(signals, 'hardwareConcurrency',
    String(enrolled.hardwareConcurrency),
    String(current.hardwareConcurrency), 5);
  addSignal(signals, 'colorDepth',
    String(enrolled.colorDepth),
    String(current.colorDepth), 3);
  addSignal(signals, 'platform', enrolled.platform, current.platform, 7);

  // Device memory (only available on some browsers)
  if (enrolled.deviceMemory !== null && current.deviceMemory !== null) {
    addSignal(signals, 'deviceMemory',
      String(enrolled.deviceMemory),
      String(current.deviceMemory), 5);
  }

  // Low-weight (can change legitimately)
  addSignal(signals, 'timezone', enrolled.timezone, current.timezone, 5);
  addSignal(signals, 'language', enrolled.language, current.language, 3);

  // User agent: partial match (OS and device model parts are stable, version numbers change)
  const uaMatch = fuzzyUAMatch(enrolled.userAgent, current.userAgent);
  signals.push({
    name: 'userAgent',
    enrolled: enrolled.userAgent.substring(0, 60) + '...',
    current: current.userAgent.substring(0, 60) + '...',
    match: uaMatch >= 0.7,
    weight: 7,
  });

  // Calculate weighted score
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const matchedWeight = signals.reduce((sum, s) => {
    if (s.name === 'userAgent') {
      return sum + s.weight * uaMatch;
    }
    return sum + (s.match ? s.weight : 0);
  }, 0);

  const score = Math.round((matchedWeight / totalWeight) * 100);

  return {
    score,
    sameDevice: score >= 70,
    signals,
  };
}

function addSignal(
  signals: FingerprintSignal[],
  name: string,
  enrolled: string,
  current: string,
  weight: number,
) {
  signals.push({
    name,
    enrolled,
    current,
    match: enrolled === current,
    weight,
  });
}

/**
 * Fuzzy user agent comparison.
 * Extract stable parts (OS, device model) and ignore version numbers.
 */
function fuzzyUAMatch(a: string, b: string): number {
  if (a === b) return 1;

  // Extract OS identifiers
  const osPatterns = [
    /iPhone|iPad|iPod/,
    /Android\s[\d.]+/,
    /Windows NT\s[\d.]+/,
    /Mac OS X\s[\d._]+/,
    /Linux/,
  ];

  let matches = 0;
  let checks = 0;

  // Check if same OS family
  for (const pattern of osPatterns) {
    const aMatch = pattern.test(a);
    const bMatch = pattern.test(b);
    if (aMatch || bMatch) {
      checks++;
      if (aMatch && bMatch) matches++;
    }
  }

  // Check if same browser engine
  const engines = ['AppleWebKit', 'Gecko', 'Trident', 'Blink'];
  for (const engine of engines) {
    const aHas = a.includes(engine);
    const bHas = b.includes(engine);
    if (aHas || bHas) {
      checks++;
      if (aHas && bHas) matches++;
    }
  }

  // Check device model (e.g., "iPhone" or specific Android model)
  const modelPatterns = [/iPhone/, /iPad/, /SM-\w+/, /Pixel\s?\w+/];
  for (const pattern of modelPatterns) {
    const aMatch = pattern.test(a);
    const bMatch = pattern.test(b);
    if (aMatch || bMatch) {
      checks++;
      if (aMatch && bMatch) matches++;
    }
  }

  if (checks === 0) return 0.5; // Can't determine
  return matches / checks;
}
