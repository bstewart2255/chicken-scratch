import type { AllFeatures, FeatureComparison } from '@chicken-scratch/shared';

interface Props {
  baseline: AllFeatures;
  attempt: AllFeatures;
  comparison: FeatureComparison;
  title?: string;
}

function similarityColor(similarity: number): string {
  if (similarity >= 80) return '#22c55e';
  if (similarity >= 60) return '#eab308';
  return '#ef4444';
}

function FeatureRow({ name, baselineVal, attemptVal }: {
  name: string;
  baselineVal: number;
  attemptVal: number;
}) {
  const maxVal = Math.max(Math.abs(baselineVal), Math.abs(attemptVal));
  const similarity = maxVal === 0 ? 100 : (1 - Math.abs(baselineVal - attemptVal) / maxVal) * 100;

  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
      <td style={{ padding: '4px 8px', fontSize: 12, color: '#555' }}>{name}</td>
      <td style={{ padding: '4px 8px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right' }}>
        {baselineVal.toFixed(3)}
      </td>
      <td style={{ padding: '4px 8px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right' }}>
        {attemptVal.toFixed(3)}
      </td>
      <td style={{ padding: '4px 8px', width: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            flex: 1,
            height: 8,
            background: '#eee',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.max(0, Math.min(100, similarity))}%`,
              height: '100%',
              background: similarityColor(similarity),
              borderRadius: 4,
            }} />
          </div>
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: similarityColor(similarity),
            fontWeight: 'bold',
            minWidth: 36,
            textAlign: 'right',
          }}>
            {similarity.toFixed(0)}%
          </span>
        </div>
      </td>
    </tr>
  );
}

function FeatureSection({ title, baseline, attempt, score }: {
  title: string;
  baseline: Record<string, number> | null;
  attempt: Record<string, number> | null;
  score: number | null;
}) {
  if (!baseline || !attempt) {
    return (
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 13 }}>
          {title} <span style={{ color: '#999', fontWeight: 'normal' }}>- no data</span>
        </h4>
      </div>
    );
  }

  const keys = Object.keys(baseline);

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 13 }}>
        {title}
        {score !== null && (
          <span style={{
            marginLeft: 8,
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 11,
            background: similarityColor(score),
            color: '#fff',
          }}>
            {score.toFixed(1)}
          </span>
        )}
      </h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '4px 8px', fontSize: 11, textAlign: 'left', color: '#999' }}>Feature</th>
            <th style={{ padding: '4px 8px', fontSize: 11, textAlign: 'right', color: '#999' }}>Baseline</th>
            <th style={{ padding: '4px 8px', fontSize: 11, textAlign: 'right', color: '#999' }}>Attempt</th>
            <th style={{ padding: '4px 8px', fontSize: 11, textAlign: 'left', color: '#999' }}>Similarity</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(key => (
            <FeatureRow
              key={key}
              name={key}
              baselineVal={baseline[key] ?? 0}
              attemptVal={attempt[key] ?? 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeatureComparisonView({ baseline, attempt, comparison, title }: Props) {
  return (
    <div>
      {title && <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{title}</h3>}
      <FeatureSection
        title="Pressure"
        baseline={baseline.pressure as unknown as Record<string, number> | null}
        attempt={attempt.pressure as unknown as Record<string, number> | null}
        score={comparison.breakdown.pressure}
      />
      <FeatureSection
        title="Timing"
        baseline={baseline.timing as unknown as Record<string, number>}
        attempt={attempt.timing as unknown as Record<string, number>}
        score={comparison.breakdown.timing}
      />
      <FeatureSection
        title="Kinematic"
        baseline={baseline.kinematic as unknown as Record<string, number>}
        attempt={attempt.kinematic as unknown as Record<string, number>}
        score={comparison.breakdown.kinematic}
      />
      <FeatureSection
        title="Geometric"
        baseline={baseline.geometric as unknown as Record<string, number>}
        attempt={attempt.geometric as unknown as Record<string, number>}
        score={comparison.breakdown.geometric}
      />
      <FeatureSection
        title="Diagnostic flags (not scored)"
        baseline={baseline.diagnosticFlags as unknown as Record<string, number>}
        attempt={attempt.diagnosticFlags as unknown as Record<string, number>}
        score={null}
      />
    </div>
  );
}
