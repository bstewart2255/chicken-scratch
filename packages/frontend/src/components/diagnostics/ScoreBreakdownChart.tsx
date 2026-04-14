import type { DiagnosticsAttempt } from '@chicken-scratch/shared';

interface Props {
  attempt: DiagnosticsAttempt;
}

function Bar({ label, value, max, color, weight }: {
  label: string;
  value: number;
  max: number;
  color: string;
  weight?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
        <span style={{ color: '#555' }}>
          {label}
          {weight && <span style={{ color: '#999', marginLeft: 4 }}>({weight})</span>}
        </span>
        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 6,
          transition: 'width 0.3s',
        }} />
        {/* threshold marker at 40 (per-modality minimum) */}
        <div style={{
          position: 'absolute',
          left: `${(40 / max) * 100}%`,
          top: 0,
          bottom: 0,
          width: 2,
          background: '#ef4444',
          opacity: 0.5,
        }} />
      </div>
    </div>
  );
}

export function ScoreBreakdownChart({ attempt }: Props) {
  const bd = attempt.breakdown?.breakdown;

  if (attempt.attemptType === 'full' && attempt.signatureComparison && attempt.shapeScores) {
    const sigBd = attempt.signatureComparison.breakdown;
    const sigScore = attempt.signatureComparison.score;
    const avgShape = attempt.shapeScores.length > 0
      ? attempt.shapeScores.reduce((s, x) => s + x.combinedScore, 0) / attempt.shapeScores.length
      : 0;

    return (
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Score Breakdown</h3>

        {/* Final score */}
        <div style={{
          padding: 12,
          background: attempt.authenticated ? '#f0fdf4' : '#fef2f2',
          border: `2px solid ${attempt.authenticated ? '#22c55e' : '#ef4444'}`,
          borderRadius: 8,
          marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: attempt.authenticated ? '#22c55e' : '#ef4444' }}>
            {attempt.score.toFixed(1)}
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>
            Final Score (threshold: {attempt.threshold})
          </div>
        </div>

        {/* Top-level: signature + shapes/drawings */}
        <Bar label="Signature" value={sigScore} max={100} color="#6366f1" weight="70%" />
        <Bar label="Avg Shape/Drawing" value={avgShape} max={100} color="#8b5cf6" weight="30%" />

        <div style={{ height: 1, background: '#eee', margin: '16px 0' }} />

        {/* Signature sub-scores */}
        <h4 style={{ fontSize: 13, margin: '0 0 8px', color: '#555' }}>Signature Sub-scores</h4>
        {sigBd.pressure !== null && (
          <Bar label="Pressure" value={sigBd.pressure} max={100} color="#3b82f6" weight="20%" />
        )}
        <Bar label="Timing" value={sigBd.timing} max={100} color="#06b6d4"
          weight={sigBd.pressure !== null ? '30%' : '35%'} />
        <Bar label="Geometric" value={sigBd.geometric} max={100} color="#10b981"
          weight={sigBd.pressure !== null ? '30%' : '40%'} />
        <Bar label="Security" value={sigBd.security} max={100} color="#f59e0b"
          weight={sigBd.pressure !== null ? '20%' : '25%'} />

        <div style={{ height: 1, background: '#eee', margin: '16px 0' }} />

        {/* Per-shape/drawing scores */}
        <h4 style={{ fontSize: 13, margin: '0 0 8px', color: '#555' }}>Shape &amp; Drawing Scores</h4>
        {attempt.shapeScores.map(s => {
          const isDrawing = s.shapeType === 'house' || s.shapeType === 'smiley';
          return (
            <div key={s.shapeType} style={{ marginBottom: 12 }}>
              <Bar label={`${s.shapeType}${isDrawing ? ' (drawing)' : ''}`} value={s.combinedScore} max={100} color={isDrawing ? '#f97316' : '#8b5cf6'} />
              <div style={{ paddingLeft: 12 }}>
                <Bar label="Biometric" value={s.biometricScore} max={100} color={isDrawing ? '#fb923c' : '#a78bfa'} weight="70%" />
                <Bar label="Shape-specific" value={s.shapeScore} max={100} color={isDrawing ? '#fdba74' : '#c4b5fd'} weight="30%" />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Signature-only attempt
  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Score Breakdown</h3>

      <div style={{
        padding: 12,
        background: attempt.authenticated ? '#f0fdf4' : '#fef2f2',
        border: `2px solid ${attempt.authenticated ? '#22c55e' : '#ef4444'}`,
        borderRadius: 8,
        marginBottom: 16,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, fontWeight: 'bold', color: attempt.authenticated ? '#22c55e' : '#ef4444' }}>
          {attempt.score.toFixed(1)}
        </div>
        <div style={{ fontSize: 12, color: '#999' }}>
          Score (threshold: {attempt.threshold})
        </div>
      </div>

      {bd && (
        <>
          {bd.pressure !== null && (
            <Bar label="Pressure" value={bd.pressure} max={100} color="#3b82f6" weight="20%" />
          )}
          <Bar label="Timing" value={bd.timing} max={100} color="#06b6d4"
            weight={bd.pressure !== null ? '30%' : '35%'} />
          <Bar label="Geometric" value={bd.geometric} max={100} color="#10b981"
            weight={bd.pressure !== null ? '30%' : '40%'} />
          <Bar label="Security" value={bd.security} max={100} color="#f59e0b"
            weight={bd.pressure !== null ? '20%' : '25%'} />
        </>
      )}
    </div>
  );
}
