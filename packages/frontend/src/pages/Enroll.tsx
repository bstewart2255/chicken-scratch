import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type SignaturePad from 'signature_pad';
import { THRESHOLDS, ALL_CHALLENGE_TYPES } from '@chicken-scratch/shared';
import type { ChallengeItemType } from '@chicken-scratch/shared';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ShapeCanvas } from '../components/ShapeCanvas';
import { QRCode } from '../components/QRCode';
import { SessionPoller } from '../components/SessionPoller';
import { useDeviceCapabilities } from '../hooks/useDeviceCapabilities';
import { buildSignatureData } from '../lib/stroke-collector';
import * as api from '../api/client';

const SIG_COUNT = THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED;
const SHAPES = ALL_CHALLENGE_TYPES as ChallengeItemType[];
const SHAPE_LABELS: Record<ChallengeItemType, string> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  house: 'House',
  smiley: 'Smiley Face',
};

type Step =
  | 'username'
  | 'method'
  | `sig-${number}`         // sig-1, sig-2, sig-3
  | `shape-${number}`       // shape-0 … shape-4
  | 'done'
  | 'qr'
  | 'qr-done';

export function Enroll() {
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<Step>('username');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const padRef = useRef<SignaturePad | null>(null);
  const deviceCaps = useDeviceCapabilities();

  const currentSigNum = step.startsWith('sig-') ? parseInt(step.split('-')[1]) : 0;
  const currentShapeIdx = step.startsWith('shape-') ? parseInt(step.split('-')[1]) : 0;

  const clearPad = () => padRef.current?.clear();

  const submitSig = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw your signature first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const canvas = (padRef.current as any).canvas as HTMLCanvasElement;
      const data = buildSignatureData(padRef.current, canvas, deviceCaps);
      const result = await api.enroll({ username, signatureData: data });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (currentSigNum < SIG_COUNT) {
        clearPad();
        setStep(`sig-${currentSigNum + 1}` as Step);
      } else {
        clearPad();
        setStep('shape-0');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const submitShape = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError(`Please draw the ${SHAPE_LABELS[SHAPES[currentShapeIdx]]}.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const canvas = (padRef.current as any).canvas as HTMLCanvasElement;
      const data = buildSignatureData(padRef.current, canvas, deviceCaps);
      const result = await api.enrollShape({
        username,
        shapeType: SHAPES[currentShapeIdx],
        signatureData: data,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      clearPad();
      if (currentShapeIdx < SHAPES.length - 1) {
        setStep(`shape-${currentShapeIdx + 1}` as Step);
      } else {
        setStep('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const startQr = async () => {
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

  const onQrComplete = useCallback(() => setStep('qr-done'), []);

  const totalSteps = SIG_COUNT + SHAPES.length;
  const completedSteps = step.startsWith('sig-')
    ? currentSigNum - 1
    : step.startsWith('shape-')
    ? SIG_COUNT + currentShapeIdx
    : step === 'done' ? totalSteps : 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
      <Link to="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← Back</Link>
      <h2 style={{ marginTop: 8, marginBottom: 4 }}>Enroll</h2>

      {/* ── Username ── */}
      {step === 'username' && (
        <div>
          <input
            type="text"
            placeholder="Choose a username"
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
            Enrolling as <strong>{username}</strong>. How would you like to enroll?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setStep('sig-1')}
              style={{ ...btnStyle, padding: '16px 24px', fontSize: 16 }}
            >
              ✍️ Draw on this device
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

      {/* ── Inline: signature steps ── */}
      {step.startsWith('sig-') && (
        <div>
          <ProgressBar pct={progressPct} label={`Signature ${currentSigNum} of ${SIG_COUNT}`} />
          <p style={{ color: '#555', marginBottom: 8 }}>
            Draw your signature naturally — same as you'd sign a document.
          </p>
          <SignatureCanvas padRef={padRef} height={200} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={clearPad} style={btnOutlineStyle}>Clear</button>
            <button onClick={submitSig} disabled={loading} style={{ ...btnStyle, flex: 1 }}>
              {loading ? 'Saving…' : currentSigNum < SIG_COUNT ? `Next →` : 'Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Inline: shape steps ── */}
      {step.startsWith('shape-') && (
        <div>
          <ProgressBar
            pct={progressPct}
            label={`Shape ${currentShapeIdx + 1} of ${SHAPES.length}: ${SHAPE_LABELS[SHAPES[currentShapeIdx]]}`}
          />
          <p style={{ color: '#555', marginBottom: 8 }}>
            Draw the shape as naturally as you can.
          </p>
          <ShapeCanvas
            key={SHAPES[currentShapeIdx]}
            shapeType={SHAPES[currentShapeIdx]}
            padRef={padRef}
            height={200}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={clearPad} style={btnOutlineStyle}>Clear</button>
            <button onClick={submitShape} disabled={loading} style={{ ...btnStyle, flex: 1 }}>
              {loading ? 'Saving…' : currentShapeIdx < SHAPES.length - 1 ? 'Next →' : 'Finish ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ── Done (inline) ── */}
      {step === 'done' && (
        <SuccessCard
          title="Enrolled!"
          body="Signature baseline and shape baselines computed. You're ready to verify."
          username={username}
        />
      )}

      {/* ── QR flow ── */}
      {step === 'qr' && (
        <div>
          <p style={{ color: '#333', marginBottom: 16 }}>
            Scan with your phone to enroll as <strong>{username}</strong>:
          </p>
          <QRCode url={sessionUrl} />
          <p style={{ fontSize: 13, color: '#999', marginTop: 8, textAlign: 'center' }}>
            Draw your signature 3×, then draw each shape on your phone.<br />
            This page updates automatically when done.
          </p>
          <SessionPoller sessionId={sessionId} onComplete={onQrComplete} />
        </div>
      )}

      {step === 'qr-done' && (
        <SuccessCard
          title="Enrolled via phone!"
          body="All drawing steps completed on your phone. Baseline computed."
          username={username}
        />
      )}

      {error && <p style={{ color: '#ef4444', marginTop: 12, fontSize: 14 }}>{error}</p>}
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

function SuccessCard({ title, body, username }: { title: string; body: string; username: string }) {
  return (
    <div style={{ padding: 24, background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>{title}</div>
      <p style={{ color: '#374151', marginBottom: 16 }}>{body}</p>
      <Link to={`/verify`}>
        <button style={btnStyle}>Try Verification →</button>
      </Link>
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
