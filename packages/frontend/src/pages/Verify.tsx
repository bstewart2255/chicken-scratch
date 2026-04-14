import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { QRCode } from '../components/QRCode';
import { SessionPoller } from '../components/SessionPoller';
import * as api from '../api/client';

type Step = 'input' | 'qr' | 'result';

export function Verify() {
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [sessionId, setSessionId] = useState('');

  const startVerify = async () => {
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await api.createSession({ username, type: 'verify' });
      setSessionUrl(session.url);
      setSessionId(session.sessionId);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const onSessionComplete = useCallback((sessionResult: any) => {
    setAuthenticated(!!sessionResult?.authenticated);
    setStep('result');
  }, []);

  const reset = () => {
    setStep('input');
    setAuthenticated(false);
    setError('');
    setSessionUrl('');
    setSessionId('');
  };

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
      <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>Back</Link>
      <h2 style={{ marginTop: 8 }}>Verify</h2>

      {step === 'input' && (
        <div>
          <input
            type="text"
            placeholder="Enter your username (letters, numbers, - _)"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && startVerify()}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 16,
              border: '2px solid #ccc',
              borderRadius: 8,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={startVerify}
            disabled={loading}
            style={{
              marginTop: 12,
              padding: '10px 24px',
              fontSize: 16,
              background: loading ? '#999' : '#1a1a2e',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating session...' : 'Next'}
          </button>
          <p style={{ marginTop: 12, fontSize: 13, color: '#999' }}>
            You'll scan a QR code and draw on your phone to verify.
          </p>
        </div>
      )}

      {step === 'qr' && (
        <div>
          <p style={{ color: '#333', marginBottom: 16 }}>
            Scan this QR code with your phone to verify as <strong>{username}</strong>:
          </p>
          <QRCode url={sessionUrl} />
          <p style={{ fontSize: 13, color: '#999', marginTop: 12, textAlign: 'center' }}>
            Draw your signature, shapes, and drawings on your phone.
            <br />Results will appear here automatically.
          </p>
          <SessionPoller sessionId={sessionId} onComplete={onSessionComplete} />
        </div>
      )}

      {step === 'result' && (
        <div>
          <div style={{
            padding: 24,
            borderRadius: 8,
            border: `2px solid ${authenticated ? '#22c55e' : '#ef4444'}`,
            background: authenticated ? '#f0fdf4' : '#fef2f2',
            marginTop: 16,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 48,
              marginBottom: 8,
            }}>
              {authenticated ? '\u2713' : '\u2717'}
            </div>
            <div style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: authenticated ? '#22c55e' : '#ef4444',
            }}>
              {authenticated ? 'Authenticated' : 'Rejected'}
            </div>
            <p style={{ color: '#666', marginTop: 8, fontSize: 14 }}>
              {authenticated
                ? 'Your identity has been verified.'
                : 'We could not verify your identity. Please try again.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              onClick={reset}
              style={{
                flex: 1,
                padding: '10px 24px',
                fontSize: 16,
                background: '#1a1a2e',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <Link to="/diagnostics" style={{ flex: 1 }}>
              <button style={{
                width: '100%',
                padding: '10px 24px',
                fontSize: 16,
                background: '#fff',
                color: '#1a1a2e',
                border: '2px solid #1a1a2e',
                borderRadius: 8,
                cursor: 'pointer',
              }}>
                View Diagnostics
              </button>
            </Link>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: '#ef4444', marginTop: 12 }}>{error}</p>
      )}
    </div>
  );
}
