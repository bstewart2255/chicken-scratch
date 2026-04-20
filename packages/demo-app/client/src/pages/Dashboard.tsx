import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSession, clearSession, logout } from '../api';

export function Dashboard() {
  const navigate = useNavigate();
  const [session] = useState(() => loadSession());

  useEffect(() => {
    if (!session) navigate('/login');
  }, [session, navigate]);

  const handleLogout = async () => {
    if (session) {
      try { await logout(session.sessionToken); } catch { /* best-effort */ }
    }
    clearSession();
    navigate('/');
  };

  if (!session) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
      <header style={{
        background: '#fff', borderBottom: '1px solid #e2e4e8',
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>
          BenefitsDesk
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
          <span style={{ color: '#6c6f76' }}>{session.email}</span>
          <button onClick={handleLogout} style={{
            padding: '6px 14px', background: '#fff', color: '#1a1a2e',
            border: '1px solid #d0d3d9', borderRadius: 6, fontSize: 13, cursor: 'pointer',
          }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 24px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, color: '#1a1a2e', fontWeight: 700 }}>
          Welcome back
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: '#6c6f76' }}>
          This is where your real dashboard would be — benefits, claims, documents, etc.
        </p>

        <div style={{
          background: '#fff', border: '1px solid #e2e4e8', borderRadius: 10, padding: 24,
        }}>
          <div style={{ fontSize: 11, color: '#6c6f76', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Try the recovery flow
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 18, color: '#1a1a2e' }}>
            Pretend you forgot your password
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6c6f76', lineHeight: 1.5 }}>
            Sign out above, then click &ldquo;Forgot password?&rdquo; on the sign-in page. Enter
            any fragment of your email, pick your account, and sign your name &mdash;
            you should be right back here without ever touching your password.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca0a8' }}>
            Account ID (your <code>externalUserId</code> for chickenScratch): <code>{session.userId}</code>
          </p>
        </div>
      </main>
    </div>
  );
}
