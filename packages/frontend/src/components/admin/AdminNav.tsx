import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/admin', label: 'Dashboard' },
  { path: '/admin/tenants', label: 'Tenants' },
  { path: '/admin/system', label: 'System' },
];

export function AdminNav() {
  const location = useLocation();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      borderBottom: '1px solid #e5e7eb',
      paddingBottom: 12,
      marginBottom: 24,
    }}>
      <Link to="/" style={{ color: '#999', textDecoration: 'none', fontSize: 13 }}>
        &larr; Home
      </Link>
      <h2 style={{ margin: 0, fontSize: 20, color: '#1a1a2e' }}>Admin</h2>
      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path === '/admin/tenants' && location.pathname.startsWith('/admin/tenants/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#1a1a2e' : '#666',
                background: isActive ? '#f0f0f5' : 'transparent',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
