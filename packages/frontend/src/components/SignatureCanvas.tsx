import { useSignaturePad } from '../hooks/useSignaturePad';
import type SignaturePad from 'signature_pad';

interface Props {
  onPadReady?: (pad: SignaturePad, canvas: HTMLCanvasElement) => void;
  padRef?: React.MutableRefObject<SignaturePad | null>;
  height?: number;
}

export function SignatureCanvas({ padRef: externalPadRef, height }: Props) {
  const { canvasRef, clear } = useSignaturePad(externalPadRef);

  return (
    <div style={{ border: '2px solid #ccc', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: height ?? 200,
          display: 'block',
          touchAction: 'none',
        }}
      />
      <div style={{ padding: '8px', borderTop: '1px solid #eee', textAlign: 'right' }}>
        <button
          onClick={clear}
          type="button"
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            minHeight: 44,
            fontSize: 14,
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
