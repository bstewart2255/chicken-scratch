import { useEffect, useRef, useState } from 'react';
import { createDemoSession, getSession } from '../api/client';
import './Landing.css';

/**
 * Landing page — structural port of the Claude Design handoff
 * (chickenScratch.html, "Split Pad" variant). See Landing.css for tokens,
 * typography, and layout. The animated hero pad and demo section cycle
 * through signature → shape → drawing prompts; metric values in the
 * verification log shuffle each cycle to simulate live scoring.
 */

const HERO_PROMPTS = [
  {
    label: 'prompt · signature', caption: 'sign your name',
    d: 'M50,280 C90,220 110,180 150,210 C185,232 175,295 210,290 C250,286 240,200 280,210 C320,220 310,300 345,298 C385,295 375,185 420,205 C455,220 440,295 480,295 C515,295 530,225 560,235',
  },
  {
    label: 'prompt · shape (circle)', caption: 'draw a circle',
    d: 'M300,120 C370,120 420,175 420,220 C420,265 370,320 300,320 C230,320 180,265 180,220 C180,175 230,120 300,120 Z',
  },
  {
    label: 'prompt · drawing (smiley)', caption: 'draw a smiley',
    d: 'M300,100 C380,100 430,165 430,215 C430,265 380,330 300,330 C220,330 170,265 170,215 C170,165 220,100 300,100 Z M250,195 C250,208 242,216 236,216 C230,216 225,208 225,195 M375,195 C375,208 367,216 361,216 C355,216 350,208 350,195 M245,255 C260,280 280,292 300,292 C320,292 340,280 355,255',
  },
  {
    label: 'prompt · shape (triangle)', caption: 'draw a triangle',
    d: 'M300,115 L420,310 L180,310 Z',
  },
  {
    label: 'prompt · drawing (house)', caption: 'draw a house',
    d: 'M200,230 L300,140 L400,230 L400,320 L200,320 Z M280,320 L280,265 L320,265 L320,320',
  },
];

interface DemoStep {
  step: number;
  kind: 'signature' | 'shape' | 'drawing';
  title: string;
  caption: string;
  info: string;
  subHtml: string;
  status: string;
  d: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    step: 1, kind: 'signature', title: 'Welcome back.',
    caption: '\u2715 sign your name',
    info: 'step 1 of 3 · signature',
    subHtml: 'Step <b>1 / 3</b> · sign your name to recover <b>jane@acme.co</b>',
    status: 'signature · step 1 of 3',
    d: 'M40,150 C90,75 120,55 160,90 C195,115 185,170 220,165 C260,160 250,75 290,90 C330,105 315,175 355,170 C395,165 385,75 430,90 C465,105 450,170 495,170 C540,170 545,105 580,115 L620,110',
  },
  {
    step: 2, kind: 'shape', title: 'Now draw the shape.',
    caption: '\u2715 draw a circle',
    info: 'step 2 of 3 · shape',
    subHtml: 'Step <b>2 / 3</b> · draw the <b>circle</b> you enrolled',
    status: 'shape · step 2 of 3',
    d: 'M350,55 C411,55 460,98 460,150 C460,202 411,245 350,245 C289,245 240,202 240,150 C240,98 289,55 350,55 Z',
  },
  {
    step: 3, kind: 'drawing', title: 'Last one \u2014 sketch it.',
    caption: '\u2715 draw a smiley face',
    info: 'step 3 of 3 · drawing',
    subHtml: 'Step <b>3 / 3</b> · sketch the <b>smiley</b> you enrolled',
    status: 'drawing · step 3 of 3',
    d: 'M350,55 C411,55 460,98 460,150 C460,202 411,245 350,245 C289,245 240,202 240,150 C240,98 289,55 350,55 Z M312,130 C312,140 307,146 302,146 C297,146 293,140 293,130 M407,130 C407,140 402,146 397,146 C392,146 388,140 388,130 M305,175 C318,195 334,203 350,203 C366,203 382,195 395,175',
  },
];

function rand(min: number, max: number, dp = 2): string {
  return (Math.random() * (max - min) + min).toFixed(dp);
}

function mkMetrics(kind: DemoStep['kind']) {
  const strokesByKind =
    kind === 'signature' ? Math.floor(Math.random() * 3) + 6
    : kind === 'shape'   ? Math.floor(Math.random() * 2) + 1
    :                      Math.floor(Math.random() * 3) + 3;
  return {
    dtw: rand(0.90, 0.99),
    cadence: rand(0.88, 0.98),
    velocity: rand(0.89, 0.99),
    strokes: `${strokesByKind} / ${strokesByKind}`,
    angle: `${Math.random() < 0.5 ? '\u2212' : '+'}${rand(0.8, 5.4, 1)}\u00b0`,
    duration: `${rand(2.2, 5.6, 2)}s`,
  };
}

function useAnimatedPath<T extends SVGPathElement>(): [React.RefObject<T>, (d: string) => void] {
  const ref = useRef<T>(null);
  const setPath = (d: string) => {
    const path = ref.current;
    if (!path) return;
    path.setAttribute('d', d);
    const len = Math.ceil(path.getTotalLength());
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    path.style.animation = 'none';
    // force reflow so the animation restart sticks
    void path.getBoundingClientRect();
    path.style.animation = 'draw 3.2s cubic-bezier(.7,.1,.2,1) forwards';
  };
  return [ref, setPath];
}

