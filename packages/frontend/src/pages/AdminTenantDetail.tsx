import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getAdminTenant, updateAdminTenant,
  createAdminApiKey, revokeAdminApiKey,
  getAdminTenantUsage, deactivateAdminTenant, reactivateAdminTenant,
} from '../api/client';
import { AdminNav } from '../components/admin/AdminNav';
import { StatusPill } from '../components/admin/StatusPill';
import { ApiKeyDisplay } from '../components/admin/ApiKeyDisplay';

type Tab = 'overview' | 'users' | 'keys' | 'usage';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
    </div>
  );
}

export function AdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('free');
  const [usage, setUsage] = useState<any[]>([]);

  const loadTenant = () => {
    if (!tenantId) return;
    setLoading(true);
    getAdminTenant(tenantId)
      .then(t => { setTenant(t); setEditName(t.name); setEditPlan(t.plan || 'free'); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTenant(); }, [tenantId]);
  useEffect(() => {
    if (tab === 'usage' && tenantId) {
      getAdminTenantUsage(tenantId).then(setUsage).catch(console.error);
    }
  }, [tab, tenantId]);

  const handleSaveEdit = async () => {
    if (!tenantId) return;
    try {
      await updateAdminTenant(tenantId, { name: editName, plan: editPlan });
      setEditing(false);
      loadTenant();
    } catch (err) { setError((err as Error).message); }
  };

  const handleCreateKey = async () => {
    if (!tenantId || !newKeyName.trim()) return;
    try {
      const result = await createAdminApiKey(tenantId, newKeyName.trim());
      setNewKey(result.rawKey);
      setNewKeyName('');
      setShowKeyForm(false);
      loadTenant();
    } catch (err) { setError((err as Error).message); }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!tenantId || !confirm('Revoke this API key?')) return;
    try { await revokeAdminApiKey(tenantId, keyId); loadTenant(); }
    catch (err) { setError((err as Error).message); }
  };

  const handleToggleActive = async () => {
    if (!tenantId || !tenant) return;
    const action = tenant.active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action} this tenant?`)) return;
    try {
      if (tenant.active) await deactivateAdminTenant(tenantId);
      else await reactivateAdminTenant(tenantId);
      loadTenant();
    } catch (err) { setError((err as Error).message); }
  };

  if (loading) return <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}><AdminNav /><p style={{ color: '#999' }}>Loading...</p></div>;
  if (!tenant) return <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}><AdminNav /><p style={{ color: '#dc2626' }}>{error || 'Tenant not found'}</p></div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: `Users (${tenant.users?.length || 0})` },
    { key: 'keys', label: 'API Keys' },
    { key: 'usage', label: 'Usage' },
  ];

  const maxUsage = Math.max(1, ...usage.map((d: any) => d.enrollments + d.verifications));
  const inputStyle = { padding: '6px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 4 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <AdminNav />
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin/tenants" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Tenants</Link>
        <span style={{ color: '#ccc', margin: '0 8px' }}>/</span>
        <span style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>{tenant.name}</span>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
          {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>dismiss</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? '#1a1a2e' : '#999', background: 'none', border: 'none',
            borderBottom: tab === t.key ? '2px solid #1a1a2e' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 20 }}>
            {editing ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Name</div><input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} /></div>
                <div><div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Plan</div>
                  <select style={inputStyle} value={editPlan} onChange={e => setEditPlan(e.target.value)}>
                    <option value="free">Free</option><option value="starter">Starter</option><option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <button onClick={handleSaveEdit} style={{ padding: '6px 16px', fontSize: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditing(false)} style={{ padding: '6px 16px', fontSize: 12, background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1a1a2e' }}>{tenant.name}</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#999' }}>
                    {tenant.slug && <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{tenant.slug}</code>}
                    <StatusPill value={tenant.active ? 'active' : 'suspended'} />
                    <StatusPill value={tenant.plan || 'free'} />
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Created {new Date(tenant.createdAt).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(true)} style={{ padding: '6px 16px', fontSize: 12, background: '#fff', color: '#1a1a2e', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Edit</button>
                  <button onClick={handleToggleActive} style={{
                    padding: '6px 16px', fontSize: 12, background: '#fff', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer',
                    color: tenant.active ? '#dc2626' : '#16a34a',
                  }}>{tenant.active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard label="Users" value={tenant.users?.length || 0} />
            <StatCard label="API Keys" value={tenant.apiKeys?.length || 0} />
            <StatCard label="Consents" value={tenant.consents?.filter((c: any) => c.active).length || 0} />
            <StatCard label="Status" value={tenant.active ? 'Active' : 'Suspended'} />
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          {!tenant.users?.length ? <p style={{ color: '#999', fontSize: 14 }}>No users in this tenant yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['External User ID', 'Internal User ID', 'Created'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#999', fontWeight: 500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {tenant.users.map((u: any) => (
                  <tr key={u.internalUserId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.externalUserId}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', color: '#999' }}>{u.internalUserId}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'keys' && (
        <div>
          {newKey && <ApiKeyDisplay rawKey={newKey} onDismiss={() => setNewKey(null)} />}
          {showKeyForm ? (
            <div style={{ padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>Key Name</div>
                <input style={{ ...inputStyle, width: '100%' }} value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production API Key" onKeyDown={e => e.key === 'Enter' && handleCreateKey()} />
              </div>
              <button onClick={handleCreateKey} style={{ padding: '6px 16px', fontSize: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Create</button>
              <button onClick={() => setShowKeyForm(false)} style={{ padding: '6px 16px', fontSize: 12, background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowKeyForm(true)} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 16,
            }}>+ Create API Key</button>
          )}
          {!tenant.apiKeys?.length ? <p style={{ color: '#999', fontSize: 14 }}>No API keys yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Name', 'Key', 'Status', 'Created', 'Last Used', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#999', fontWeight: 500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {tenant.apiKeys.map((key: any) => (
                  <tr key={key.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{key.name}</td>
                    <td style={{ padding: '10px 12px' }}><code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{key.keyPrefix}</code></td>
                    <td style={{ padding: '10px 12px' }}><StatusPill value={key.status} /></td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{new Date(key.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {key.status === 'active' && (
                        <button onClick={() => handleRevokeKey(key.id)} style={{
                          padding: '4px 12px', fontSize: 11, background: '#fff', color: '#dc2626',
                          border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer',
                        }}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'usage' && (
        <div>
          <h4 style={{ fontSize: 14, color: '#1a1a2e', marginBottom: 12 }}>Last 30 Days</h4>
          {usage.length === 0 ? <p style={{ color: '#999', fontSize: 14 }}>No usage data yet.</p> : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, padding: '0 0 20px', borderBottom: '1px solid #e5e7eb' }}>
                {usage.map((d: any) => {
                  const total = d.enrollments + d.verifications;
                  const height = (total / maxUsage) * 160;
                  const enrollH = total > 0 ? (d.enrollments / total) * height : 0;
                  const verifyH = total > 0 ? (d.verifications / total) * height : 0;
                  return (
                    <div key={d.date} title={`${d.date}\nEnrollments: ${d.enrollments}\nVerifications: ${d.verifications}`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 4 }}>
                      <div style={{ height: verifyH, background: '#3b82f6', borderRadius: '2px 2px 0 0' }} />
                      <div style={{ height: enrollH, background: '#22c55e' }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#999' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Enrollments</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6' }} /> Verifications</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
