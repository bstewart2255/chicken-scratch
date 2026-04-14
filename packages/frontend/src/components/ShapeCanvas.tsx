import { useSignaturePad } from '../hooks/useSignaturePad';
import type SignaturePad from 'signature_pad';
import type { ChallengeItemType } from '@chicken-scratch/shared';

const CHALLENGE_LABELS: Record<ChallengeItemType, string> = {
  circle: 'Draw a Circle',
  square: 'Draw a Square',
  triangle: 'Draw a Triangle',
  house: 'Draw a House',
  smiley: 'Draw a Smiley Face',
};

interface Props {
  shapeType: ChallengeItemType;
  padRef?: React.MutableRefObject<SignaturePad | null>;
  height?: number;
}

export function ShapeCanvas({ shapeType, padRef: externalPadRef, height }: Props) {
  const { canvasRef, clear } = useSignaturePad(externalPadRef);

  return (
    <div style={{ border: '2px solid #ccc', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{
        padding: '8px 12px',
        background: '#f5f5f5',
        borderBottom: '1px solid #eee',
        fontSize: 14,
        fontWeight: 600,
        color: '#333',
      }}>
        {CHALLENGE_LABELS[shapeType]}
      </div>
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
