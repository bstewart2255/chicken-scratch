import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import QRCodeLib from 'qrcode';
import { ChickenScratch } from '@chicken-scratch/sdk';
import { recoveryLookup, recoveryComplete, getSdkToken, saveSession } from '../api';
import type { LookupMatch } from '../api';

type Phase =
  | 'lookup'
  | 'pick'
  | 'verifying'
  | 'verifying-mobile'
  | 'wrong-device'
  | 'set-password'
  | 'failed';

const CHICKEN_SCRATCH_BASE_URL =
  import.meta.env.VITE_CHICKEN_SCRATCH_BASE_URL
  ?? 'https://chickenscratch.io';

export function Forgot() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('lookup');
  const [fragment, setFragment] = useState('');
  const [matches, setMatches] = useState<LookupMatch[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [attestationToken, setAttestationToken] = useState('');
  const [enrolledClasses, setEnrolledClasses] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mobileCancelRef = useRef<AbortController | null>(null);

  const doLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { matches: found } = await recoveryLookup(fragment);
      if (found.length === 0) {
        setError('No account found matching that. Try a different fragment of your email.');
        return;
      }
      setMatches(found);
      setPhase('pick');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const pickAccount = async (userId: string) => {
    setSelectedUserId(userId);
    setError('');

    try {
      const { token } = await getSdkToken(userId, 'verify');
      const cs = new ChickenScratch({
        apiKey: token,
        baseUrl: CHICKEN_SCRATCH_BASE_URL,
        // Container is required by the constructor but we only attach the
        // widget later when we actually enter the verifying phase.
        container: document.createElement('div'),
      });

      // Pre-flight: which device classes has this user enrolled on? If the
      // current device's class isn't in the list, skip straight to the
      // wrong-device screen instead of making them draw 6 items before the
      // server tells them the same thing. Failing gracefully if the status
      // call errors — worst case, the user draws and we catch the mismatch
      // server-side as before.
      try {
        const info = await cs.getEnrollmentInfo(userId);
        const myClass = cs.detectMyDeviceClass();
        if (info.enrolledClasses && info.enrolledClasses.length > 0
            && !info.enrolledClasses.includes(myClass)) {
          setEnrolledClasses(info.enrolledClasses);
          setError(
            `This device looks like ${myClass}, but you enrolled on `
            + `${info.enrolledClasses.join(', ')}. Switch to the device you enrolled on.`,
          );
          setPhase('wrong-device');
          return;
        }
      } catch {
        // Pre-flight is advisory. Fall through to the real verify flow —
        // the server-side device-class check still runs and will catch
        // the mismatch if something odd is happening.
      }

      setPhase('verifying');

      // Yield to the event loop so React commits the phase change and
      // mounts widgetRef's div before we try to read it. setState → commit
      // runs during React's scheduler tick; a setTimeout(0) is enough.
      await new Promise<void>(r => setTimeout(r, 0));

      // Re-instantiate with the real widget container now that we're drawing.
      if (!widgetRef.current) throw new Error('Widget container not mounted.');
      const verifyCs = new ChickenScratch({
        apiKey: token,
        baseUrl: CHICKEN_SCRATCH_BASE_URL,
        container: widgetRef.current,
        onComplete: (result) => {
          if (result.authenticated && result.attestationToken) {
            // Successful biometric recovery. Stash the attestation token so
            // the demo-app backend can validate it server-to-server before
            // letting us change the password / establish a session.
            setAttestationToken(result.attestationToken);
            setPhase('set-password');
          } else if (result.errorCode === 'DEVICE_CLASS_MISMATCH') {
            setError(result.message);
            setEnrolledClasses(result.enrolledClasses ?? []);
            setPhase('wrong-device');
          } else {
            setError(result.message || 'Signature didn\u2019t match.');
            setPhase('failed');
          }
        },
        onError: (err) => {
          setError(err.message);
          setPhase('failed');
        },
      });

      await verifyCs.verify(userId);
    } catch (err) {
      setError((err as Error).message);
      setPhase('failed');
    }
  };

  // Render the QR into the canvas whenever qrUrl changes + canvas is mounted.
  useEffect(() => {
    if (!qrUrl || !qrCanvasRef.current) return;
    QRCodeLib.toCanvas(qrCanvasRef.current, qrUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(() => { /* non-fatal — URL is also shown as text */ });
  }, [qrUrl, phase]);

  // Clean up polling on unmount.
  useEffect(() => () => mobileCancelRef.current?.abort(), []);

  /**
   * Switch from the 'wrong-device' screen to the mobile-QR flow. Creates a
   * tenant-scoped mobile verify session, renders the QR, polls until the
   * user completes on mobile. On success the polled result includes an
   * attestation token (server-minted in session.service.completeSession)
   * which we hand to the recovery-complete endpoint just like the desktop
   * in-page verify path does.
   */
  const startMobileVerify = async () => {
    setError('');
    setPhase('verifying-mobile');

    mobileCancelRef.current?.abort();
    mobileCancelRef.current = new AbortController();
    const signal = mobileCancelRef.current.signal;

    try {
      const { token } = await getSdkToken(selectedUserId, 'verify');
      const cs = new ChickenScratch({
        apiKey: token,
        baseUrl: CHICKEN_SCRATCH_BASE_URL,
        container: document.createElement('div'), // unused for this code path
      });

      const session = await cs.createMobileVerifySession(selectedUserId);
      setQrUrl(session.url);

      const result = await session.waitForCompletion({ signal });
      if (result.authenticated && result.attestationToken) {
        setAttestationToken(result.attestationToken);
        setPhase('set-password');
      } else if (!signal.aborted) {
        setError(result.message || 'Mobile verify didn\u2019t authenticate.');
        setPhase('failed');
      }
    } catch (err) {
      if (!mobileCancelRef.current?.signal.aborted) {
        setError((err as Error).message);
        setPhase('failed');
      }
    }
  };

  const cancelMobileVerify = () => {
    mobileCancelRef.current?.abort();
    setQrUrl('');
    setPhase('wrong-device');
  };

  const completeRecovery = async () => {
    try {
      const session = await recoveryComplete(
        selectedUserId,
        attestationToken,
        newPassword || undefined,
      );
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
        padding: 36, width: '100%', maxWidth: 520,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        {phase === 'lookup' && (
          <form onSubmit={doLookup}>
            <h1 style={heading}>Locked out?</h1>
            <p style={subheading}>
              Enter any part of the email you signed up with. If you don&rsquo;t remember it,
              try a common fragment (e.g. your name).
            </p>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>Email or fragment</div>
              <input
                type="text"
                value={fragment}
                onChange={(e) => setFragment(e.target.value)}
                placeholder="jane@, jane, @example.com"
                required
                style={inputStyle}
              />
            </label>
            {error && <ErrorLine text={error} />}
            <button type="submit" style={primaryButton}>Find my account</button>
            <p style={{ ...footerText, marginTop: 16 }}>
              <Link to="/login" style={linkStyle}>Back to sign in</Link>
            </p>
          </form>
        )}

        {phase === 'pick' && (
          <div>
            <h1 style={heading}>Is this you?</h1>
            <p style={subheading}>
              Pick the account you want to recover. You&rsquo;ll prove it&rsquo;s you by
              signing your name on the next screen.
            </p>
            {matches.map(m => (
              <button
                key={m.userId}
                onClick={() => pickAccount(m.userId)}
                style={{
                  display: 'block', width: '100%', padding: '14px 16px',
                  marginBottom: 8, textAlign: 'left', cursor: 'pointer',
                  background: '#fff', border: '1px solid #d0d3d9', borderRadius: 6,
                  fontSize: 14, color: '#1a1a2e',
                }}
              >
                {m.emailMask}
              </button>
            ))}
            <button
              onClick={() => { setPhase('lookup'); setMatches([]); }}
              style={textButton}
            >
              None of these — try a different fragment
            </button>
          </div>
        )}

        {phase === 'verifying' && (
          <div>
            <h1 style={heading}>Prove it&rsquo;s you</h1>
            <p style={subheading}>
              Sign your name and draw the shapes you enrolled with. We&rsquo;ll compare
              against the biometric baseline you set up at signup.
            </p>
            {error && <ErrorLine text={error} />}
            <div ref={widgetRef} style={{ width: '100%', minHeight: 480 }} />
          </div>
        )}

        {phase === 'wrong-device' && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>&#128241;</div>
            <h1 style={heading}>Different device detected</h1>
            {/* Framing: we recognize you, you just need to switch devices to
                verify. Avoid "isn't enrolled" / "unknown" / "account not
                found" phrasing — non-technical users read those as "I'm
                locked out forever" instead of "scan the code." */}
            {enrolledClasses.includes('mobile')
              ? (
                <p style={{ ...subheading, fontSize: 14 }}>
                  We&rsquo;ve got your enrollment on file — it&rsquo;s on your phone.
                  Biometric signals don&rsquo;t transfer between a touchscreen and
                  a mouse/trackpad, so you&rsquo;ll need to verify on your phone.
                </p>
              ) : (
                <p style={{ ...subheading, fontSize: 14 }}>
                  We&rsquo;ve got your enrollment on file — on
                  <strong> {enrolledClasses.join(', ') || 'a different device'}</strong>.
                  Biometric signals don&rsquo;t transfer across device types,
                  so you&rsquo;ll need to return to that device to verify.
                </p>
              )}
            {/* If mobile is in the enrolled set, offer the QR handoff as the
                primary path. Most common scenario: user enrolled on phone,
                forgot-password on laptop — scanning a QR with their phone
                is cleaner than telling them to switch devices and start over. */}
            {enrolledClasses.includes('mobile') && (
              <button onClick={startMobileVerify} style={primaryButton}>
                Verify with your phone
              </button>
            )}
            {enrolledClasses.includes('desktop') && !enrolledClasses.includes('mobile') && (
              <p style={{ ...subheading, fontSize: 13, background: '#fffbea', padding: 12, borderRadius: 6 }}>
                Open this page on the laptop or desktop where you enrolled
                and try again.
              </p>
            )}
            <button
              onClick={() => { setPhase('lookup'); setError(''); setEnrolledClasses([]); }}
              style={{ ...textButton, marginTop: 8 }}
            >
              Start over
            </button>
          </div>
        )}

        {phase === 'verifying-mobile' && (
          <ModalOverlay onClose={cancelMobileVerify}>
            <h2 style={{ ...heading, fontSize: 18, textAlign: 'center' }}>
              Scan with your phone
            </h2>
            <p style={{ ...subheading, textAlign: 'center', fontSize: 13 }}>
              Point your phone&rsquo;s camera at the code. You&rsquo;ll sign
              and draw your shapes on the phone; this page will continue
              automatically.
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
              Waiting for you to finish on your phone&hellip;
            </div>
            {error && <ErrorLine text={error} />}
            <button onClick={cancelMobileVerify} style={textButton}>
              Cancel
            </button>
          </ModalOverlay>
        )}

        {phase === 'set-password' && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>&#9989;</div>
            <h1 style={heading}>You&rsquo;re back in</h1>
            <p style={subheading}>
              Signature verified. Want to set a new password while you&rsquo;re here?
              Or skip and just log in.
            </p>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>New password (optional)</div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep your old one"
                style={inputStyle}
              />
            </label>
            {error && <ErrorLine text={error} />}
            <button onClick={completeRecovery} style={primaryButton}>
              {newPassword ? 'Save password and continue' : 'Continue to dashboard'}
            </button>
          </div>
        )}

        {phase === 'failed' && (
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>&#10060;</div>
            <h1 style={heading}>Signature didn&rsquo;t match</h1>
            <p style={subheading}>
              {error || 'Your drawing didn\u2019t match your enrolled baseline.'}
            </p>
            <p style={{ ...subheading, fontSize: 13 }}>
              Try again and sign as close to how you did at enrollment as
              possible. Still stuck? Use the email reset link below.
            </p>
            <button onClick={() => { setPhase('lookup'); setError(''); }} style={primaryButton}>
              Try again
            </button>
            <p style={{ ...footerText, marginTop: 16 }}>
              <a href="#" style={linkStyle}>Send me an email reset link instead</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 8px', fontSize: 22, color: '#1a1a2e', fontWeight: 700 };
const subheading: React.CSSProperties = { margin: '0 0 20px', fontSize: 14, color: '#6c6f76', lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#6c6f76', marginBottom: 4, fontWeight: 500 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 15,
  border: '1px solid #d0d3d9', borderRadius: 6,
  boxSizing: 'border-box',
};
const primaryButton: React.CSSProperties = {
  width: '100%', padding: '12px 20px', background: '#1a1a2e', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer',
};
const textButton: React.CSSProperties = {
  width: '100%', padding: '10px 20px', background: 'transparent', color: '#6c6f76',
  border: 'none', fontSize: 13, cursor: 'pointer', marginTop: 8,
};
const footerText: React.CSSProperties = { textAlign: 'center', fontSize: 13, color: '#6c6f76', margin: 0 };
const linkStyle: React.CSSProperties = { color: '#4a5fc1', textDecoration: 'none' };

function ErrorLine({ text }: { text: string }) {
  return <p style={{ color: '#c03030', fontSize: 13, marginBottom: 12 }}>{text}</p>;
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
