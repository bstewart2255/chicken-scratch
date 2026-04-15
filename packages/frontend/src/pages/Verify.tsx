import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type SignaturePad from 'signature_pad';
import type { ChallengeItemType, RawSignatureData, ShapeData } from '@chicken-scratch/shared';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ShapeCanvas } from '../components/ShapeCanvas';
import { QRCode } from '../components/QRCode';
import { SessionPoller } from '../components/SessionPoller';
import { useDeviceCapabilities } from '../hooks/useDeviceCapabilities';
import { buildSignatureData } from '../lib/stroke-collector';
import * as api from '../api/client';

const SHAPE_LABELS: Record<ChallengeItemType, string> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  house: 'House',
  smiley: 'Smiley Face',
};

type Step =
  | 'input'
  | 'method'
  | 'sig'
  | `shape-${number}`
  | 'submitting'
  | 'result'
  | 'qr'
  | 'qr-result';

export function Verify() {
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [sessionId, setSessionId] = useState('');

  // Challenge state (inline flow)
  const [challengeId, setChallengeId] = useState('');
  const [shapeOrder, setShapeOrder] = useState<ChallengeItemType[]>([]);
  const [signatureData, setSignatureData] = useState<RawSignatureData | null>(null);
  const [shapeDataList, setShapeDataList] = useState<ShapeData[]>([]);

  const padRef = useRef<SignaturePad | null>(null);
  const deviceCaps = useDeviceCapabilities();

  const currentShapeIdx = step.startsWith('shape-') ? parseInt(step.split('-')[1]) : 0;
  const totalSteps = 1 + shapeOrder.length; // sig + shapes
  const completedSteps = step === 'sig' ? 0
    : step.startsWith('shape-') ? 1 + currentShapeIdx
    : step === 'submitting' || step === 'result' ? totalSteps : 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const clearPad = () => padRef.current?.clear();

  const startInline = async () => {
    setLoading(true);
    setError('');
    try {
      const challenge = await api.getChallenge(username);
      setChallengeId(challenge.challengeId);
      setShapeOrder(challenge.shapeOrder as ChallengeItemType[]);
      setShapeDataList([]);
      setSignatureData(null);
      clearPad();
      setStep('sig');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get challenge');
    } finally {
      setLoading(false);
    }
  };

  const submitSig = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw your signature first.');
      return;
    }
    const canvas = (padRef.current as any).canvas as HTMLCanvasElement;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    setSignatureData(data);
    clearPad();
    setError('');
    setStep('shape-0');
  };

  const submitShape = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError(`Please draw the ${SHAPE_LABELS[shapeOrder[currentShapeIdx]]}.`);
      return;
    }
    const canvas = (padRef.current as any).canvas as HTMLCanvasElement;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    const shapeEntry: ShapeData = {
      shapeType: shapeOrder[currentShapeIdx],
      signatureData: data,
    };
    const updatedShapes = [...shapeDataList, shapeEntry];

    if (currentShapeIdx < shapeOrder.length - 1) {
      setShapeDataList(updatedShapes);
      clearPad();
      setError('');
      setStep(`shape-${currentShapeIdx + 1}` as Step);
      return;
    }

    // All shapes collected — submit
    setStep('submitting');
    setLoading(true);
    setError('');
    try {
      const result = await api.verifyFull({
        username,
        signatureData: signatureData!,
        shapes: updatedShapes,
        challengeId,
      });
      setAuthenticated(result.authenticated);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStep(`shape-${currentShapeIdx}` as Step);
    } finally {
      setLoading(false);
    }
  };

  const startQr = async () => {
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

  const onQrComplete = useCallback((result: any) => {
    setAuthenticated(!!result?.authenticated);
    setStep('qr-result');
  }, []);

  const reset = () => {
    setStep('input');
    setAuthenticated(false);
    setError('');
    setChallengeId('');
    setShapeOrder([]);
    setSignatureData(null);
    setShapeDataList([]);
    clearPad();
  };

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
      <Link to="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← Back</Link>
      <h2 style={{ marginTop: 8, marginBottom: 4 }}>Verify</h2>

      {/* ── Username ── */}
      {step === 'input' && (
        <div>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && username.trim() && setStep('method')}
            style={inputStyle}
            autoFocus
          />
          <button
            onClick={() => username.trim() && setStep('method')}
            style={btnStyle}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Method choice ── */}
      {step === 'method' && (
        <div>
          <p style={{ color: '#555', marginBottom: 16 }}>
            Verifying as <strong>{username}</strong>. How would you like to verify?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={startInline}
              disabled={loading}
              style={{ ...btnStyle, padding: '16px 24px', fontSize: 16 }}
            >
              {loading ? 'Loading challenge…' : '✍️ Draw on this device'}
            </button>
            <button
              onClick={startQr}
              disabled={loading}
              style={{ ...btnOutlineStyle, padding: '16px 24px', fontSize: 16 }}
            >
              {loading ? 'Creating session…' : '📱 Use my phone (QR code)'}
            </button>
          </div>
        </div>
      )}

      {/* ── Inline: signature ── */}
      {step === 'sig' && (
        <div>
          <ProgressBar pct={progressPct} label="Step 1 — Draw your signature" />
          <p style={{ color: '#555', marginBottom: 8 }}>Sign naturally, as you enrolled.</p>
          <SignatureCanvas padRef={padRef} height={200} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={clearPad} style={btnOutlineStyle}>Clear</button>
            <button onClick={submitSig} style={{ ...btnStyle, flex: 1 }}>Next →</button>
          </div>
          {error && <p style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {/* ── Inline: shape steps ── */}
      {step.startsWith('shape-') && shapeOrder.length > 0 && (
        <div>
          <ProgressBar
            pct={progressPct}
            label={`Step ${2 + currentShapeIdx} — Draw a ${SHAPE_LABELS[shapeOrder[currentShapeIdx]]}`}
          />
          <p style={{ color: '#555', marginBottom: 8 }}>Draw as you did during enrollment.</p>
          <ShapeCanvas
            key={`${challengeId}-${currentShapeIdx}`}
            shapeType={shapeOrder[currentShapeIdx]}
            padRef={padRef}
            height={200}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={clearPad} style={btnOutlineStyle}>Clear</button>
            <button onClick={submitShape} disabled={loading} style={{ ...btnStyle, flex: 1 }}>
              {loading ? 'Verifying…' : currentShapeIdx < shapeOrder.length - 1 ? 'Next →' : 'Submit ✓'}
            </button>
          </div>
          {error && <p style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{error}</p>}
        </div>
      )}

      {/* ── Submitting ── */}
      {step === 'submitting' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 18, color: '#555' }}>Verifying…</p>
        </div>
      )}

      {/* ── Result (inline) ── */}
      {step === 'result' && (
        <ResultCard
          authenticated={authenticated}
          onRetry={reset}
        />
      )}

      {/* ── QR flow ── */}
      {step === 'qr' && (
        <div>
          <p style={{ color: '#333', marginBottom: 16 }}>
            Scan with your phone to verify as <strong>{username}</strong>:
          </p>
          <QRCode url={sessionUrl} />
          <p style={{ fontSize: 13, color: '#999', marginTop: 8, textAlign: 'center' }}>
            Draw your signature and shapes on your phone.<br />
            Results appear here automatically.
          </p>
          <SessionPoller sessionId={sessionId} onComplete={onQrComplete} />
        </div>
      )}

      {step === 'qr-result' && (
        <ResultCard authenticated={authenticated} onRetry={reset} />
      )}

      {(step === 'input' || step === 'method') && error && (
        <p style={{ color: '#ef4444', marginTop: 12, fontSize: 14 }}>{error}</p>
      )}
    </div>
  );
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#2563eb', borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function ResultCard({ authenticated, onRetry }: { authenticated: boolean; onRetry: () => void }) {
  return (
    <div>
      <div style={{
        padding: 24,
        borderRadius: 8,
        border: `2px solid ${authenticated ? '#22c55e' : '#ef4444'}`,
        background: authenticated ? '#f0fdf4' : '#fef2f2',
        textAlign: 'center',
        marginTop: 8,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{authenticated ? '✓' : '✗'}</div>
        <div style={{
          fontSize: 24,
          fontWeight: 700,
          color: authenticated ? '#16a34a' : '#dc2626',
          marginBottom: 8,
        }}>
          {authenticated ? 'Authenticated' : 'Rejected'}
        </div>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          {authenticated
            ? 'Your identity has been verified.'
            : 'We could not verify your identity. Try again.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button onClick={onRetry} style={{ ...btnStyle, flex: 1 }}>Try Again</button>
        <Link to="/diagnostics" style={{ flex: 1 }}>
          <button style={{ ...btnOutlineStyle, width: '100%' }}>Diagnostics</button>
        </Link>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 12,
  fontSize: 16,
  border: '2px solid #d1d5db',
  borderRadius: 8,
  boxSizing: 'border-box',
  marginBottom: 12,
};

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 15,
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const btnOutlineStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 15,
  background: '#fff',
  color: '#1a1a2e',
  border: '2px solid #1a1a2e',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};
