import type { RawSignatureData, DeviceCapabilities } from './types.js';
export declare class DrawingCanvas {
    private canvas;
    private pad;
    private scrollHandler;
    private tiltListener;
    private tiltEntries;
    constructor(container: HTMLElement);
    private findTilt;
    private scaleCanvas;
    isEmpty(): boolean;
    clear(): void;
    buildSignatureData(deviceCapabilities: DeviceCapabilities): RawSignatureData;
    destroy(): void;
}