function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="logo">chicken<i>S</i>cratch</span>
          <span className="logo-tag">biometric · recovery</span>
        </div>
        <nav className="nav-links">
          <a href="#demo">Demo</a>
          <a href="#how">How it works</a>
          <a href="#compare">vs passwords</a>
          <a href="#security">Security</a>
          <a href="#sdk">SDK</a>
          <a href="#faq">FAQ</a>
          <a href="#pilot" className="nav-cta">START PILOT &rarr;</a>
        </nav>
      </div>
    </header>
  );
}

function Hero({ onTryDemo }: { onTryDemo: () => void }) {
  const [padRef, setPadPath] = useAnimatedPath<SVGPathElement>();
  const [label, setLabel] = useState(HERO_PROMPTS[0].label);
  const [caption, setCaption] = useState(HERO_PROMPTS[0].caption);

  useEffect(() => {
    let i = 0;
    setPadPath(HERO_PROMPTS[0].d);
    setLabel(HERO_PROMPTS[0].label);
    setCaption(HERO_PROMPTS[0].caption);
    const interval = setInterval(() => {
      i = (i + 1) % HERO_PROMPTS.length;
      const p = HERO_PROMPTS[i];
      setPadPath(p.d);
      setLabel(p.label);
      setCaption(p.caption);
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="hero active">
      <div className="heroB wrap">
        <div className="heroB-grid">
          <div>
            <span className="eyebrow">biometric account recovery · sdk</span>
            <h1 className="display" style={{ marginTop: 22 }}>
              Let your users<br />
              <span className="hand" style={{ fontSize: '1.1em' }}>scribble</span><br />
              their way back in.
            </h1>
            <p className="lede" style={{ marginTop: 28 }}>
              A signature. A circle. A smiley face. chickenScratch turns a handful of finger-drawn prompts
              into a biometric any user can reproduce &mdash; no passwords, no SMS, no magic links.
              Enroll in 30 seconds, recover in 15.
            </p>
            <div className="hero-ctas">
              <button className="btn btn-primary" onClick={onTryDemo}>
                Try the demo <span className="arrow">&rarr;</span>
              </button>
              <a className="btn btn-ghost" href="#pilot">Book a pilot</a>
            </div>
            <div className="heroB-chips">
              <span className="chip">Signature + shapes + drawings</span>
              <span className="chip">iOS · Android · Web</span>
              <span className="chip">4-line integration</span>
              <span className="chip">Per-recovery pricing</span>
              <span className="chip">AI-resistant</span>
            </div>
          </div>

          <div className="heroB-pad">
            <div className="pad-head">
              <span>{label}</span>
              <span>REC <i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', marginLeft: 6 }} /></span>
            </div>
            <svg viewBox="0 0 600 460" preserveAspectRatio="none">
              <path ref={padRef} />
            </svg>
            <div className="pad-x">&#x2715;</div>
            <div className="pad-baseline" />
            <div className="pad-label">{caption}</div>
            <div className="stamp">Enrolled<br />in 28s</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Demo() {
  const [stepIdx, setStepIdx] = useState(0);
  const [pathRef, setPath] = useAnimatedPath<SVGPathElement>();
  const [metrics, setMetrics] = useState(mkMetrics('signature'));
  const [statusText, setStatusText] = useState<'Scoring\u2026' | 'Verified'>('Scoring\u2026');
  const [fadingKeys, setFadingKeys] = useState<Set<string>>(new Set());

  const step = DEMO_STEPS[stepIdx];

  // Advance a step — invoked from the "Next" button or by the auto-cycle.
  const goToStep = (i: number) => setStepIdx((i + DEMO_STEPS.length) % DEMO_STEPS.length);

  useEffect(() => {
    setPath(step.d);
    setStatusText('Scoring\u2026');

    const shuffle = () => {
      // flash keys to opacity 0.35 briefly, then replace values
      setFadingKeys(new Set(['dtw', 'cadence', 'velocity', 'strokes', 'angle', 'duration']));
      setTimeout(() => {
        setMetrics(mkMetrics(step.kind));
        setFadingKeys(new Set());
      }, 180);
    };

    const t1 = setTimeout(shuffle, 600);
    const t2 = setTimeout(shuffle, 1800);
    const t3 = setTimeout(() => {
      shuffle();
      setStatusText('Verified');
    }, 3700);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [stepIdx]);

  // Auto-advance every 5.5s — parallels the design's setInterval.
  useEffect(() => {
    const id = setInterval(() => {
      setStepIdx(i => (i + 1) % DEMO_STEPS.length);
    }, 5500);
    return () => clearInterval(id);
  }, []);

  const statusOk = statusText === 'Verified';
  const statusStyle: React.CSSProperties = statusOk ? {} : {
    background: 'color-mix(in oklch, oklch(0.72 0.12 85) 8%, var(--paper))',
    borderColor: 'color-mix(in oklch, oklch(0.72 0.12 85) 35%, var(--rule))',
    color: 'oklch(0.45 0.14 75)',
  };
  const dotStyle: React.CSSProperties = statusOk
    ? { background: 'var(--good)' }
    : { background: 'oklch(0.72 0.14 75)' };

  const metricRow = (k: keyof typeof metrics, label: string) => (
    <div className="metric" key={k}>
      <span>{label}</span>
      <b style={{ opacity: fadingKeys.has(k) ? 0.35 : 1 }}>{metrics[k]}</b>
    </div>
  );

  return (
    <section className="demo sec" id="demo">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">the demo</span>
            <h2 className="h2" style={{ marginTop: 14 }}>
              A signature. A shape.<br />
              <span className="hand" style={{ color: 'var(--accent)' }}>A little drawing.</span>
            </h2>
          </div>
          <p className="lede">
            Recovery isn&rsquo;t one prompt &mdash; it&rsquo;s a short sequence. Users sign their name, draw a shape,
            and sketch a simple picture. Every stroke is scored against the enrollment template on six dynamic signals:
            cadence, velocity, acceleration, stroke count, baseline angle, and ligatures.
          </p>
        </div>

        <div className="demo-stage">
          <div className="device">
            <div className="device-bar">
              <div className="dots"><i /><i /><i /></div>
              <span>chickenScratch · recover</span>
              <span>SDK v0.4.2</span>
            </div>
            <div className="device-screen">
              <h4>{step.title}</h4>
              <div className="sub" dangerouslySetInnerHTML={{ __html: step.subHtml }} />
              <div className="field">
                <svg viewBox="0 0 700 260" preserveAspectRatio="xMidYMin meet">
                  <path ref={pathRef} />
                </svg>
                <div className="line" />
                <div className="x">{step.caption}</div>
              </div>
              <div className="device-row">
                <span>{step.info}</span>
                <button className="btn-mini" onClick={() => goToStep(stepIdx + 1)}>
                  Next &rarr;
                </button>
              </div>
            </div>
          </div>

          <aside className="verify">
            <div>
              <span className="eyebrow" style={{ color: 'var(--ink-3)' }}>verification log</span>
              <h5 style={{ marginTop: 14 }}>Match confidence</h5>
            </div>
            <div>
              {metricRow('dtw', 'Shape ( DTW )')}
              {metricRow('cadence', 'Stroke cadence')}
              {metricRow('velocity', 'Velocity profile')}
              {metricRow('strokes', 'Stroke count')}
              {metricRow('angle', 'Baseline angle')}
              {metricRow('duration', 'Duration')}
            </div>
            <div className="status" style={statusStyle}>
              <span className="dot" style={dotStyle} />
              <b>{statusText}</b>
              <span style={{ marginLeft: 4 }}>{step.status}</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">how it works</span>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Three steps.<br />
              <span className="hand" style={{ color: 'var(--accent)' }}>One chicken scratch.</span>
            </h2>
          </div>
          <p className="lede">
            Enrollment takes about 30 seconds at signup &mdash; a signature, a shape, and a small drawing.
            Recovery takes about 15 seconds, any time after. That&rsquo;s it. No email loops, no SMS codes,
            no &ldquo;click the link we just sent you.&rdquo;
          </p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="num" />
            <h3>Enroll in ~30s</h3>
            <p>
              User signs their name, draws a shape (circle, triangle, square), and sketches a simple picture
              (smiley face, house). chickenScratch extracts a 512-float template &mdash; stored encrypted,
              hashed, never raw.
            </p>
            <div className="step-visual">
              <span className="tag">enrollment · sig + shape + drawing</span>
              <svg viewBox="0 0 300 150" preserveAspectRatio="none">
                <path className="trace" d="M20,100 C50,50 70,30 95,60 C120,90 115,130 140,125 C170,120 160,45 190,55 C220,65 210,125 235,120 C260,115 260,70 280,75" />
              </svg>
            </div>
          </div>
          <div className="step">
            <div className="num" />
            <h3>Store the template</h3>
            <p>
              Templates live in our vault, tied to the user ID. Nothing reconstructable from the hash &mdash;
              a bad actor who steals it gets 512 meaningless floats.
            </p>
            <div className="step-visual">
              <span className="tag">template · 512f · aes-gcm</span>
              <svg viewBox="0 0 300 150" preserveAspectRatio="none">
                <path className="trace" d="M20,60 L50,90 L80,50 L110,100 L140,40 L170,110 L200,50 L230,95 L260,60 L280,85" />
              </svg>
            </div>
          </div>
          <div className="step">
            <div className="num" />
            <h3>Recover in ~15s</h3>
            <p>
              User redraws a random subset of their enrolled prompts. We score each one against the template
              and return pass/fail on a signed webhook. You get the session; we bill per recovery.
            </p>
            <div className="step-visual">
              <span className="tag">verify · ∼15s end to end</span>
              <svg viewBox="0 0 300 150" preserveAspectRatio="none">
                <path className="trace" d="M20,110 C40,70 55,50 75,65 C100,80 95,115 115,110 C140,103 130,55 155,60 C180,65 175,115 195,115 C215,115 220,70 240,72 C260,74 260,95 280,95" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Compare() {
  return (
    <section
      className="sec"
      id="compare"
      style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}
    >
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">vs the alternatives</span>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Everything else<br />
              is <span className="hand" style={{ color: 'var(--accent)' }}>a liability.</span>
            </h2>
          </div>
          <p className="lede">
            Passwords get forgotten, magic links get phished, passkeys get locked to a device.
            A signature is the only recovery factor that travels with the human.
          </p>
        </div>
        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>criterion</th>
                <th>password reset</th>
                <th>magic link</th>
                <th>passkey</th>
                <th className="us">chickenScratch</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">Works when user forgets their email</td>
                <td className="n">&#10007; no</td>
                <td className="n">&#10007; no</td>
                <td className="meh">~ maybe</td>
                <td className="us y">&#10003; yes</td>
              </tr>
              <tr>
                <td className="row-label">Phishing resistant</td>
                <td className="n">&#10007;</td>
                <td className="n">&#10007;</td>
                <td className="y">&#10003;</td>
                <td className="us y">&#10003;</td>
              </tr>
              <tr>
                <td className="row-label">Resistant to AI mimicry</td>
                <td className="meh">n/a</td>
                <td className="meh">n/a</td>
                <td className="y">&#10003;</td>
                <td className="us y">&#10003; (dynamic signals)</td>
              </tr>
              <tr>
                <td className="row-label">Survives device loss</td>
                <td className="y">&#10003;</td>
                <td className="y">&#10003;</td>
                <td className="n">&#10007;</td>
                <td className="us y">&#10003;</td>
              </tr>
              <tr>
                <td className="row-label">Supportable by humans</td>
                <td className="meh">~</td>
                <td className="meh">~</td>
                <td className="n">&#10007; painful</td>
                <td className="us y">&#10003; obvious</td>
              </tr>
              <tr>
                <td className="row-label">Time to recover (p50)</td>
                <td className="meh">4m 20s</td>
                <td className="meh">58s</td>
                <td className="y">6s</td>
                <td className="us y">~15s</td>
              </tr>
              <tr>
                <td className="row-label">Integration</td>
                <td className="meh">ops-heavy</td>
                <td className="meh">email infra</td>
                <td className="meh">platform quirks</td>
                <td className="us y">4 lines of SDK</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section className="security" id="security">
      <div className="wrap">
        <span className="eyebrow">security · ai-resistance</span>
        <h2 style={{ marginTop: 16 }}>
          Shape is easy.<br />
          <span className="hand">The way you sign</span> is not.
        </h2>
        <p className="lede" style={{ color: 'oklch(0.78 0.01 85)', maxWidth: '62ch', marginTop: 22 }}>
          A forger with your signature on file can copy its shape. They can&rsquo;t copy the timing between
          your strokes, the micro-pauses where your pen lifts as you cross a &lsquo;t&rsquo; or close a circle,
          or the microsecond hesitation before your last loop. chickenScratch scores six dynamic signals across
          signatures, shapes, and drawings &mdash; signals a generative model has no way to hallucinate.
        </p>

        <div className="security-grid">
          <div className="security-points">
            <div className="spoint">
              <div className="k">01 · cadence</div>
              <div className="v">
                <b>Copied shapes fail here first.</b> A traced signature draws at a metronome-steady pace;
                a real one accelerates on down-strokes and hesitates on up-strokes in a rhythm unique to your hand.
              </div>
            </div>
            <div className="spoint">
              <div className="k">02 · velocity</div>
              <div className="v">
                <b>Humans accelerate in habits.</b> The speed between every pair of anchor points is a fingerprint.
                Generated signatures draw at a statistically flat pace.
              </div>
            </div>
            <div className="spoint">
              <div className="k">03 · pen-up gaps</div>
              <div className="v">
                <b>The pauses matter too.</b> Where you lift the pen &mdash; and for how long &mdash; is as individual
                as the strokes themselves.
              </div>
            </div>
            <div className="spoint">
              <div className="k">04 · stroke order</div>
              <div className="v">
                <b>We watch the sequence.</b> Two signatures that look identical can be drawn in different orders
                &mdash; and only one is yours.
              </div>
            </div>
            <div className="spoint">
              <div className="k">05 · on-device</div>
              <div className="v">
                <b>Raw pen data never leaves the device.</b> We hash it to a 512-float template at enrollment.
                No raw signatures stored, ever.
              </div>
            </div>
          </div>

          <div className="aipanel">
            <div className="aisub">live adversarial test · 4 attempts</div>
            <h4>Your signature vs. everyone else&rsquo;s attempt.</h4>
            <div className="attempts">
              <div className="ai-attempt">
                <span className="label">gpt trace</span>
                <div className="mini fail">
                  <svg viewBox="0 0 80 26" preserveAspectRatio="none">
                    <path d="M4,18 C14,6 22,4 30,12 C40,20 38,22 48,18 C58,14 58,10 70,12" />
                  </svg>
                </div>
                <span className="score">0.41 &#10007;</span>
              </div>
              <div className="ai-attempt">
                <span className="label">paper copy</span>
                <div className="mini fail">
                  <svg viewBox="0 0 80 26" preserveAspectRatio="none">
                    <path d="M4,20 C16,8 22,6 32,14 C42,22 40,20 50,18 C60,16 60,10 72,14" />
                  </svg>
                </div>
                <span className="score">0.58 &#10007;</span>
              </div>
              <div className="ai-attempt">
                <span className="label">skilled forger</span>
                <div className="mini fail">
                  <svg viewBox="0 0 80 26" preserveAspectRatio="none">
                    <path d="M4,18 C14,6 22,4 32,12 C42,20 38,22 50,18 C60,14 60,10 70,12" />
                  </svg>
                </div>
                <span className="score">0.71 &#10007;</span>
              </div>
              <div className="ai-attempt ok">
                <span className="label">you</span>
                <div className="mini ok">
                  <svg viewBox="0 0 80 26" preserveAspectRatio="none">
                    <path d="M4,18 C12,4 20,2 28,10 C38,18 34,22 46,18 C58,14 56,8 70,10" />
                  </svg>
                </div>
                <span className="score">0.96 &#10003;</span>
              </div>
            </div>
            <p style={{ marginTop: 22, fontSize: 11.5, color: 'oklch(0.7 0.01 260)', letterSpacing: '0.06em' }}>
              Threshold · 0.88 · false-accept 0.4% · false-reject 2.7%
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cases() {
  return (
    <section className="sec" id="cases">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">who&rsquo;s using it</span>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Where a <span className="hand" style={{ color: 'var(--accent)' }}>scribble</span><br />
              saves the day.
            </h2>
          </div>
          <p className="lede">
            Any product where a locked-out user is expensive &mdash; financial, medical, regulated,
            high-value, or just loved enough that friction is fatal.
          </p>
        </div>
        <div className="cases">
          <div className="case">
            <span className="tag">01 · banking</span>
            <div>
              <h4>Account recovery without a call center.</h4>
              <p>Replace the 4-minute KBA call with a 15-second scribble. FI-ready with audit trails.</p>
            </div>
            <div className="stat">&minus;68% tickets</div>
          </div>
          <div className="case">
            <span className="tag">02 · healthcare</span>
            <div>
              <h4>HIPAA-safe patient portals.</h4>
              <p>Patients sign &mdash; the same way they&rsquo;ve been signing forms for decades. No app required.</p>
            </div>
            <div className="stat">HIPAA ready</div>
          </div>
          <div className="case">
            <span className="tag">03 · enterprise</span>
            <div>
              <h4>Drop-in SSO fallback.</h4>
              <p>When Okta is down or a laptop is lost, employees sign to get back to work.</p>
            </div>
            <div className="stat">12s MTTR</div>
          </div>
          <div className="case">
            <span className="tag">04 · consumer</span>
            <div>
              <h4>No more &ldquo;forgot which email.&rdquo;</h4>
              <p>One signature, many accounts. Users don&rsquo;t need to remember which address they used.</p>
            </div>
            <div className="stat">+18% retention</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sdk() {
  return (
    <section className="sec" id="sdk">
      <div className="wrap sdk-grid">
        <div>
          <span className="eyebrow">drop-in sdk</span>
          <h2 className="h2" style={{ marginTop: 14 }}>
            Four lines.<br />
            <span className="hand" style={{ color: 'var(--accent)' }}>No kidding.</span>
          </h2>
          <p className="lede" style={{ marginTop: 24 }}>
            iOS, Android, Web, and a REST endpoint for everything else. Enrollment, recovery, and webhooks
            &mdash; all in one SDK. Ship a recovery flow this afternoon.
          </p>
          <div className="hero-ctas" style={{ marginTop: 28 }}>
            <a className="btn btn-primary" href="#pilot">Grab an API key <span className="arrow">&rarr;</span></a>
            <a className="btn btn-ghost" href="/docs">Read the docs</a>
          </div>
          <div style={{ marginTop: 28, display: 'flex', gap: 28, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: '0.04em' }}>
            <div><b style={{ color: 'var(--ink)', fontWeight: 500 }}>iOS</b> Swift · 13+</div>
            <div><b style={{ color: 'var(--ink)', fontWeight: 500 }}>Android</b> Kotlin · 24+</div>
            <div><b style={{ color: 'var(--ink)', fontWeight: 500 }}>Web</b> React · Vue · vanilla</div>
          </div>
        </div>
        <div className="code">
          <div className="filebar">
            <span className="active">recovery.ts</span>
            <span>enroll.ts</span>
            <span>webhook.ts</span>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre' }}>
{<span className="ln">1</span>}<span className="c">{`// install: npm i @chickenscratch/web`}</span>{'\n'}
{<span className="ln">2</span>}<span className="k">import</span>{' { '}<span className="f">ChickenScratch</span>{' } '}<span className="k">from</span>{' '}<span className="s">{`'@chickenscratch/web'`}</span>{'\n'}
{<span className="ln">3</span>}{'\n'}
{<span className="ln">4</span>}<span className="k">const</span>{' '}<span className="v">cs</span>{' '}<span className="op">=</span>{' '}<span className="k">new</span>{' '}<span className="f">ChickenScratch</span>{'({ '}<span className="v">apiKey</span><span className="op">:</span>{' '}<span className="v">process</span><span className="op">.</span><span className="v">env</span><span className="op">.</span><span className="v">CS_KEY</span>{' })'}{'\n'}
{<span className="ln">5</span>}{'\n'}
{<span className="ln">6</span>}<span className="c">{`// 1. mount the pad anywhere`}</span>{'\n'}
{<span className="ln">7</span>}<span className="v">cs</span><span className="op">.</span><span className="f">mount</span>{'('}<span className="s">{`'#signature-pad'`}</span>{')'}{'\n'}
{<span className="ln">8</span>}{'\n'}
{<span className="ln">9</span>}<span className="c">{`// 2. on submit — that's it`}</span>{'\n'}
{<span className="ln">10</span>}<span className="k">const</span>{' '}<span className="v">result</span>{' '}<span className="op">=</span>{' '}<span className="k">await</span>{' '}<span className="v">cs</span><span className="op">.</span><span className="f">recover</span>{'({ '}<span className="v">userId</span><span className="op">:</span>{' '}<span className="s">{`'u_42'`}</span>{' })'}{'\n'}
{<span className="ln">11</span>}{'\n'}
{<span className="ln">12</span>}<span className="k">if</span>{' ('}<span className="v">result</span><span className="op">.</span><span className="v">verified</span>{') '}<span className="f">signIn</span>{'('}<span className="v">result</span><span className="op">.</span><span className="v">token</span>{')'}{'\n'}
{<span className="ln">13</span>}<span className="k">else</span>{'                   '}<span className="f">fallbackFlow</span>{'()'}
          </pre>
        </div>
      </div>
    </section>
  );
}

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What exactly does chickenScratch do?',
    a: (
      <p>
        We&rsquo;re a biometric account recovery service. When your users forget their password
        or don&rsquo;t remember which email they signed up with, they sign their name (and draw
        a shape or two) to prove it&rsquo;s them &mdash; instead of clicking an email reset link
        or typing an SMS code. Drop-in SDK, priced per successful recovery.
      </p>
    ),
  },
  {
    q: 'How does recovery actually work from the user\u2019s perspective?',
    a: (
      <p>
        At signup, the user spends about 30 seconds signing their name and drawing a couple of
        shapes. We store a biometric template from <em>how</em> they drew, not what. Later,
        when they can&rsquo;t log in, your app shows them a &ldquo;sign to recover&rdquo; option.
        They draw again. We compare to their enrollment template and return pass/fail in under a
        second.
      </p>
    ),
  },
  {
    q: 'What do users have to draw?',
    a: (
      <p>
        A signature (their name), one shape (circle, square, or triangle), and one simple drawing
        (smiley face or house). The shapes and drawings add orthogonal signal &mdash; someone who
        can forge your name on paper can&rsquo;t reproduce how you draw a specific circle.
      </p>
    ),
  },
  {
    q: 'Does the same enrollment work on my phone and my laptop?',
    a: (
      <>
        <p>
          Finger-on-touchscreen and mouse-on-desktop produce genuinely different biometric signals.
          We detect the class at capture time and enforce same-class recovery by default: enroll on
          mobile, recover on mobile.
        </p>
        <p>
          If a user wants to recover from either, they can enroll on both classes. The SDK supports
          a secure &ldquo;add a device&rdquo; flow gated by a recent successful verify, so an
          attacker can&rsquo;t silently register their own device without biometric proof they&rsquo;re
          you.
        </p>
      </>
    ),
  },
  {
    q: 'Can someone who has a copy of my signature fool it?',
    a: (
      <p>
        No &mdash; at least not from a static image. We score on six dynamic signals: cadence (how
        steady your pace is), velocity profile, pen-up gaps, stroke count, baseline angle, and stroke
        order. A traced signature matches the shape but misses all six. The signals are the whole
        point &mdash; the shape is the easy part.
      </p>
    ),
  },
  {
    q: 'Can AI generate a signature that passes?',
    a: (
      <p>
        Not directly. Image-generation models produce a picture, not a timing series. To defeat
        chickenScratch, an attacker would need both a static image of your signature <em>and</em> a
        motion-captured recording of you signing, then replay it against a live device &mdash; a
        materially harder threat than &ldquo;steal your password.&rdquo; And one a defender can
        monitor for at the device and network layers.
      </p>
    ),
  },
  {
    q: 'Is the biometric data encrypted? Where does it live?',
    a: (
      <p>
        Yes. AES-256-GCM at rest, TLS 1.2+ in transit. Templates live in Postgres on Railway (US
        region). Raw stroke data is encrypted on receipt. The scoring API returns pass/fail only
        &mdash; raw scores and feature vectors are never exposed to clients, preventing calibration
        attacks.
      </p>
    ),
  },
  {
    q: 'Is this BIPA / GDPR / CCPA compliant?',
    a: (
      <p>
        Built for BIPA (Illinois), Texas CUBI, GDPR Article 9, and CCPA. Explicit informed consent
        is collected through the SDK before any biometric data touches our servers; consent is
        logged with timestamp, IP, and policy version. Users can withdraw consent at any time,
        which triggers immediate data deletion. See our{' '}
        <a href="/privacy" style={{ textDecoration: 'underline' }}>privacy policy</a> for the full
        disclosure.
      </p>
    ),
  },
  {
    q: 'How does a user delete their data?',
    a: (
      <p>
        Through your application&rsquo;s own &ldquo;delete my account&rdquo; flow &mdash; you call{' '}
        <code>DELETE /api/v1/users/:externalUserId</code> on our API. We permanently destroy all
        biometric samples, baselines, and auth attempts within 72 hours. Consent records are
        retained for 7 years as required by BIPA/GDPR, but they contain no biometric content
        &mdash; just metadata proving consent was given and later withdrawn.
      </p>
    ),
  },
  {
    q: 'What platforms does the SDK support?',
    a: (
      <p>
        Web today (vanilla JS, React, Vue, Svelte &mdash; anywhere you can mount a DOM element).
        iOS (Swift) and Android (Kotlin) are on the roadmap. In the meantime, the REST API works
        from any backend language &mdash; mobile teams can wire native canvases to our API
        directly.
      </p>
    ),
  },
  {
    q: 'What does it cost?',
    a: (
      <p>
        Free during pilots for the first 6 months, capped at 5,000 successful recoveries per
        month. After that: $0.50 per successful recovery, with volume discounts above 10,000/mo
        and 100,000/mo. No MAU fees, no seat pricing &mdash; if nobody forgets their password,
        you don&rsquo;t pay us a cent.
      </p>
    ),
  },
  {
    q: 'What happens if chickenScratch disappears?',
    a: (
      <>
        <p>
          Fair question for a solo-operated service. Three things that bound the risk:
        </p>
        <ul>
          <li>
            chickenScratch is a <em>recovery</em> factor, not primary auth. Even if we disappeared
            overnight, your users could still log in via password, passkey, or whatever you had
            before adding us.
          </li>
          <li>
            Pilot customers can request source-code escrow &mdash; code held by a neutral third
            party, released to you if we stop responding.
          </li>
          <li>
            Biometric templates are exportable on demand via API so you can migrate them to a
            replacement service if one exists, or just destroy them.
          </li>
        </ul>
      </>
    ),
  },
];

function FAQ() {
  return (
    <section className="sec faq" id="faq">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">frequently asked</span>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Questions,<br />
              <span className="hand" style={{ color: 'var(--accent)' }}>answered honestly.</span>
            </h2>
          </div>
          <p className="lede">
            The stuff your devs, your legal team, and your security team will actually want to
            know before saying yes.
          </p>
        </div>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <details className="faq-item" key={i}>
              <summary>
                <span className="faq-q">{item.q}</span>
                <span className="faq-toggle" aria-hidden="true">+</span>
              </summary>
              <div className="faq-a">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pilot() {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement | null)?.value ?? '';
    const company = (form.elements.namedItem('company') as HTMLInputElement | null)?.value ?? '';
    const volume = (form.elements.namedItem('volume') as HTMLSelectElement | null)?.value ?? '';
    const platform = (form.elements.namedItem('platform') as HTMLSelectElement | null)?.value ?? '';
    const subject = 'chickenScratch pilot interest';
    const body = [
      `Email: ${email}`,
      `Company: ${company}`,
      `Monthly recoveries: ${volume}`,
      `Platform: ${platform}`,
    ].join('\n');
    window.location.href = `mailto:hello@chickenscratch.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="pilot" id="pilot">
      <div className="wrap">
        <div className="pilot-inner">
          <div>
            <span className="eyebrow">start a pilot</span>
            <h2 style={{ marginTop: 14 }}>
              Priced by<br />
              the <span className="hand" style={{ color: 'var(--accent)' }}>recovery.</span>
            </h2>
            <p className="lede" style={{ marginTop: 20 }}>
              $0.50 per successful recovery. No MAU fees, no seat pricing, no minimums during pilot.
              If nobody forgets their password, you don&rsquo;t pay us a cent.
            </p>
            <div className="price-line">
              · pilots are free for the first 6 months · we&rsquo;re looking for design partners
            </div>
          </div>
          <form className="pilot-form" onSubmit={onSubmit}>
            <div>
              <label htmlFor="pilot-email">work email</label>
              <input id="pilot-email" name="email" type="email" placeholder="jane@acme.co" required />
            </div>
            <div className="row">
              <div>
                <label htmlFor="pilot-company">company</label>
                <input id="pilot-company" name="company" type="text" placeholder="Acme Inc." />
              </div>
              <div>
                <label htmlFor="pilot-volume">monthly recoveries</label>
                <select id="pilot-volume" name="volume" defaultValue="< 1,000">
                  <option>&lt; 1,000</option>
                  <option>1,000&ndash;10,000</option>
                  <option>10,000&ndash;100,000</option>
                  <option>100,000+</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pilot-platform">platform</label>
              <select id="pilot-platform" name="platform" defaultValue="Web">
                <option>Web</option>
                <option>iOS</option>
                <option>Android</option>
                <option>All of the above</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Request pilot access <span className="arrow">&rarr;</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <div>&copy; 2026 Orchestrate LLC · chickenScratch is a product of Orchestrate LLC</div>
        <div className="sig">&mdash; signed, the team</div>
        <div style={{ textAlign: 'right' }}>
          <a href="/docs">Docs</a> · <a href="/privacy">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

/**
 * Opens from the hero's "Try the demo" button. Creates a fresh demo
 * session, shows a QR code so desktop users can complete the flow on
 * their phone (where touch biometrics actually shine), and polls the
 * session until it's done — at which point we render the verification
 * breakdown inline. Mobile users skip the QR entirely and just navigate
 * to the demo page.
 */
function DemoModal({ onClose }: { onClose: () => void }) {
  type ModalState = 'loading' | 'qr' | 'done' | 'error';
  const [state, setState] = useState<ModalState>('loading');
  const [demoUrl, setDemoUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [sessionResult, setSessionResult] = useState<Record<string, unknown> | null>(null);
  const pollRef = useRef<number | null>(null);

  const isMobile = typeof window !== 'undefined'
    && ('ontouchstart' in window || window.innerWidth < 768);

  // Session bootstrap — runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await createDemoSession();
        if (cancelled) return;
        setDemoUrl(result.url);
        setSessionId(result.sessionId);

        if (isMobile) {
          // On mobile, no QR handoff makes sense — just navigate straight in.
          window.location.href = result.url;
          return;
        }
        setState('qr');
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isMobile]);

  // Poll session completion once we're in the QR state.
  useEffect(() => {
    if (state !== 'qr' || !sessionId) return;
    const tick = async () => {
      try {
        const session = await getSession(sessionId);
        if (!session) return;
        const result = session.result as Record<string, unknown> | null;
        if (session.status === 'completed' && result && 'authenticated' in result) {
          setSessionResult(result);
          setState('done');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (session.status === 'expired') {
          setError('Session expired — close and try again.');
          setState('error');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* transient errors are fine; keep polling */
      }
    };
    pollRef.current = window.setInterval(tick, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, sessionId]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const breakdown = sessionResult?.scoreBreakdown as
    | { signature: number; shapes: { type: string; score: number }[] }
    | undefined;
  const authenticated = sessionResult?.authenticated === true;

  return (
    <div className="demo-modal-backdrop" onClick={onClose}>
      <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
        <button className="demo-modal-close" onClick={onClose} aria-label="Close demo">&times;</button>

        {state === 'loading' && (
          <div className="demo-modal-body" style={{ textAlign: 'center' }}>
            <span className="eyebrow" style={{ justifyContent: 'center' }}>loading</span>
            <h3 className="demo-modal-title" style={{ marginTop: 14 }}>Setting up your demo&hellip;</h3>
          </div>
        )}

        {state === 'qr' && (
          <div className="demo-modal-body">
            <span className="eyebrow">try it yourself</span>
            <h3 className="demo-modal-title" style={{ marginTop: 14 }}>
              Scan to try it<br />on your <span className="hand">phone.</span>
            </h3>
            <p className="demo-modal-lede">
              The biometric signal is strongest on a touchscreen. Scan the code, follow the prompts,
              and you&rsquo;ll be back here when it&rsquo;s done.
            </p>

            <div className="demo-modal-qr">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(demoUrl)}`}
                alt="QR code for demo"
                width={220}
                height={220}
              />
            </div>

            <div className="demo-modal-waiting">
              <span className="demo-modal-dot" />
              <span>Waiting for you to complete the demo on your phone&hellip;</span>
            </div>

            <div className="demo-modal-divider"><span>or</span></div>

            <a href={demoUrl} className="btn btn-ghost demo-modal-inline-btn">
              Continue in this browser
            </a>
            <p className="demo-modal-hint">You can draw with a mouse or trackpad.</p>
          </div>
        )}

        {state === 'done' && (
          <div className="demo-modal-body">
            <span className="eyebrow">result</span>
            <h3 className="demo-modal-title" style={{ marginTop: 14 }}>
              {authenticated
                ? <>Verified &mdash; <span className="hand">that&rsquo;s you.</span></>
                : <>Not a match. <span className="hand">Try again.</span></>}
            </h3>
            <p className="demo-modal-lede">
              {authenticated
                ? 'Your drawing patterns matched your enrolled biometric profile.'
                : 'The drawing patterns didn\u2019t line up with the baseline you just created.'}
            </p>

            {breakdown && (
              <div className="demo-modal-metrics">
                <div className="demo-modal-metric">
                  <span>Signature</span>
                  <b>{breakdown.signature}%</b>
                </div>
                {breakdown.shapes.map(s => (
                  <div className="demo-modal-metric" key={s.type}>
                    <span>{s.type.charAt(0).toUpperCase() + s.type.slice(1)}</span>
                    <b>{s.score}%</b>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-primary demo-modal-inline-btn" onClick={onClose}>Close</button>
          </div>
        )}

        {state === 'error' && (
          <div className="demo-modal-body">
            <span className="eyebrow">error</span>
            <h3 className="demo-modal-title" style={{ marginTop: 14 }}>Something went wrong.</h3>
            <p className="demo-modal-lede">{error || 'Please try again.'}</p>
            <button className="btn btn-primary demo-modal-inline-btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="landing">
      <Nav />
      <main className="hero-slot">
        <Hero onTryDemo={() => setDemoOpen(true)} />
      </main>
      <Demo />
      <HowItWorks />
      <Compare />
      <Security />
      <Cases />
      <Sdk />
      <FAQ />
      <Pilot />
      <Footer />
      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
