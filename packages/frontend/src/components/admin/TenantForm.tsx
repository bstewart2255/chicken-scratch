import { useState, useEffect } from 'react';

interface TenantFormProps {
  onSubmit: (data: { name: string; slug: string; plan: string }) => void;
  onCancel: () => void;
  initial?: { name: string; slug: string; plan: string };
  submitLabel?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function TenantForm({ onSubmit, onCancel, initial, submitLabel = 'Create' }: TenantFormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [plan, setPlan] = useState(initial?.plan || 'free');
  const [autoSlug, setAutoSlug] = useState(!initial);

  useEffect(() => {
    if (autoSlug) {
      setSlug(slugify(name));
    }
  }, [name, autoSlug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onSubmit({ name: name.trim(), slug: slug.trim(), plan });
  };

  const inputStyle = {
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 6,
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600 as const,
    color: '#555',
    marginBottom: 4,
  };

  return (
    <form onSubmit={handleSubmit} style={{
      padding: 16,
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
        </div>
        <div>
          <label style={labelStyle}>Slug</label>
          <input style={inputStyle} value={slug} onChange={e => { setSlug(e.target.value); setAutoSlug(false); }} placeholder="acme-corp" />
        </div>
        <div>
          <label style={labelStyle}>Plan</label>
          <select style={{ ...inputStyle, height: 38 }} value={plan} onChange={e => setPlan(e.target.value)}>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="submit" style={{
          padding: '8px 20px', fontSize: 13, fontWeight: 600,
          background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
        }}>{submitLabel}</button>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 20px', fontSize: 13,
          background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </form>
  );
}
