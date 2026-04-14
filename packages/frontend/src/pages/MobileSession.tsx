import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import type SignaturePad from 'signature_pad';
import { THRESHOLDS } from '@chicken-scratch/shared';
import type { ChallengeItemType, RawSignatureData, ShapeData } from '@chicken-scratch/shared';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ShapeCanvas } from '../components/ShapeCanvas';
import { useDeviceCapabilities } from '../hooks/useDeviceCapabilities';
import { buildSignatureData } from '../lib/stroke-collector';
import * as api from '../api/client';

type MobileStep = 'loading' | 'signature' | 'shape' | 'submitting' | 'done' | 'error';

const BUTTON_STYLE: React.CSSProperties = {
  marginTop: 12,
  padding: '16px 24px',
  fontSize: 18,
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  width: '100%',
  minHeight: 56,
  WebkitAppearance: 'none',
  appearance: 'none',
};

export function MobileSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [step, setStep] = useState<MobileStep>('loading');
  const [sessionType, setSessionType] = useState<'enroll' | 'verify'>('verify');
  const [username, setUsername] = useState('');
  const [sigSample, setSigSample] = useState(1);
  const [shapeOrder, setShapeOrder] = useState<string[]>([]);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [signatureData, setSignatureData] = useState<RawSignatureData | null>(null);
  const [shapeDataList, setShapeDataList] = useState<ShapeData[]>([]);
  const [message, setMessage] = useState('');
  const [verifyPassed, setVerifyPassed] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(250);
  const padRef = useRef<SignaturePad | null>(null);
  const deviceCaps = useDeviceCapabilities();

  // Timing tracking
  const flowStartRef = useRef<number>(0);
  const stepStartRef = useRef<number>(0);
  const stepDurationsRef = useRef<{ step: string; durationMs: number }[]>([]);

  const startStepTimer = () => {
    const now = Date.now();
    if (flowStartRef.current === 0) flowStartRef.current = now;
    stepStartRef.current = now;
  };

  const recordStepDuration = (stepName: string) => {
    if (stepStartRef.current > 0) {
      stepDurationsRef.current.push({
        step: stepName,
        durationMs: Date.now() - stepStartRef.current,
      });
    }
  };

  const getTotalDuration = () => flowStartRef.current > 0 ? Date.now() - flowStartRef.current : 0;

  // Adjust canvas height based on viewport
  useEffect(() => {
    const updateHeight = () => {
      const vh = window.innerHeight;
      // Use ~50% of viewport height for canvas, min 200, max 400
      setCanvasHeight(Math.min(400, Math.max(200, Math.floor(vh * 0.5))));
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', () => setTimeout(updateHeight, 200));
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, []);

  // Load session info and mark in_progress
  useEffect(() => {
    if (!sessionId) return;
    api.getSession(sessionId).then(async (session) => {
      setUsername(session.username);
      setSessionType(session.type as 'enroll' | 'verify');
      setShapeOrder(session.shapeOrder || ['circle', 'square', 'triangle', 'house', 'smiley']);
      setStep('signature');
      startStepTimer();
      setMessage(session.type === 'enroll'
        ? `Draw your signature (1 of ${THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED})`
        : 'Draw your signature');
      // Mark session as in progress
      await api.updateSession(sessionId, 'in_progress');
    }).catch(() => {
      setStep('error');
      setError('Session not found or expired.');
    });
  }, [sessionId]);

  const submitEnrollSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw first');
      return;
    }

    const canvas = (padRef.current as any).canvas;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    setLoading(true);
    setError('');

    try {
      const result = await api.enroll({ username, signatureData: data });
      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      const sigTotal = THRESHOLDS.ENROLLMENT_SAMPLES_REQUIRED;
      recordStepDuration(`signature-${sigSample}`);
      if (sigSample < sigTotal) {
        setSigSample(sigSample + 1);
        setMessage(`Draw your signature (${sigSample + 1} of ${sigTotal})`);
        padRef.current?.clear();
        startStepTimer();
      } else {
        setShapeIndex(0);
        setStep('shape');
        setMessage(`Draw a ${shapeOrder[0]}`);
        startStepTimer();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const submitEnrollShape = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw the shape');
      return;
    }

    const canvas = (padRef.current as any).canvas;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    const shapeType = shapeOrder[shapeIndex] as ChallengeItemType;

    setLoading(true);
    setError('');

    try {
      const result = await api.enrollShape({ username, shapeType, signatureData: data });
      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      recordStepDuration(shapeType);
      if (shapeIndex < shapeOrder.length - 1) {
        setShapeIndex(shapeIndex + 1);
        setMessage(`Draw a ${shapeOrder[shapeIndex + 1]}`);
        padRef.current?.clear();
        startStepTimer();
      } else {
        setStep('submitting');
        const durationMs = getTotalDuration();
        // Mark session as completed so desktop poller picks it up
        await api.updateSession(sessionId!, 'completed', {
          enrolled: true,
          durationMs,
          stepDurations: stepDurationsRef.current,
        });
        setStep('done');
        setMessage(`Enrollment complete! (${(durationMs / 1000).toFixed(1)}s)`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const submitVerifySignature = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw your signature');
      return;
    }

    const canvas = (padRef.current as any).canvas;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    recordStepDuration('signature');
    setSignatureData(data);
    setShapeIndex(0);
    setShapeDataList([]);
    setStep('shape');
    setMessage(`Draw a ${shapeOrder[0]}`);
    setError('');
    startStepTimer();
  };

  const submitVerifyShape = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please draw the shape');
      return;
    }

    const canvas = (padRef.current as any).canvas;
    const data = buildSignatureData(padRef.current, canvas, deviceCaps);
    const shapeType = shapeOrder[shapeIndex] as ChallengeItemType;
    const newShapeData: ShapeData = { shapeType, signatureData: data };
    const updatedShapes = [...shapeDataList, newShapeData];

    recordStepDuration(shapeType);
    if (shapeIndex < shapeOrder.length - 1) {
      setShapeDataList(updatedShapes);
      setShapeIndex(shapeIndex + 1);
      setMessage(`Draw a ${shapeOrder[shapeIndex + 1]}`);
      setError('');
      padRef.current?.clear();
      startStepTimer();
      return;
    }

    // Submit full verification
    setStep('submitting');
    setLoading(true);
    setError('');

    try {
      const durationMs = getTotalDuration();
      const verifyResult = await api.verifyFull({
        username,
        signatureData: signatureData!,
        shapes: updatedShapes,
        challengeId: sessionId!,
        durationMs,
        stepDurations: stepDurationsRef.current,
      });

      // Only pass authenticated status to session — no scores
      await api.updateSession(sessionId!, 'completed', {
        authenticated: verifyResult.authenticated,
        durationMs,
        stepDurations: stepDurationsRef.current,
      });

      setVerifyPassed(verifyResult.authenticated);
      setStep('done');
      setMessage(verifyResult.authenticated
        ? `Identity verified! (${(durationMs / 1000).toFixed(1)}s)`
        : 'Verification failed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStep('shape');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (sessionType === 'enroll') {
      if (step === 'signature') submitEnrollSignature();
      else if (step === 'shape') submitEnrollShape();
    } else {
      if (step === 'signature') submitVerifySignature();
      else if (step === 'shape') submitVerifyShape();
    }
  };

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: 16,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      <h2 style={{ fontSize: 20, margin: '8px 0' }}>
        chickenScratch — {sessionType === 'enroll' ? 'Enroll' : 'Verify'}
      </h2>
      <p style={{ fontSize: 13, color: '#999', margin: '0 0 4px' }}>
        User: {username}
      </p>

      {step === 'loading' && <p>Loading session...</p>}

      {step === 'error' && (
        <div style={{ padding: 20, background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 8 }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {(step === 'signature' || step === 'shape') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ color: '#333', marginBottom: 8, fontSize: 15 }}>{message}</p>

          {step === 'signature' && <SignatureCanvas padRef={padRef} height={canvasHeight} />}
          {step === 'shape' && (
            <ShapeCanvas
              key={shapeOrder[shapeIndex]}
              shapeType={shapeOrder[shapeIndex] as ChallengeItemType}
              padRef={padRef}
              height={canvasHeight}
            />
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            type="button"
            style={{
              ...BUTTON_STYLE,
              background: loading ? '#999' : '#1a1a2e',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}

      {step === 'submitting' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 18, color: '#333' }}>Processing...</p>
        </div>
      )}

      {step === 'done' && (
        <div style={{
          padding: 20,
          background: verifyPassed ? '#f0fdf4' : '#fef2f2',
          border: `2px solid ${verifyPassed ? '#22c55e' : '#ef4444'}`,
          borderRadius: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, color: verifyPassed ? '#22c55e' : '#ef4444', marginBottom: 8 }}>
            {verifyPassed ? 'Done!' : 'Failed'}
          </div>
          <p>{message}</p>
          <p style={{ fontSize: 13, color: '#999', marginTop: 12 }}>
            You can close this page now.
          </p>
        </div>
      )}

      {error && step !== 'error' && (
        <p style={{ color: '#ef4444', marginTop: 8, fontSize: 13 }}>{error}</p>
      )}
    </div>
  );
}
