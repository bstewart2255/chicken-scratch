import type { DiagnosticsAttempt } from '@chicken-scratch/shared';
import * as api from '../../api/client';

interface Props {
  attempts: DiagnosticsAttempt[];
  selectedId: string | null;
  onSelect: (attempt: DiagnosticsAttempt) => void;
  onForgeryToggle: (attemptId: string, isForgery: boolean) => void;
}

export function AttemptHistoryTable({ attempts, selectedId, onSelect, onForgeryToggle }: Props) {
  if (attempts.length === 0) {
    return <p style={{ color: '#999', fontStyle: 'italic' }}>No verification attempts yet.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px' }}>Time</th>
            <th style={{ padding: '8px 6px' }}>Type</th>
            <th style={{ padding: '8px 6px' }}>Score</th>
            <th style={{ padding: '8px 6px' }}>Threshold</th>
            <th style={{ padding: '8px 6px' }}>Result</th>
            <th style={{ padding: '8px 6px' }}>Sig Score</th>
            <th style={{ padding: '8px 6px' }}>Duration</th>
            <th style={{ padding: '8px 6px' }}>Device</th>
            <th style={{ padding: '8px 6px', textAlign: 'center' }}>Forgery</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map(a => {
            const isSelected = a.id === selectedId;
            const dc = a.deviceCapabilities;
            const deviceLabel = dc?.inputMethod === 'touch' ? 'Touch'
              : dc?.inputMethod === 'stylus' ? 'Stylus'
              : 'Mouse';
            const sigScore = a.signatureComparison?.score ?? a.breakdown?.score ?? null;

            return (
              <tr
                key={a.id}
                onClick={() => onSelect(a)}
                style={{
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  background: isSelected ? '#e8f0fe' : 'transparent',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f5f5f5';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 11,
                    background: a.attemptType === 'full' ? '#e0e7ff' : '#f3e8ff',
                    color: a.attemptType === 'full' ? '#3730a3' : '#7c3aed',
                  }}>
                    {a.attemptType}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {a.score.toFixed(1)}
                </td>
                <td style={{ padding: '8px 6px', color: '#999', fontFamily: 'monospace' }}>
                  {a.threshold}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 'bold',
                    background: a.authenticated ? '#dcfce7' : '#fee2e2',
                    color: a.authenticated ? '#166534' : '#991b1b',
                  }}>
                    {a.authenticated ? 'PASS' : 'FAIL'}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>
                  {sigScore !== null ? sigScore.toFixed(1) : '-'}
                </td>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                  {a.durationMs ? `${(a.durationMs / 1000).toFixed(1)}s` : '-'}
                </td>
                <td style={{ padding: '8px 6px', fontSize: 11, color: '#666' }}>
                  {deviceLabel}
                  {dc?.supportsPressure && ' + pressure'}
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={a.isForgery}
                    onChange={e => {
                      e.stopPropagation();
                      onForgeryToggle(a.id, e.target.checked);
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
