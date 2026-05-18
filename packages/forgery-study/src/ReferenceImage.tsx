import type { ReferencePolylines } from '@chicken-scratch/shared';

/**
 * The static reference the forger copies. Rendered from coordinate-only
 * polylines — the server strips timing and pressure, so there are no
 * dynamics to read out of the DOM.
 */
export function ReferenceImage({
  reference,
  height,
}: {
  reference: ReferencePolylines;
  height: number;
}) {
  const { canvasSize, strokes } = reference;
  return (
    <svg
      viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%',
        height,
        display: 'block',
        background: '#fff',
        border: '2px solid #ccc',
        borderRadius: 8,
      }}
    >
      {strokes.map((points, i) => (
        <polyline
          key={i}
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
