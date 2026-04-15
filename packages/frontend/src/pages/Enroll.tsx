import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { QRCode } from '../components/QRCode';
import { SessionPoller } from '../components/SessionPoller';
import * as api from '../api/client';

type Step = 'username' | 'qr' | 'done';

export function Enroll() {
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<Step>('username');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [sessionId, setSessionId] = useState('');

  const startEnrollment = async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await api.createSession({ username, type: 'enroll' });
      setSessionUrl(session.url);
      setSessionId(session.sessionId);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const onSessionComplete = useCallback(() => {
    setStep('done');
  }, []);

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
      <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>Back</Link>
      <h2 style={{ marginTop: 8 }}>Enroll</h2>

      {step === 'username' && (
        <div>
          <input
            type="text"
            placeholder="Choose a username (letters, numbers, - _)"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && startEnrollment()}
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
            onClick={startEnrollment}
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
            You'll scan a QR code and complete enrollment on your phone.
          </p>
        </div>
      )}

      {step === 'qr' && (
        <div>
          <p style={{ color: '#333', marginBottom: 16 }}>
            Scan this QR code with your phone to enroll as <strong>{username}</strong>:
          </p>
          <QRCode url={sessionUrl} />
          <p style={{ fontSize: 13, color: '#999', marginTop: 12, textAlign: 'center' }}>
            Draw your signature 3 times, then draw shapes and drawings on your phone.
            <br />This page will update automatically when you're done.
          </p>
          <SessionPoller sessionId={sessionId} onComplete={onSessionComplete} />
        </div>
      )}

      {step === 'done' && (
        <div style={{
          padding: 20,
          background: '#f0fdf4',
          border: '2px solid #22c55e',
          borderRadius: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, color: '#22c55e', marginBottom: 8 }}>Enrolled!</div>
          <p>Enrollment complete via phone. Signature, shapes, and drawings baseline computed.</p>
          <Link to="/verify">
            <button style={{
              marginTop: 12,
              padding: '10px 24px',
              fontSize: 16,
              background: '#1a1a2e',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}>
              Try Verification
            </button>
          </Link>
        </div>
      )}

      {error && (
        <p style={{ color: '#ef4444', marginTop: 12 }}>{error}</p>
      )}
    </div>
  );
}
