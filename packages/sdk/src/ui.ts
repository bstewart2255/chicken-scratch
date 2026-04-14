import type { Theme } from './types.js';

const DEFAULT_THEME: Theme = {
  primaryColor: '#1a1a2e',
  backgroundColor: '#ffffff',
  textColor: '#333333',
  canvasBorderColor: '#cccccc',
  successColor: '#16a34a',
  failColor: '#dc2626',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const SHAPE_LABELS: Record<string, string> = {
  circle: 'Draw a Circle',
  square: 'Draw a Square',
  triangle: 'Draw a Triangle',
  house: 'Draw a House',
  smiley: 'Draw a Smiley Face',
};

export class UIRenderer {
  private root: HTMLElement;
  private theme: Theme;

  // Internal refs
  private header!: HTMLElement;
  private instruction!: HTMLElement;
  private progress!: HTMLElement;
  private canvasContainer!: HTMLElement;
  private buttonRow!: HTMLElement;
  private clearBtn!: HTMLButtonElement;
  private submitBtn!: HTMLButtonElement;
  private resultPanel!: HTMLElement;

  constructor(container: HTMLElement, themeOverrides?: Partial<Theme>) {
    this.theme = { ...DEFAULT_THEME, ...themeOverrides };
    this.root = container;
    this.root.innerHTML = '';
    this.root.style.cssText = `
      font-family: ${this.theme.fontFamily};
      background: ${this.theme.backgroundColor};
      border: 1px solid ${this.theme.canvasBorderColor};
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    this.buildLayout();
  }

  private buildLayout() {
    // Header with progress
    this.header = this.el('div', {
      padding: '12px 16px',
      borderBottom: `1px solid ${this.theme.canvasBorderColor}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    });

    this.instruction = this.el('div', {
      fontWeight: '600',
      fontSize: '15px',
      color: this.theme.textColor,
    });

    this.progress = this.el('div', {
      fontSize: '12px',
      color: '#999',
    });

    this.header.append(this.instruction, this.progress);

    // Canvas area
    this.canvasContainer = this.el('div', {
      flex: '1',
      minHeight: '200px',
      position: 'relative',
    });

    // Buttons
    this.buttonRow = this.el('div', {
      display: 'flex',
      gap: '8px',
      padding: '12px 16px',
      borderTop: `1px solid ${this.theme.canvasBorderColor}`,
    });

    this.clearBtn = document.createElement('button');
    this.clearBtn.textContent = 'Clear';
    this.clearBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid ${this.theme.canvasBorderColor};
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 14px;
      font-family: ${this.theme.fontFamily};
    `;

    this.submitBtn = document.createElement('button');
    this.submitBtn.textContent = 'Next';
    this.submitBtn.style.cssText = `
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      background: ${this.theme.primaryColor};
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: ${this.theme.fontFamily};
      flex: 1;
    `;

    this.buttonRow.append(this.clearBtn, this.submitBtn);

    // Result panel (hidden initially)
    this.resultPanel = this.el('div', {
      display: 'none',
      padding: '32px 16px',
      textAlign: 'center',
    });

    this.root.append(this.header, this.canvasContainer, this.buttonRow, this.resultPanel);
  }

  private el(tag: string, styles: Partial<CSSStyleDeclaration> = {}): HTMLElement {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    return el;
  }

  getCanvasContainer(): HTMLElement {
    return this.canvasContainer;
  }

  private clearHandler: (() => void) | null = null;
  private submitHandler: (() => void) | null = null;

  /**
   * Set handlers for the current drawing step.
   * Replaces any previously set handlers.
   */
  setHandlers(onClear: () => void, onSubmit: () => void) {
    // Remove old handlers
    if (this.clearHandler) this.clearBtn.removeEventListener('click', this.clearHandler);
    if (this.submitHandler) this.submitBtn.removeEventListener('click', this.submitHandler);

    this.clearHandler = onClear;
    this.submitHandler = onSubmit;
    this.clearBtn.addEventListener('click', onClear);
    this.submitBtn.addEventListener('click', onSubmit);
  }

  setStep(label: string, current: number, total: number) {
    this.instruction.textContent = label;
    this.progress.textContent = `${current} / ${total}`;
    this.submitBtn.textContent = current === total ? 'Submit' : 'Next';
  }

  setSubmitEnabled(enabled: boolean) {
    this.submitBtn.disabled = !enabled;
    this.submitBtn.style.opacity = enabled ? '1' : '0.5';
    this.submitBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  showDrawing() {
    this.canvasContainer.style.display = 'block';
    this.buttonRow.style.display = 'flex';
    this.resultPanel.style.display = 'none';
  }

  showResult(success: boolean, message: string) {
    this.canvasContainer.style.display = 'none';
    this.buttonRow.style.display = 'none';
    this.resultPanel.style.display = 'block';

    const color = success ? this.theme.successColor : this.theme.failColor;
    const icon = success ? '✓' : '✗';

    this.resultPanel.innerHTML = `
      <div style="font-size:48px;color:${color};margin-bottom:12px;">${icon}</div>
      <div style="font-size:18px;font-weight:700;color:${color};margin-bottom:8px;">
        ${success ? 'Success' : 'Failed'}
      </div>
      <div style="font-size:14px;color:#666;">${message}</div>
    `;
  }

  showLoading(message: string = 'Processing...') {
    this.canvasContainer.style.display = 'none';
    this.buttonRow.style.display = 'none';
    this.resultPanel.style.display = 'block';
    this.resultPanel.innerHTML = `
      <div style="font-size:14px;color:#999;">${message}</div>
    `;
  }

  destroy() {
    this.root.innerHTML = '';
  }
}

export { SHAPE_LABELS };
