import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAdminTenants, createAdminTenant } from '../api/client';
import { AdminNav } from '../components/admin/AdminNav';
import { StatusPill } from '../components/admin/StatusPill';
import { TenantForm } from '../components/admin/TenantForm';
import { ApiKeyDisplay } from '../components/admin/ApiKeyDisplay';

export function AdminTenants() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const loadTenants = () => {
    setLoading(true);
    getAdminTenants().then(setTenants).catch(err => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadTenants(); }, []);

  const handleCreate = async (data: { name: string; slug: string; plan: string }) => {
    setError(null);
    try {
      const result = await createAdminTenant(data);
      setShowForm(false);
      if (result.apiKey?.rawKey) {
        setNewApiKey(result.apiKey.rawKey);
      }
      loadTenants();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <AdminNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, color: '#1a1a2e', margin: 0 }}>Tenants</h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600,
            background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>+ Create Tenant</button>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {newApiKey && <ApiKeyDisplay rawKey={newApiKey} onDismiss={() => setNewApiKey(null)} />}

      {showForm && <TenantForm onSubmit={handleCreate} onCancel={() => { setShowForm(false); setError(null); }} />}

      {loading ? <p style={{ color: '#999' }}>Loading...</p> : tenants.length === 0 ? (
        <p style={{ color: '#999', fontSize: 14 }}>No tenants yet. Create one to get started.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              {['Name', 'Status', 'Plan', 'Users', 'Created'].map(h => (
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
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
