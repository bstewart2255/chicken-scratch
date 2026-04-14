import type { ShapeAttemptDetail } from '@chicken-scratch/shared';
import type { BaselineSummary } from '@chicken-scratch/shared';
import { FeatureComparisonView } from './FeatureComparisonView';

interface Props {
  shapeDetails: ShapeAttemptDetail[];
  baseline: BaselineSummary | null;
}

function ShapeFeatureTable({ label, baseline, attempt }: {
  label: string;
  baseline: Record<string, number>;
  attempt: Record<string, number>;
}) {
  const keys = Object.keys(baseline);
  return (
    <div style={{ marginTop: 8 }}>
      <h5 style={{ margin: '0 0 4px', fontSize: 12, color: '#555' }}>{label}</h5>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '3px 6px', fontSize: 11, textAlign: 'left', color: '#999' }}>Feature</th>
            <th style={{ padding: '3px 6px', fontSize: 11, textAlign: 'right', color: '#999' }}>Baseline</th>
            <th style={{ padding: '3px 6px', fontSize: 11, textAlign: 'right', color: '#999' }}>Attempt</th>
            <th style={{ padding: '3px 6px', fontSize: 11, textAlign: 'left', color: '#999' }}>Match</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(key => {
            const bv = baseline[key] ?? 0;
            const av = attempt[key] ?? 0;
            const maxVal = Math.max(Math.abs(bv), Math.abs(av));
            const sim = maxVal === 0 ? 100 : (1 - Math.abs(bv - av) / maxVal) * 100;
            const color = sim >= 80 ? '#22c55e' : sim >= 60 ? '#eab308' : '#ef4444';

            return (
              <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '3px 6px', fontSize: 11 }}>{key}</td>
                <td style={{ padding: '3px 6px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right' }}>
                  {bv.toFixed(3)}
                </td>
                <td style={{ padding: '3px 6px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right' }}>
                  {av.toFixed(3)}
                </td>
                <td style={{ padding: '3px 6px' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color, fontWeight: 'bold' }}>
                    {sim.toFixed(0)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ShapeDetailPanel({ shapeDetails, baseline }: Props) {
  if (!shapeDetails || shapeDetails.length === 0) {
    return <p style={{ color: '#999', fontStyle: 'italic' }}>No shape detail data available.</p>;
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Shape &amp; Drawing Details</h3>
      {shapeDetails.map(sd => {
        const baselineShape = baseline?.shapes.find(s => s.shapeType === sd.shapeType);
        const isDrawing = sd.shapeType === 'house' || sd.shapeType === 'smiley';

        return (
          <div key={sd.shapeType} style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#fff',
          }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, textTransform: 'capitalize' }}>
              {sd.shapeType}
              {isDrawing && (
                <span style={{
                  marginLeft: 8,
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: '#fff7ed',
                  color: '#c2410c',
                }}>
                  drawing
                </span>
              )}
              <span style={{
                marginLeft: 8,
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#e0e7ff',
                color: '#3730a3',
              }}>
                shape score: {sd.shapeFeatureScore.toFixed(1)}
              </span>
            </h4>

            {/* Biometric comparison */}
            {baselineShape && (
              <FeatureComparisonView
                baseline={baselineShape.avgBiometricFeatures}
                attempt={sd.attemptBiometricFeatures}
                comparison={sd.biometricComparison}
                title="Biometric Features"
              />
            )}

            {/* Shape-specific features */}
            {baselineShape && baselineShape.avgShapeFeatures && sd.attemptShapeFeatures && (
              <ShapeFeatureTable
                label="Shape-Specific Features"
                baseline={baselineShape.avgShapeFeatures as unknown as Record<string, number>}
                attempt={sd.attemptShapeFeatures as unknown as Record<string, number>}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
