import type { VerifyResponse } from '@chicken-scratch/shared';

interface Props {
  result: VerifyResponse;
}

export function ScoreDisplay({ result }: Props) {
  const color = result.authenticated ? '#22c55e' : '#ef4444';

  return (
    <div style={{
      padding: 20,
      borderRadius: 8,
      border: `2px solid ${color}`,
      background: result.authenticated ? '#f0fdf4' : '#fef2f2',
      marginTop: 16,
    }}>
      <div style={{ fontSize: 24, fontWeight: 'bold', color }}>
        {result.authenticated ? 'Authenticated' : 'Rejected'}
      </div>
      <div style={{ fontSize: 48, fontWeight: 'bold', color, margin: '8px 0' }}>
        {result.score.toFixed(1)}
      </div>
      <div style={{ color: '#666', fontSize: 14 }}>
        Threshold: {result.threshold}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
        <strong>Breakdown:</strong>
        <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
          {result.comparison.breakdown.pressure !== null && (
            <li>Pressure: {result.comparison.breakdown.pressure.toFixed(1)}</li>
          )}
          <li>Timing: {result.comparison.breakdown.timing.toFixed(1)}</li>
          <li>Kinematic: {result.comparison.breakdown.kinematic.toFixed(1)}</li>
          <li>Geometric: {result.comparison.breakdown.geometric.toFixed(1)}</li>
        </ul>
      </div>
      {result.comparison.diagnosticFlags && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#777' }}>
          <strong>Diagnostic signals</strong> (not part of the score — inspection only):
          <ul style={{ margin: '2px 0', paddingLeft: 20 }}>
            <li>Speed anomaly: {result.comparison.diagnosticFlags.speedAnomalyScore.toFixed(2)}</li>
            <li>Timing regularity: {result.comparison.diagnosticFlags.timingRegularityScore.toFixed(2)}</li>
            <li>Behavioral authenticity: {result.comparison.diagnosticFlags.behavioralAuthenticityScore.toFixed(2)}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
