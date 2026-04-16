import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ShapeCanvas } from '../components/ShapeCanvas';
import {
  getSession,
  demoEnroll,
  demoEnrollShape,
  createDemoVerifySession,
  demoVerify,
} from '../api/client';
import type { ChallengeItemType, RawSignatureData } from '@chicken-scratch/shared';

type Phase = 'loading' | 'enroll_sig' | 'enroll_shape' | 'enroll_done' | 'verify_sig' | 'verify_shape' | 'verifying' | 'result' | 'error';

const SHAPE_LABELS: Record<string, string> = {
  circle: 'Draw a Circle',
  square: 'Draw a Square',
  triangle: 'Draw a Triangle',
  house: 'Draw a House',
  smiley: 'Draw a Smiley Face',
};

function collectStrokes(pad: SignaturePad, canvas: HTMLCanvasElement): RawSignatureData {
  const data = pad.toData();
  const strokes = data.map((group: any) => {
    const points = group.points.map((p: any) => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure ?? 0.5,
      timestamp: p.time ?? Date.now(),
    }));
    return {
      points,
      startTime: points[0]?.timestamp ?? Date.now(),
      endTime: points[points.length - 1]?.timestamp ?? Date.now(),
    };
  });

  return {
    strokes,
    canvasSize: { width: canvas.width, height: canvas.height },
    deviceCapabilities: {
      supportsPressure: 'PointerEvent' in window,
      supportsTouch: 'ontouchstart' in window,
      inputMethod: 'ontouchstart' in window ? 'touch' : 'mouse',
      browser: navigator.userAgent.split(' ').pop() || 'Unknown',
      os: navigator.platform || 'Unknown',
    },
    capturedAt: new Date().toISOString(),
  };
}

