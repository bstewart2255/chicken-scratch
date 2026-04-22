import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChickenScratch } from '@chicken-scratch/sdk';
import { signup, getSdkToken, saveSession } from '../api';

type Phase = 'form' | 'enroll-prompt' | 'enrolling' | 'done';

const CHICKEN_SCRATCH_BASE_URL =
  import.meta.env.VITE_CHICKEN_SCRATCH_BASE_URL
  ?? 'https://chickenscratch.io';

export function Signup() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const widgetRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const session = await signup(email, password);
      saveSession(session);
      setUserId(session.userId);
      setPhase('enroll-prompt');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEnrollment = async () => {
    setPhase('enrolling');
    setError('');
    try {
      const { token } = await getSdkToken(userId, 'enroll');
      if (!widgetRef.current) throw new Error('Widget container not mounted.');

      const cs = new ChickenScratch({
        apiKey: token,
        baseUrl: CHICKEN_SCRATCH_BASE_URL,
        container: widgetRef.current,
        onComplete: (result) => {
          if (result.enrolled) {
            setPhase('done');
          } else {
            setError(result.message || 'Enrollment did not complete.');
            setPhase('enroll-prompt');
          }
        },
        onError: (err) => {
          setError(err.message);
          setPhase('enroll-prompt');
        },
      });

      await cs.enroll(userId);
    } catch (err) {
      setError((err as Error).message);
      setPhase('enroll-prompt');
    }
  };

  const skipEnrollment = () => navigate('/dashboard');

  useEffect(() => {
    if (phase === 'done') {
      const t = setTimeout(() => navigate('/dashboard'), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, navigate]);

  return (
    <PageShell>
      {phase === 'form' && (
        <form onSubmit={handleSubmit}>
          <h1 style={heading}>Create your account</h1>
          <Field label="Work email" type="email" value={email} onChange={setEmail} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          {error && <ErrorLine text={error} />}
          <button type="submit" style={primaryButton}>Create account</button>
          <p style={footerText}>
            Already have an account? <Link to="/login" style={link}>Sign in</Link>
          </p>
        </form>
      )}

      {phase === 'enroll-prompt' && (
        <div>
          <h1 style={heading}>Set up Sign Recovery</h1>
          <p style={subheading}>
            Never get locked out, even if you forget your password or which email you used.
            Sign your name and draw a couple of shapes — we&rsquo;ll use how you drew them as
            your biometric recovery key.
          </p>
          <div style={{ padding: 14, background: '#f0f4ff', borderRadius: 6, fontSize: 13, color: '#3a4a8a', marginBottom: 20, lineHeight: 1.5 }}>
            <strong>30 seconds.</strong> One signature, two shapes. You&rsquo;ll
            thank yourself next time you lose your password.
          </div>
          {error && <ErrorLine text={error} />}
          <button onClick={startEnrollment} style={primaryButton}>Set up Sign Recovery</button>
          <button onClick={skipEnrollment} style={{ ...textButton, marginTop: 8 }}>
            Skip for now
          </button>
        </div>
      )}

      {phase === 'enrolling' && (
        <div>
          <h1 style={heading}>Setting up Sign Recovery</h1>
          <p style={subheading}>Follow the prompts below.</p>
          {error && <ErrorLine text={error} />}
          <div ref={widgetRef} style={{ width: '100%', minHeight: 480 }} />
        </div>
      )}

      {phase === 'done' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#9989;</div>
          <h1 style={heading}>You&rsquo;re all set</h1>
          <p style={subheading}>
            Sign Recovery is enabled. Redirecting you to your dashboard&hellip;
          </p>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: '#fff', border: '1px solid #e2e4e8', borderRadius: 10,
        padding: 36, width: '100%', maxWidth: 520,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: '#6c6f76', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        style={{
          width: '100%', padding: '10px 12px', fontSize: 15,
          border: '1px solid #d0d3d9', borderRadius: 6,
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p style={{ color: '#c03030', fontSize: 13, marginBottom: 12 }}>{text}</p>;
}

const heading: React.CSSProperties = { margin: '0 0 8px', fontSize: 22, color: '#1a1a2e', fontWeight: 700 };
const subheading: React.CSSProperties = { margin: '0 0 20px', fontSize: 14, color: '#6c6f76', lineHeight: 1.5 };
const primaryButton: React.CSSProperties = {
  width: '100%', padding: '12px 20px', background: '#1a1a2e', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer',
};
const textButton: React.CSSProperties = {
  width: '100%', padding: '10px 20px', background: 'transparent', color: '#6c6f76',
  border: 'none', fontSize: 13, cursor: 'pointer',
};
const footerText: React.CSSProperties = { marginTop: 14, textAlign: 'center', fontSize: 13, color: '#6c6f76' };
const link: React.CSSProperties = { color: '#4a5fc1', textDecoration: 'none' };
