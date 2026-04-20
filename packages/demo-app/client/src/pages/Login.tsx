import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, saveSession } from '../api';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const session = await login(email, password);
      saveSession(session);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: '#fff', border: '1px solid #e2e4e8', borderRadius: 10,
        padding: 36, width: '100%', maxWidth: 420,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 22, color: '#1a1a2e', fontWeight: 700 }}>
          Sign in to BenefitsDesk
        </h1>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#6c6f76', marginBottom: 4, fontWeight: 500 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#6c6f76', marginBottom: 4, fontWeight: 500 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          {error && <p style={{ color: '#c03030', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" style={{
            width: '100%', padding: '12px 20px', background: '#1a1a2e', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            Sign in
          </button>
        </form>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Link to="/forgot" style={{ color: '#4a5fc1', textDecoration: 'none' }}>
            Forgot password?
          </Link>
          <Link to="/signup" style={{ color: '#4a5fc1', textDecoration: 'none' }}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 15,
  border: '1px solid #d0d3d9', borderRadius: 6,
  boxSizing: 'border-box',
};
