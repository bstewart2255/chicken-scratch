import type { FingerprintMatchResult } from '@chicken-scratch/shared';

interface Props {
  match: FingerprintMatchResult;
}

export function FingerprintPanel({ match }: Props) {
  const scoreColor = match.score >= 80 ? '#22c55e'
    : match.score >= 50 ? '#eab308'
    : '#ef4444';

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Device Fingerprint</h3>

      {/* Summary */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: match.sameDevice ? '#f0fdf4' : '#fef2f2',
        border: `2px solid ${match.sameDevice ? '#22c55e' : '#ef4444'}`,
        borderRadius: 8,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: scoreColor, fontFamily: 'monospace' }}>
          {match.score}%
        </div>
        <div>
          <div style={{ fontWeight: 'bold', color: match.sameDevice ? '#166534' : '#991b1b' }}>
            {match.sameDevice ? 'Same Device' : 'Different Device'}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {match.signals.filter(s => s.match).length} of {match.signals.length} signals match
          </div>
        </div>
      </div>

      {/* Signal details */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '4px 6px', textAlign: 'left', color: '#999', fontSize: 11 }}>Signal</th>
            <th style={{ padding: '4px 6px', textAlign: 'left', color: '#999', fontSize: 11 }}>Enrolled</th>
            <th style={{ padding: '4px 6px', textAlign: 'left', color: '#999', fontSize: 11 }}>Current</th>
            <th style={{ padding: '4px 6px', textAlign: 'center', color: '#999', fontSize: 11 }}>Match</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', color: '#999', fontSize: 11 }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {match.signals.map(s => (
            <tr key={s.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '4px 6px', fontWeight: 500 }}>{s.name}</td>
              <td style={{
                padding: '4px 6px',
                fontFamily: 'monospace',
                fontSize: 11,
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }} title={s.enrolled}>
                {s.enrolled}
              </td>
              <td style={{
                padding: '4px 6px',
                fontFamily: 'monospace',
                fontSize: 11,
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }} title={s.current}>
                {s.current}
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: s.match ? '#22c55e' : '#ef4444',
                }} />
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', color: '#999' }}>{s.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
