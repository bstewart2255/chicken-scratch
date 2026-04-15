import { THRESHOLDS } from '@chicken-scratch/shared';
import { AdminNav } from '../components/admin/AdminNav';

const thresholdEntries = Object.entries(THRESHOLDS).map(([key, value]) => ({
  key,
  label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  value,
}));

export function AdminSystem() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <AdminNav />
      <h3 style={{ fontSize: 18, color: '#1a1a2e', marginBottom: 16 }}>System Configuration</h3>
      <div style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, color: '#1a1a2e', margin: '0 0 12px' }}>Authentication Thresholds</h4>
        <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
          Current threshold values used for signature verification scoring.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#999', fontWeight: 500 }}>Parameter</th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: '#999', fontWeight: 500 }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {thresholdEntries.map(entry => (
              <tr key={entry.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontWeight: 500 }}>{entry.label}</span>
                  <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{entry.key}</div>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                  {typeof entry.value === 'number' ? entry.value : JSON.stringify(entry.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: 16, background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
        Threshold tuning UI coming soon. For now, thresholds are configured in{' '}
        <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>packages/shared/src/constants/thresholds.ts</code>
      </div>
    </div>
  );
}
