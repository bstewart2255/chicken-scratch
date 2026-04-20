import type { RawSignatureData, DeviceCapabilities } from './types.js';
export declare class DrawingCanvas {
    private canvas;
    private pad;
    private scrollHandler;
    constructor(container: HTMLElement);
    private scaleCanvas;
    isEmpty(): boolean;
    clear(): void;
    buildSignatureData(deviceCapabilities: DeviceCapabilities): RawSignatureData;
    destroy(): void;
}
