import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>chickenScratch</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Biometric signature authentication
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Link to="/app/enroll">
          <button style={{
            padding: '12px 32px',
            fontSize: 16,
            background: '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}>
            Enroll
          </button>
        </Link>
        <Link to="/app/verify">
          <button style={{
            padding: '12px 32px',
            fontSize: 16,
            background: '#fff',
            color: '#1a1a2e',
            border: '2px solid #1a1a2e',
            borderRadius: 8,
            cursor: 'pointer',
          }}>
            Verify
          </button>
        </Link>
      </div>
      <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Link to="/diagnostics" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          Diagnostics Dashboard
        </Link>
        <Link to="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
