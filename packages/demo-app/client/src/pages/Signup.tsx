import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import QRCodeLib from 'qrcode';
import { ChickenScratch } from '@chicken-scratch/sdk';
import { signup, getSdkToken, saveSession } from '../api';

type Phase = 'form' | 'enroll-prompt' | 'enrolling-desktop' | 'enrolling-mobile' | 'done';

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
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mobileCancelRef = useRef<AbortController | null>(null);

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

  // Desktop enrollment — existing in-page widget flow.
  const startDesktopEnrollment = async () => {
    setPhase('enrolling-desktop');
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

  // Mobile enrollment — create a handoff session, render QR, poll for
  // completion. ChickenScratch.createMobileEnrollSession returns primitives;
  // this component owns the modal UX.
  const startMobileEnrollment = async () => {
    setPhase('enrolling-mobile');
    setError('');

    mobileCancelRef.current?.abort();
    mobileCancelRef.current = new AbortController();
    const abortSignal = mobileCancelRef.current.signal;

    try {
      const { token } = await getSdkToken(userId, 'enroll');
      const cs = new ChickenScratch({
        apiKey: token,
        baseUrl: CHICKEN_SCRATCH_BASE_URL,
        // Container isn't used for this code path but the SDK still requires one.
        container: document.createElement('div'),
      });

      const session = await cs.createMobileEnrollSession(userId);
      // Render the QR into the canvas once the modal mounts. The
      // render-on-mount effect below picks this up via the url prop.
      setQrUrl(session.url);

      const result = await session.waitForCompletion({ signal: abortSignal });
      if (result.enrolled) {
        setPhase('done');
      } else if (!abortSignal.aborted) {
        setError(result.message || 'Mobile enrollment did not complete.');
        setPhase('enroll-prompt');
      }
    } catch (err) {
      if (!abortSignal.aborted) {
        setError((err as Error).message);
        setPhase('enroll-prompt');
      }
    }
  };

  const cancelMobileEnrollment = () => {
    mobileCancelRef.current?.abort();
    setQrUrl('');
    setPhase('enroll-prompt');
  };

  const skipEnrollment = () => navigate('/dashboard');

  // QR rendering effect — runs whenever qrUrl changes and the canvas is mounted.
  const [qrUrl, setQrUrl] = useState('');
  useEffect(() => {
    if (!qrUrl || !qrCanvasRef.current) return;
    QRCodeLib.toCanvas(qrCanvasRef.current, qrUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(() => {
      /* noop — rendering failure is cosmetic, QR URL is also displayed as text below */
    });
  }, [qrUrl, phase]);

  useEffect(() => {
    if (phase === 'done') {
      const t = setTimeout(() => navigate('/dashboard'), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, navigate]);

  // Clean up polling on unmount.
  useEffect(() => () => mobileCancelRef.current?.abort(), []);

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
          <div style={{ padding: 14, background: '#f0f4ff', borderRadius: 6, fontSize: 13, color: '#3a4a8a', marginBottom: 16, lineHeight: 1.5 }}>
            <strong>30 seconds.</strong> One signature, two shapes. You&rsquo;ll
            thank yourself next time you lose your password.
          </div>
          <div style={{ padding: 12, background: '#fff8e7', border: '1px solid #f2d58a', borderRadius: 6, fontSize: 12, color: '#6a5216', marginBottom: 16, lineHeight: 1.5 }}>
            <strong>Pick once:</strong> whichever device you enroll on is where you&rsquo;ll
            need to verify in the future. Mobile enrollments can&rsquo;t verify on desktop
            yet, and vice-versa.
          </div>
          {error && <ErrorLine text={error} />}
          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={startDesktopEnrollment} style={primaryButton}>
              Enroll here (desktop)
            </button>
            <button onClick={startMobileEnrollment} style={primaryButton}>
              Enroll on mobile
            </button>
          </div>
          <button onClick={skipEnrollment} style={{ ...textButton, marginTop: 8 }}>
            Skip for now
          </button>
        </div>
      )}

      {phase === 'enrolling-desktop' && (
        <div>
          <h1 style={heading}>Setting up Sign Recovery</h1>
          <p style={subheading}>Follow the prompts below.</p>
          {error && <ErrorLine text={error} />}
          <div ref={widgetRef} style={{ width: '100%', minHeight: 480 }} />
        </div>
      )}

      {phase === 'enrolling-mobile' && (
        <ModalOverlay onClose={cancelMobileEnrollment}>
          <h2 style={{ ...heading, fontSize: 18, textAlign: 'center' }}>Scan with your phone</h2>
          <p style={{ ...subheading, textAlign: 'center', fontSize: 13 }}>
            Point your phone&rsquo;s camera at the code below.
            You&rsquo;ll draw your signature and shapes there.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
            {qrUrl
              ? <canvas ref={qrCanvasRef} style={{ borderRadius: 8 }} />
              : <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>Generating code&hellip;</div>
            }
          </div>
          {qrUrl && (
            <p style={{ fontSize: 11, color: '#999', textAlign: 'center', wordBreak: 'break-all', margin: '0 0 12px' }}>
              Or open directly: <span style={{ fontFamily: 'monospace' }}>{qrUrl}</span>
            </p>
          )}
          <div style={{ padding: 10, background: '#f5f7fa', borderRadius: 6, fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 12 }}>
            Waiting for you to finish on your phone&hellip; this page will update automatically.
          </div>
          {error && <ErrorLine text={error} />}
          <button onClick={cancelMobileEnrollment} style={textButton}>
            Cancel and choose a different option
          </button>
        </ModalOverlay>
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

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10, 10, 25, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 10, padding: 28,
        width: '100%', maxWidth: 380,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
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
