import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, getAdminTenants } from '../api/client';
import { AdminNav } from '../components/admin/AdminNav';
import { StatusPill } from '../components/admin/StatusPill';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminDashboard(), getAdminTenants()])
      .then(([s, t]) => { setStats(s); setTenants(t); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}><AdminNav /><p style={{ color: '#999' }}>Loading...</p></div>;

  if (error) return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <AdminNav />
      <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>
        {error}
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Make sure ADMIN_API_KEY is set and the key is stored in localStorage (key: "adminApiKey").
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <AdminNav />
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
          <StatCard label="Tenants" value={stats.totalTenants} sub={`${stats.activeTenants} active`} />
          <StatCard label="Total Users" value={stats.totalUsers} sub={`${stats.enrolledUsers} enrolled`} />
          <StatCard label="Verifications Today" value={stats.verificationsToday} />
          <StatCard label="Total Verifications" value={stats.totalVerifications} />
          <StatCard label="Failure Rate (7d)" value={`${(stats.recentFailureRate * 100).toFixed(1)}%`} />
        </div>
      )}
      <h3 style={{ fontSize: 16, color: '#1a1a2e', marginBottom: 12 }}>Tenants</h3>
      {tenants.length === 0 ? (
        <p style={{ color: '#999', fontSize: 14 }}>No tenants yet. <Link to="/admin/tenants" style={{ color: '#1a1a2e' }}>Create one</Link></p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              {['Name', 'Status', 'Plan', 'Users', 'Last Activity'].map(h => (
                <th key={h} style={{ textAlign: h === 'Users' ? 'right' : 'left', padding: '8px 12px', color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t: any) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '10px 12px' }}>
                  <Link to={`/admin/tenants/${t.id}`} style={{ color: '#1a1a2e', textDecoration: 'none', fontWeight: 500 }}>{t.name}</Link>
                  {t.slug && <div style={{ fontSize: 11, color: '#999' }}>{t.slug}</div>}
                </td>
                <td style={{ padding: '10px 12px' }}><StatusPill value={t.active ? 'active' : 'suspended'} /></td>
                <td style={{ padding: '10px 12px' }}><StatusPill value={t.plan || 'free'} /></td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{t.userCount}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>
                  {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
