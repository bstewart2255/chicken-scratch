import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type SignaturePad from 'signature_pad';
import {
  SignatureCanvas,
  ShapeCanvas,
  useDeviceCapabilities,
  buildSignatureData,
} from '@chicken-scratch/capture';
import type { TiltCapture } from '@chicken-scratch/capture';
import type {
  ForgeryStudyView,
  RawSignatureData,
  ShapeData,
  ChallengeItemType,
} from '@chicken-scratch/shared';
import { ReferenceImage } from './ReferenceImage';
import * as api from './api';

type Step = 'loading' | 'drawing' | 'submitting' | 'result' | 'error';

const ITEM_NOUN: Record<string, string> = {
  signature: 'signature',
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  house: 'house',
  smiley: 'smiley face',
  heart: 'heart',
};

/** The app is served at /forge/<studyId>; read the id straight off the path. */
function studyIdFromUrl(): string | null {
  const match = window.location.pathname.match(/\/forge\/([^/?#]+)/);
  return match ? match[1] : null;
}

const BUTTON: CSSProperties = {
  marginTop: 14,
  padding: '16px 24px',
  fontSize: 18,
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  width: '100%',
  minHeight: 56,
};

const CARD: CSSProperties = {
  maxWidth: 600,
  margin: '0 auto',
  padding: 16,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export function App() {
  const [step, setStep] = useState<Step>('loading');
  const [study, setStudy] = useState<ForgeryStudyView | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [collectedSignature, setCollectedSignature] = useState<RawSignatureData | null>(null);
  const [collectedShapes, setCollectedShapes] = useState<ShapeData[]>([]);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const padRef = useRef<SignaturePad | null>(null);
  const tiltRef = useRef<TiltCapture | null>(null);
  const deviceCaps = useDeviceCapabilities();

  useEffect(() => {
    const id = studyIdFromUrl();
    if (!id) {
      setStep('error');
      setError('This link is missing its challenge id.');
      return;
    }
    api.getStudy(id)
      .then(loaded => {
        if (loaded.items.length === 0) {
          setStep('error');
          setError('This challenge has nothing to copy yet.');
          return;
        }
        setStudy(loaded);
        setStep('drawing');
      })
      .catch(() => {
        setStep('error');
        setError('This challenge link is invalid or has expired.');
      });
  }, []);

  const items = study?.items ?? [];
  const currentItem = items[itemIndex];
  const isLastItem = itemIndex >= items.length - 1;

  const handleNext = async () => {
    if (!study || !currentItem) return;
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setError('Please draw before continuing.');
      return;
    }
    setError('');

    const canvas = (pad as unknown as { canvas: HTMLCanvasElement }).canvas;
    const data = buildSignatureData(pad, canvas, deviceCaps, tiltRef.current ?? undefined);

    let signature = collectedSignature;
    let shapes = collectedShapes;
    if (currentItem.itemType === 'signature') {
      signature = data;
      setCollectedSignature(data);
    } else {
      shapes = [...collectedShapes, { shapeType: currentItem.itemType, signatureData: data }];
      setCollectedShapes(shapes);
    }

    if (!isLastItem) {
      setItemIndex(itemIndex + 1);
      return;
    }

    if (!signature) {
      setStep('error');
      setError('Your signature was not captured — please reload and try again.');
      return;
    }

    setStep('submitting');
    setBusy(true);
    try {
      const result = await api.submitAttempt(study.studyId, { signatureData: signature, shapes });
      setPassed(result.passed);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your attempt.');
      setStep('error');
    } finally {
      setBusy(false);
    }
  };

  const tryAgain = () => {
    setItemIndex(0);
    setCollectedSignature(null);
    setCollectedShapes([]);
    setAttemptNumber(n => n + 1);
    setError('');
    setStep('drawing');
  };

  if (step === 'loading') {
    return <div style={CARD}><p>Loading challenge…</p></div>;
  }

  if (step === 'error') {
    return (
      <div style={CARD}>
        <div style={{ padding: 20, background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 8 }}>
          <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (step === 'submitting') {
    return <div style={CARD}><p style={{ textAlign: 'center', padding: 40 }}>Scoring your attempt…</p></div>;
  }

  if (step === 'result') {
    return (
      <div style={CARD}>
        <div style={{
          padding: 24,
          textAlign: 'center',
          background: passed ? '#f0fdf4' : '#fef2f2',
          border: `2px solid ${passed ? '#22c55e' : '#ef4444'}`,
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: passed ? '#16a34a' : '#ef4444' }}>
            {passed ? 'Passed' : 'Not a match'}
          </div>
          <p style={{ color: '#555', marginTop: 8 }}>
            {passed
              ? 'This attempt would have been accepted.'
              : 'This attempt would have been rejected.'}
          </p>
          <p style={{ color: '#999', fontSize: 13 }}>Attempt {attemptNumber}</p>
        </div>
        <button onClick={tryAgain} type="button" style={BUTTON}>Try again</button>
      </div>
    );
  }

  // step === 'drawing'
  const noun = currentItem ? (ITEM_NOUN[currentItem.itemType] ?? currentItem.itemType) : '';
  return (
    <div style={CARD}>
      <h2 style={{ fontSize: 20, margin: '4px 0' }}>chickenScratch — Copy Challenge</h2>
      <p style={{ fontSize: 13, color: '#999', margin: '0 0 4px' }}>
        {study?.forgerLabel} · attempt {attemptNumber} · step {itemIndex + 1} of {items.length}
      </p>
      <p style={{ fontSize: 15, color: '#333', margin: '8px 0' }}>
        Copy this {noun} as closely as you can.
      </p>

      {currentItem && (
        <>
          <div style={{ marginBottom: 6, fontSize: 12, color: '#999' }}>Reference</div>
          <ReferenceImage reference={currentItem.reference} height={200} />

          <div style={{ margin: '12px 0 6px', fontSize: 12, color: '#999' }}>Your copy</div>
          {currentItem.itemType === 'signature'
            ? <SignatureCanvas key={itemIndex} padRef={padRef} tiltRef={tiltRef} height={200} />
            : <ShapeCanvas
                key={itemIndex}
                shapeType={currentItem.itemType as ChallengeItemType}
                padRef={padRef}
                tiltRef={tiltRef}
                height={200}
              />}
        </>
      )}

      {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}

      <button onClick={handleNext} disabled={busy} type="button" style={BUTTON}>
        {isLastItem ? 'Submit attempt' : 'Next'}
      </button>
    </div>
  );
}
