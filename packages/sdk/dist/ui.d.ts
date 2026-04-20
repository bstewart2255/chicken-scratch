import type { Theme } from './types.js';
declare const SHAPE_LABELS: Record<string, string>;
export declare class UIRenderer {
    private root;
    private theme;
    private header;
    private instruction;
    private progress;
    private canvasContainer;
    private buttonRow;
    private clearBtn;
    private submitBtn;
    private resultPanel;
    constructor(container: HTMLElement, themeOverrides?: Partial<Theme>);
    private buildLayout;
    private el;
    getCanvasContainer(): HTMLElement;
    private clearHandler;
    private submitHandler;
    /**
     * Set handlers for the current drawing step.
     * Replaces any previously set handlers.
     */
    setHandlers(onClear: () => void, onSubmit: () => void): void;
    setStep(label: string, current: number, total: number): void;
    setSubmitEnabled(enabled: boolean): void;
    showDrawing(): void;
    showResult(success: boolean, message: string): void;
    showLoading(message?: string): void;
    /**
     * Show the consent step as the first panel before enrollment begins.
     * Blocks until the user agrees or declines.
     */
    showConsent(privacyPolicyUrl: string): Promise<boolean>;
    destroy(): void;
}
export { SHAPE_LABELS };
