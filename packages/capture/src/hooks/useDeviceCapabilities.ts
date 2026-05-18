import { useState, useEffect } from 'react';
import type { DeviceCapabilities } from '@chicken-scratch/shared';
import { detectDeviceCapabilities } from '../lib/device-capabilities.js';

export function useDeviceCapabilities(): DeviceCapabilities {
  const [caps, setCaps] = useState<DeviceCapabilities>(() => ({
    supportsPressure: false,
    supportsTouch: false,
    inputMethod: 'mouse',
    browser: 'Unknown',
    os: 'Unknown',
  }));

  useEffect(() => {
    setCaps(detectDeviceCapabilities());
  }, []);

  return caps;
}
