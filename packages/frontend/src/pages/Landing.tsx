import { useState, useEffect, useRef } from 'react';
import { createDemoSession, getSession } from '../api/client';

function NavBar() {
  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 40px',
      maxWidth: 1200,
      margin: '0 auto',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', letterSpacing: -0.5 }}>
        chickenScratch
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <a href="#demo" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>Try It</a>
        <a href="#how-it-works" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>How It Works</a>
        <a href="#use-cases" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>Use Cases</a>
        <a href="#get-started" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>Pilot</a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section style={{
      textAlign: 'center',
      padding: '80px 40px 60px',
      maxWidth: 800,
      margin: '0 auto',
    }}>
      <div style={{
        display: 'inline-block',
        padding: '4px 14px',
        background: '#f0f0f5',
        borderRadius: 20,
        fontSize: 13,
        color: '#666',
        marginBottom: 24,
      }}>
        Behavioral biometric authentication
      </div>
      <h1 style={{
        fontSize: 52,
        fontWeight: 800,
        color: '#1a1a2e',
        lineHeight: 1.1,
        marginBottom: 20,
        letterSpacing: -1,
      }}>
        Know it&rsquo;s really them &mdash;<br />
        <span style={{ color: '#6366f1' }}>by how they draw.</span>
      </h1>
      <p style={{
        fontSize: 18,
        color: '#666',
        lineHeight: 1.6,
        maxWidth: 560,
        margin: '0 auto 36px',
      }}>
        Your users sign their name and draw a couple of shapes. chickenScratch verifies
        them from the unique way they do it &mdash; speed, pressure, timing, stroke order.
        No passwords to forget. No SMS codes to phish. Just draw.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <a href="#demo" style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 600,
          background: '#1a1a2e',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 8,
        }}>Try the Demo</a>
        <a href="#get-started" style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 600,
          background: '#fff',
          color: '#1a1a2e',
          textDecoration: 'none',
          borderRadius: 8,
          border: '2px solid #e5e7eb',
        }}>Start a Pilot</a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: '1',
      title: 'Embed the SDK',
      desc: 'Add one script tag to your app. Our widget handles the full enrollment and verification UI.',
    },
    {
      num: '2',
      title: 'Users enroll',
      desc: 'Users sign their name and draw shapes 3 times. We build a biometric baseline from their unique drawing style.',
    },
    {
      num: '3',
      title: 'Verify on return',
      desc: 'When users come back, they sign again. We compare against their baseline and return pass/fail in under a second.',
    },
  ];

  return (
    <section id="how-it-works" style={{
      padding: '80px 40px',
      maxWidth: 1000,
      margin: '0 auto',
    }}>
      <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>
        How It Works
      </h2>
      <p style={{ textAlign: 'center', color: '#999', fontSize: 16, marginBottom: 48 }}>
        Three steps to biometric authentication
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
        {steps.map(step => (
          <div key={step.num} style={{
            padding: 28,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#f0f0f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              color: '#6366f1',
              marginBottom: 16,
            }}>{step.num}</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>{step.title}</h3>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      title: 'Financial Services',
      desc: 'Add biometric verification to loan signings, account access, and high-value transactions.',
      color: '#22c55e',
    },
    {
      title: 'Healthcare',
      desc: 'Verify patient identity for prescription approvals, telehealth sessions, and record access.',
      color: '#3b82f6',
    },
    {
      title: 'Legal & Compliance',
      desc: 'Authenticate signers on contracts, affidavits, and regulatory filings with behavioral proof.',
      color: '#8b5cf6',
    },
    {
      title: 'Enterprise Access',
      desc: 'Replace or supplement passwords with biometric drawing for sensitive system access.',
      color: '#f59e0b',
    },
  ];

  return (
    <section id="use-cases" style={{
      padding: '80px 40px',
      background: '#f9fafb',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>
          Built For
        </h2>
        <p style={{ textAlign: 'center', color: '#999', fontSize: 16, marginBottom: 48 }}>
          Any application where identity matters
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {cases.map(c => (
            <div key={c.title} style={{
              padding: 24,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              display: 'flex',
              gap: 16,
              alignItems: 'start',
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: c.color,
                marginTop: 8,
                flexShrink: 0,
              }} />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', marginBottom: 4, marginTop: 0 }}>{c.title}</h3>
                <p style={{ fontSize: 14, color: '#666', lineHeight: 1.5, margin: 0 }}>{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { title: 'No passwords', desc: 'Biometric authentication based on drawing behavior, not memorized secrets.' },
    { title: 'Replay-proof', desc: 'Randomized challenge order and timestamp validation prevent recorded replays.' },
    { title: 'Sub-second verification', desc: 'Feature extraction and scoring happens in real-time on the server.' },
    { title: 'BIPA/GDPR compliant', desc: 'Built-in consent collection, data retention policies, and right-to-erasure.' },
    { title: 'Device fingerprinting', desc: 'Detects when verification happens on a different device than enrollment.' },
    { title: 'Drop-in SDK', desc: 'One script tag. Handles enrollment, verification, consent, and progress UI.' },
  ];

  return (
    <section style={{
      padding: '80px 40px',
      maxWidth: 1000,
      margin: '0 auto',
    }}>
      <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 700, color: '#1a1a2e', marginBottom: 48 }}>
        Why chickenScratch
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {features.map(f => (
          <div key={f.title} style={{ padding: '4px 0' }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 6 }}>{f.title}</h4>
            <p style={{ fontSize: 13, color: '#999', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveDemo() {
  const [state, setState] = useState<'idle' | 'loading' | 'qr' | 'polling' | 'done' | 'error'>('idle');
  const [demoUrl, setDemoUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(() => 'ontouchstart' in window || window.innerWidth < 768);
  const pollRef = useRef<number | null>(null);
  const [sessionResult, setSessionResult] = useState<any>(null);

  const startDemo = async () => {
    setState('loading');
    try {
      const result = await createDemoSession();
      setDemoUrl(result.url);
      setSessionId(result.sessionId);

      if (isMobile) {
        // On mobile, navigate directly
        window.location.href = result.url;
      } else {
        setState('qr');
        // Start polling for session completion
        startPolling(result.sessionId);
      }
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  const startPolling = (sid: string) => {
    const poll = () => {
      getSession(sid)
        .then(session => {
          if (!session) { setState('error'); setError('Session not found.'); return; }
          if (session.status === 'completed') {
            const result = session.result as Record<string, unknown> | null;
            setSessionResult(result);
            // Now poll for verify session completion
            // The mobile page handles creating the verify session
            // Keep polling to detect the final result
            if (result && 'authenticated' in result) {
              setState('done');
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } else if (session.status === 'expired') {
            setState('error');
            setError('Session expired. Try again.');
            if (pollRef.current) clearInterval(pollRef.current);
          }
        })
        .catch(() => {});
    };
    pollRef.current = window.setInterval(poll, 2000);
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile('ontouchstart' in window || window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setState('idle');
    setDemoUrl('');
    setSessionId('');
    setError('');
    setSessionResult(null);
  };

  return (
    <section id="demo" style={{
      padding: '80px 40px',
      background: '#f9fafb',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>
          Try It Yourself
        </h2>
        <p style={{ color: '#999', fontSize: 16, marginBottom: 32 }}>
          Experience enrollment and verification in under 60 seconds.
        </p>

        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 32,
          minHeight: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {state === 'idle' && (
            <>
              <p style={{ color: '#666', fontSize: 15, marginBottom: 8 }}>
                {isMobile
                  ? 'Sign your name, draw a circle, and draw a house to create your biometric profile. Then verify.'
                  : 'Scan the QR code with your phone to start the demo.'}
              </p>
              <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
                3 quick steps: signature, circle, house &mdash; then verify.
              </p>
              <button onClick={startDemo} style={{
                padding: '14px 36px', fontSize: 16, fontWeight: 600,
                background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
                Try the Demo
              </button>
            </>
          )}

          {state === 'loading' && (
            <p style={{ color: '#999' }}>Setting up your demo...</p>
          )}

          {state === 'qr' && (
            <>
              <p style={{ color: '#666', fontSize: 15, marginBottom: 16 }}>
                Scan this QR code with your phone:
              </p>
              <div style={{
                padding: 16,
                background: '#fff',
                border: '2px solid #e5e7eb',
                borderRadius: 12,
                marginBottom: 16,
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(demoUrl)}`}
                  alt="QR Code"
                  style={{ width: 200, height: 200, display: 'block' }}
                />
              </div>
              <p style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                Or open this link on your phone:
              </p>
              <code style={{
                fontSize: 11, background: '#f3f4f6', padding: '4px 8px', borderRadius: 4,
                wordBreak: 'break-all', display: 'block', maxWidth: 400,
              }}>
                {demoUrl}
              </code>
              <div style={{
                marginTop: 20, padding: 12, background: '#f0f0f5', borderRadius: 8,
                color: '#666', fontSize: 13,
              }}>
                &#8987; Waiting for you to complete the demo on your phone...
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '20px auto 12px',
                color: '#ccc',
                fontSize: 12,
                maxWidth: 260,
              }}>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <span>or</span>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              </div>
              <a
                href={demoUrl}
                style={{
                  padding: '10px 24px', fontSize: 14, fontWeight: 500,
                  background: '#fff', color: '#1a1a2e',
                  border: '1px solid #d4d4d8', borderRadius: 6,
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                Continue in this browser
              </a>
              <p style={{ color: '#bbb', fontSize: 11, marginTop: 8, marginBottom: 0 }}>
                You can draw with a mouse or trackpad.
              </p>

              <button onClick={reset} style={{
                marginTop: 16, padding: '6px 16px', fontSize: 12,
                background: '#fff', color: '#999', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer',
              }}>Cancel</button>
            </>
          )}

          {state === 'done' && (() => {
            const breakdown = sessionResult?.scoreBreakdown as
              | { signature: number; shapes: { type: string; score: number }[] }
              | undefined;
            const shapeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
            const rowStyle = {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              fontSize: 14,
            };
            return (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                  {sessionResult?.authenticated ? '\u2705' : '\u274C'}
                </div>
                <h3 style={{
                  color: sessionResult?.authenticated ? '#16a34a' : '#dc2626',
                  fontSize: 24, fontWeight: 700, marginBottom: 8,
                }}>
                  {sessionResult?.authenticated ? 'Verified!' : 'Verification Failed'}
                </h3>
                <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
                  {sessionResult?.authenticated
                    ? 'Your drawing patterns matched your biometric profile.'
                    : 'The drawing patterns didn\'t match closely enough. Try again!'}
                </p>
                {breakdown && (
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    margin: '0 auto 20px',
                    width: 280,
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
                <button onClick={reset} style={{
                  padding: '10px 24px', fontSize: 14, fontWeight: 600,
                  background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>Try Again</button>
              </>
            );
          })()}

          {state === 'error' && (
            <>
              <p style={{ color: '#dc2626', marginBottom: 16 }}>{error}</p>
              <button onClick={reset} style={{
                padding: '10px 24px', fontSize: 14,
                background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
              }}>Try Again</button>
            </>
          )}
        </div>

        <p style={{ color: '#bbb', fontSize: 12, marginTop: 12 }}>
          Demo data is automatically deleted after 10 minutes.
        </p>
      </div>
    </section>
  );
}

function GetStarted() {
  return (
    <section id="get-started" style={{
      padding: '80px 40px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>
          Start a Pilot
        </h2>
        <p style={{ color: '#666', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
          We work with a small number of design partners to refine chickenScratch for production use.
          If your application needs secure, passwordless authentication, let's talk.
        </p>
        <div style={{
          padding: 32,
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 600, marginBottom: 16 }}>
            What you get:
          </div>
          <div style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto 24px', fontSize: 14, color: '#666', lineHeight: 2 }}>
            <div>&#10003; Dedicated tenant with API keys</div>
            <div>&#10003; Drop-in JavaScript SDK</div>
            <div>&#10003; Full API access (enrollment, verification, consent)</div>
            <div>&#10003; Admin dashboard for monitoring</div>
            <div>&#10003; Direct engineering support</div>
          </div>
          <a
            href="mailto:bstew510@gmail.com?subject=chickenScratch%20Pilot%20Interest"
            style={{
              display: 'inline-block',
              padding: '14px 36px',
              fontSize: 16,
              fontWeight: 600,
              background: '#1a1a2e',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: 8,
            }}
          >Get in Touch</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      padding: '32px 40px',
      borderTop: '1px solid #e5e7eb',
      textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
        <a href="/docs" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>API Docs</a>
        <a href="/privacy" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Privacy Policy</a>
      </div>
      <div style={{ color: '#ccc', fontSize: 12 }}>
        chickenScratch &mdash; Behavioral biometric authentication
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div style={{ background: '#fff' }}>
      <NavBar />
      <Hero />
      <LiveDemo />
      <HowItWorks />
      <Features />
      <UseCases />
      <GetStarted />
      <Footer />
    </div>
  );
}
