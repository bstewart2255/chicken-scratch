import type { UserStats } from '@chicken-scratch/shared';

interface Props {
  stats: UserStats;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      flex: 1,
      padding: 12,
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      textAlign: 'center',
      minWidth: 100,
    }}>
      <div style={{ fontSize: 24, fontWeight: 'bold', color: color || '#1a1a2e', fontFamily: 'monospace' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function AggregateStats({ stats }: Props) {
  const passRate = stats.totalAttempts > 0
    ? ((stats.passCount / stats.totalAttempts) * 100).toFixed(0)
    : '0';
  const maxBucketCount = Math.max(1, ...stats.scoreDistribution.map(b => b.count));

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Aggregate Stats</h3>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Total Attempts" value={stats.totalAttempts} />
        <StatCard label="Pass Rate" value={`${passRate}%`} color={Number(passRate) >= 50 ? '#22c55e' : '#ef4444'} />
        <StatCard label="Mean Score" value={stats.meanScore.toFixed(1)} />
        <StatCard label="Std Dev" value={stats.stdDev.toFixed(1)} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Pass" value={stats.passCount} color="#22c55e" />
        <StatCard label="Fail" value={stats.failCount} color="#ef4444" />
        <StatCard label="Min Score" value={stats.minScore.toFixed(1)} color="#ef4444" />
        <StatCard label="Max Score" value={stats.maxScore.toFixed(1)} color="#22c55e" />
      </div>

      {/* Score distribution histogram */}
      <h4 style={{ fontSize: 13, margin: '0 0 8px', color: '#555' }}>Score Distribution</h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, padding: '0 4px' }}>
        {stats.scoreDistribution.map(bucket => {
          const height = bucket.count > 0 ? Math.max(8, (bucket.count / maxBucketCount) * 100) : 0;
          const bucketStart = parseInt(bucket.bucket);
          const color = bucketStart >= 80 ? '#22c55e' : bucketStart >= 60 ? '#eab308' : '#ef4444';

          return (
            <div
              key={bucket.bucket}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              title={`${bucket.bucket}: ${bucket.count} attempts`}
            >
              {bucket.count > 0 && (
                <span style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>{bucket.count}</span>
              )}
              <div style={{
                width: '100%',
                height,
                background: color,
                borderRadius: '4px 4px 0 0',
                minWidth: 16,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, padding: '4px 4px 0' }}>
        {stats.scoreDistribution.map(bucket => (
          <div key={bucket.bucket} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#999' }}>
            {bucket.bucket.split('-')[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
