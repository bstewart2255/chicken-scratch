import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChickenScratch } from '@chicken-scratch/sdk';
import { recoveryLookup, recoveryComplete, getSdkToken, saveSession } from '../api';
import type { LookupMatch } from '../api';

type Phase = 'lookup' | 'pick' | 'verifying' | 'wrong-device' | 'set-password' | 'failed';

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
  const widgetRef = useRef<HTMLDivElement | null>(null);

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
    setPhase('verifying');
    setError('');

    try {
      const { token } = await getSdkToken(userId, 'verify');
      if (!widgetRef.current) throw new Error('Widget container not mounted.');

      const cs = new ChickenScratch({
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

      await cs.verify(userId);
    } catch (err) {
      setError((err as Error).message);
      setPhase('failed');
    }
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
            <h1 style={heading}>Wrong device type</h1>
            <p style={subheading}>
              {error}
            </p>
            {enrolledClasses.length > 0 && (
              <p style={{ ...subheading, fontSize: 13 }}>
                You enrolled on: <strong>{enrolledClasses.join(', ')}</strong>
              </p>
            )}
            <p style={{ ...subheading, fontSize: 13, background: '#fffbea', padding: 12, borderRadius: 6 }}>
              Try the same flow from the device type you enrolled on &mdash; the
              biometric signal from a finger on a touchscreen is different
              enough from a mouse/trackpad that the scoring can&rsquo;t recognize
              you across them.
            </p>
            <button
              onClick={() => { setPhase('lookup'); setError(''); setEnrolledClasses([]); }}
              style={primaryButton}
            >
              Start over
            </button>
          </div>
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