export function DemoMobile() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [username, setUsername] = useState('');
  const [shapeOrder, setShapeOrder] = useState<string[]>([]);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [error, setError] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    authenticated: boolean;
    message: string;
    scoreBreakdown?: { signature: number; shapes: { type: string; score: number }[] };
  } | null>(null);
  const [enrollSessionId, setEnrollSessionId] = useState('');
  const [verifySessionId, setVerifySessionId] = useState('');
  const padRef = useRef<SignaturePad | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Verification data collection
  const verifySigRef = useRef<RawSignatureData | null>(null);
  const verifyShapesRef = useRef<{ shapeType: string; signatureData: RawSignatureData }[]>([]);
  const flowStartRef = useRef(0);
  const stepStartRef = useRef(0);
  const stepDurationsRef = useRef<{ step: string; durationMs: number }[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then(session => {
        if (!session) { setError('Session not found.'); setPhase('error'); return; }
        if (session.status === 'expired') { setError('Session expired. Go back and try again.'); setPhase('error'); return; }
        setUsername(session.username);
        setShapeOrder(session.shapeOrder);
        setEnrollSessionId(session.id);
        if (session.type === 'demo_enroll') {
          setPhase('enroll_sig');
        } else if (session.type === 'demo_verify') {
          setVerifySessionId(session.id);
          flowStartRef.current = Date.now();
          stepStartRef.current = Date.now();
          setPhase('verify_sig');
        }
      })
      .catch(err => { setError(err.message); setPhase('error'); });
  }, [sessionId]);

  const handleSubmit = async () => {
    const pad = padRef.current;
    // Get canvas from ref or from pad's internal canvas
    const canvas = canvasRef.current || (pad as any)?.canvas;
    if (!pad || !canvas || pad.isEmpty()) return;
    const sigData = collectStrokes(pad, canvas);

    try {
      if (phase === 'enroll_sig') {
        const result = await demoEnroll(username, sigData, enrollSessionId);
        if (!result.success) { setError(result.message); setPhase('error'); return; }
        pad.clear();
        setShapeIndex(0);
        setPhase('enroll_shape');

      } else if (phase === 'enroll_shape') {
        const shapeType = shapeOrder[shapeIndex];
        const result = await demoEnrollShape(username, shapeType, sigData);
        if (!result.success) { setError(result.message); setPhase('error'); return; }
        pad.clear();
        if (shapeIndex + 1 < shapeOrder.length) {
          setShapeIndex(shapeIndex + 1);
        } else {
          // All shapes done — mark session completed
          await fetch(`/api/session/${enrollSessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed', result: { enrolled: true } }),
          });
          setPhase('enroll_done');
        }

      } else if (phase === 'verify_sig') {
        verifySigRef.current = sigData;
        stepDurationsRef.current.push({ step: 'signature', durationMs: Date.now() - stepStartRef.current });
        pad.clear();
        setShapeIndex(0);
        stepStartRef.current = Date.now();
        setPhase('verify_shape');

      } else if (phase === 'verify_shape') {
        const shapeType = shapeOrder[shapeIndex];
        verifyShapesRef.current.push({ shapeType, signatureData: sigData });
        stepDurationsRef.current.push({ step: shapeType, durationMs: Date.now() - stepStartRef.current });
        pad.clear();
        stepStartRef.current = Date.now();
        if (shapeIndex + 1 < shapeOrder.length) {
          setShapeIndex(shapeIndex + 1);
        } else {
          // All steps done — submit verification
          setPhase('verifying');
          const durationMs = Date.now() - flowStartRef.current;
          const result = await demoVerify({
            username,
            signatureData: verifySigRef.current!,
            shapes: verifyShapesRef.current,
            challengeId: verifySessionId,
            durationMs,
            stepDurations: stepDurationsRef.current,
          });
          setVerifyResult(result);
          setPhase('result');
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const handleStartVerify = async () => {
    try {
      const session = await createDemoVerifySession(username, enrollSessionId);
      setVerifySessionId(session.sessionId);
      setShapeOrder(session.shapeOrder);
      setShapeIndex(0);
      verifySigRef.current = null;
      verifyShapesRef.current = [];
      stepDurationsRef.current = [];
      flowStartRef.current = Date.now();
      stepStartRef.current = Date.now();
      setPhase('verify_sig');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  const containerStyle = {
    maxWidth: 500,
    margin: '0 auto',
    padding: 20,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
  };

  const headerStyle = {
    textAlign: 'center' as const,
    marginBottom: 16,
  };

  const btnStyle = {
    width: '100%',
    padding: '14px 0',
    fontSize: 16,
    fontWeight: 600 as const,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    marginTop: 12,
  };

  if (phase === 'loading') {
    return <div style={containerStyle}><p style={{ textAlign: 'center', color: '#999' }}>Loading demo...</p></div>;
  }

  if (phase === 'error') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10060;</div>
          <h2 style={{ color: '#1a1a2e', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#999' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (phase === 'enroll_done') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9989;</div>
          <h2 style={{ color: '#1a1a2e', marginBottom: 8 }}>Enrolled!</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            Your biometric profile has been created. Now let's see if we can verify your identity.
          </p>
          <button
            onClick={handleStartVerify}
            style={{ ...btnStyle, background: '#6366f1', color: '#fff' }}
          >
            Now Verify!
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'verifying') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>&#8987;</div>
          <h2 style={{ color: '#1a1a2e' }}>Verifying...</h2>
          <p style={{ color: '#999' }}>Comparing your drawings against your enrolled profile.</p>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const passed = verifyResult?.authenticated;
    const breakdown = verifyResult?.scoreBreakdown;
    const shapeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    const rowStyle = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 14px',
      fontSize: 15,
    };
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{passed ? '\u2705' : '\u274C'}</div>
          <h2 style={{ color: passed ? '#16a34a' : '#dc2626', marginBottom: 8 }}>
            {passed ? 'Verified!' : 'Verification Failed'}
          </h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            {verifyResult?.message}
          </p>
          {breakdown && (
            <div style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              margin: '0 0 20px',
              overflow: 'hidden',
              textAlign: 'left',
            }}>
              <div style={{ ...rowStyle, borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#1a1a2e', fontWeight: 500 }}>Signature</span>
                <span style={{ color: '#1a1a2e', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {breakdown.signature}%
                </span>
              </div>
              {breakdown.shapes.map((s, i) => (
                <div
                  key={s.type}
                  style={{
                    ...rowStyle,
                    borderBottom: i < breakdown.shapes.length - 1 ? '1px solid #e5e7eb' : 'none',
                  }}
                >
                  <span style={{ color: '#1a1a2e', fontWeight: 500 }}>{shapeLabel(s.type)}</span>
                  <span style={{ color: '#1a1a2e', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {s.score}%
                  </span>
                </div>
              ))}
            </div>
          )}
          <p style={{ color: '#999', fontSize: 13 }}>
            {passed
              ? 'Your drawing patterns matched your enrolled biometric profile.'
              : 'Try signing more naturally, like you did during enrollment.'}
          </p>
          <button
            onClick={() => window.close()}
            style={{ ...btnStyle, background: '#1a1a2e', color: '#fff', marginTop: 32 }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Drawing phases
  const isEnroll = phase === 'enroll_sig' || phase === 'enroll_shape';
  const isSig = phase === 'enroll_sig' || phase === 'verify_sig';

  let stepLabel = '';
  let stepNum = 0;
  const totalSteps = 1 + shapeOrder.length; // 1 signature + N shapes

  if (phase === 'enroll_sig') { stepLabel = 'Sign your name'; stepNum = 1; }
  else if (phase === 'enroll_shape') { stepLabel = SHAPE_LABELS[shapeOrder[shapeIndex]] || shapeOrder[shapeIndex]; stepNum = 2 + shapeIndex; }
  else if (phase === 'verify_sig') { stepLabel = 'Sign your name again'; stepNum = 1; }
  else if (phase === 'verify_shape') { stepLabel = SHAPE_LABELS[shapeOrder[shapeIndex]] || shapeOrder[shapeIndex]; stepNum = 2 + shapeIndex; }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          {isEnroll ? 'Demo Enrollment' : 'Demo Verification'} &mdash; Step {stepNum} of {totalSteps}
        </div>
        <h2 style={{ fontSize: 20, color: '#1a1a2e', margin: '0 0 4px' }}>{stepLabel}</h2>
        {/* Progress bar */}
        <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, marginTop: 8 }}>
          <div style={{
            height: '100%',
            background: '#6366f1',
            borderRadius: 2,
            width: `${(stepNum / totalSteps) * 100}%`,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {isSig ? (
        <SignatureCanvas
          padRef={padRef}
          onPadReady={(pad, canvas) => { canvasRef.current = canvas; }}
          height={Math.min(350, Math.max(200, window.innerHeight * 0.45))}
        />
      ) : (
        <ShapeCanvas
          shapeType={shapeOrder[shapeIndex] as ChallengeItemType}
          padRef={padRef}
          height={Math.min(350, Math.max(200, window.innerHeight * 0.45))}
        />
      )}

      <button
        onClick={handleSubmit}
        style={{ ...btnStyle, background: '#6366f1', color: '#fff' }}
      >
        {stepNum < totalSteps ? 'Next' : isEnroll ? 'Complete Enrollment' : 'Verify'}
      </button>
    </div>
  );
}
