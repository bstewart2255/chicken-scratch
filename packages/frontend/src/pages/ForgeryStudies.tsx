import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { AdminNav } from '../components/admin/AdminNav';
import * as api from '../api/client';
import type {
  ForgeryStudyTargetUser,
  ForgeryStudySummary,
  ForgeryStudyResults,
  DeviceClass,
} from '@chicken-scratch/shared';

const PAGE: CSSProperties = { maxWidth: 960, margin: '0 auto', padding: 24 };
const SECTION: CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
  padding: 20, marginBottom: 20,
};
const H3: CSSProperties = { margin: '0 0 12px', fontSize: 16, color: '#1a1a2e' };
const TD: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 };
const TH: CSSProperties = { ...TD, color: '#888', fontWeight: 600, textAlign: 'left' };
const INPUT: CSSProperties = {
  padding: '8px 10px', fontSize: 14, border: '1px solid #ccc',
  borderRadius: 6, width: '100%', boxSizing: 'border-box',
};
const BTN: CSSProperties = {
  padding: '8px 16px', fontSize: 14, background: '#1a1a2e', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ForgeryStudies() {
  const [users, setUsers] = useState<ForgeryStudyTargetUser[]>([]);
  const [studies, setStudies] = useState<ForgeryStudySummary[]>([]);
  const [results, setResults] = useState<ForgeryStudyResults | null>(null);
  const [error, setError] = useState('');

  const [targetUsername, setTargetUsername] = useState('');
  const [forgerLabel, setForgerLabel] = useState('');
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('mobile');
  const [notes, setNotes] = useState('');
  const [createdLink, setCreatedLink] = useState('');

  const refresh = useCallback(() => {
    api.getForgeryStudyUsers().then(setUsers).catch(e => setError(errText(e)));
    api.listForgeryStudies().then(setStudies).catch(e => setError(errText(e)));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleTarget = async (username: string, enabled: boolean) => {
    setError('');
    try {
      await api.setForgeryResearchTarget(username, enabled);
      refresh();
    } catch (e) {
      setError(errText(e));
    }
  };

  const create = async () => {
    setError('');
    setCreatedLink('');
    try {
      const res = await api.createForgeryStudy({
        targetUsername,
        forgerLabel,
        deviceClass,
        notes: notes.trim() || undefined,
      });
      setCreatedLink(res.url);
      setForgerLabel('');
      setNotes('');
      refresh();
    } catch (e) {
      setError(errText(e));
    }
  };

  const eligibleTargets = users.filter(u => u.researchTarget && u.enrolled);

  return (
    <div style={PAGE}>
      <AdminNav />
      <h1 style={{ fontSize: 22, color: '#1a1a2e' }}>Forgery Studies</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
        Create one study per forger — each link <em>is</em> that person's identity, so
        attempts and learning curves stay separate. Pass/fail only is shown to the forger.
      </p>

      {error && (
        <div style={{ ...SECTION, background: '#fef2f2', borderColor: '#ef4444', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* ── Research targets ───────────────────────────────────── */}
      <div style={SECTION}>
        <h3 style={H3}>Research targets</h3>
        <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>
          A study can only target an opted-in, enrolled user. Tenant and demo
          accounts are excluded.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={TH}>User</th><th style={TH}>Enrolled</th><th style={TH}>Research target</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username}>
                <td style={TD}>{u.username}</td>
                <td style={TD}>{u.enrolled ? 'yes' : 'no'}</td>
                <td style={TD}>
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={u.researchTarget}
                      onChange={e => toggleTarget(u.username, e.target.checked)}
                    />{' '}
                    {u.researchTarget ? 'opted in' : 'opt in'}
                  </label>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td style={TD} colSpan={3}>No eligible users.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── New study ──────────────────────────────────────────── */}
      <div style={SECTION}>
        <h3 style={H3}>New study</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ fontSize: 13, color: '#555' }}>
            Target
            <select
              style={INPUT}
              value={targetUsername}
              onChange={e => setTargetUsername(e.target.value)}
            >
              <option value="">— select an enrolled research target —</option>
              {eligibleTargets.map(u => (
                <option key={u.username} value={u.username}>{u.username}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, color: '#555' }}>
            Forger label
            <input
              style={INPUT}
              placeholder="e.g. Mom"
              value={forgerLabel}
              onChange={e => setForgerLabel(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13, color: '#555' }}>
            Device class
            <select
              style={INPUT}
              value={deviceClass}
              onChange={e => setDeviceClass(e.target.value as DeviceClass)}
            >
              <option value="mobile">mobile</option>
              <option value="desktop">desktop</option>
            </select>
          </label>
          <label style={{ fontSize: 13, color: '#555' }}>
            Notes (optional)
            <input style={INPUT} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>
        <button
          style={{ ...BTN, marginTop: 14, opacity: targetUsername && forgerLabel.trim() ? 1 : 0.5 }}
          disabled={!targetUsername || !forgerLabel.trim()}
          onClick={create}
          type="button"
        >
          Create study
        </button>
        {eligibleTargets.length === 0 && (
          <p style={{ color: '#b45309', fontSize: 13 }}>
            No eligible targets — opt in an enrolled user above first.
          </p>
        )}
        {createdLink && (
          <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 6 }}>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Share this link with the forger:</div>
            <code style={{ fontSize: 13 }}>{createdLink}</code>{' '}
            <button
              style={{ ...BTN, padding: '4px 10px', fontSize: 12 }}
              onClick={() => navigator.clipboard?.writeText(createdLink)}
              type="button"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* ── Studies ────────────────────────────────────────────── */}
      <div style={SECTION}>
        <h3 style={H3}>Studies</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Forger</th>
              <th style={TH}>Target</th>
              <th style={TH}>Device</th>
              <th style={TH}>Attempts</th>
              <th style={TH}>Passes</th>
              <th style={TH}>Last activity</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {studies.map(s => (
              <tr key={s.id}>
                <td style={TD}>{s.forgerLabel}</td>
                <td style={TD}>{s.targetUsername}</td>
                <td style={TD}>{s.deviceClass}</td>
                <td style={TD}>{s.attemptCount}</td>
                <td style={TD}>{s.passCount}</td>
                <td style={TD}>{s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString() : '—'}</td>
                <td style={TD}>
                  <button
                    style={{ ...BTN, padding: '4px 10px', fontSize: 12 }}
                    onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/forge/${s.id}`)}
                    type="button"
                  >
                    Copy link
                  </button>{' '}
                  <button
                    style={{ ...BTN, padding: '4px 10px', fontSize: 12, background: '#475569' }}
                    onClick={() => api.getForgeryStudyResults(s.id).then(setResults).catch(e => setError(errText(e)))}
                    type="button"
                  >
                    Results
                  </button>
                </td>
              </tr>
            ))}
            {studies.length === 0 && (
              <tr><td style={TD} colSpan={7}>No studies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Results / learning curve ───────────────────────────── */}
      {results && (
        <div style={SECTION}>
          <h3 style={H3}>
            Learning curve — {results.study.forgerLabel} vs {results.study.targetUsername}
          </h3>
          <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>
            {results.attempts.length} attempt(s). The bar is the combined score; the
            line marks the pass threshold ({results.study.deviceClass}).
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>#</th>
                <th style={TH}>Combined score</th>
                <th style={TH}>Result</th>
                <th style={TH}>Per-item</th>
              </tr>
            </thead>
            <tbody>
              {results.attempts.map(a => (
                <tr key={a.attemptIndex}>
                  <td style={TD}>{a.attemptIndex}</td>
                  <td style={TD}>
                    <div style={{ position: 'relative', background: '#f0f0f0', borderRadius: 3, height: 16, width: 220 }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${Math.max(0, Math.min(100, a.combinedScore))}%`,
                        background: a.passed ? '#22c55e' : '#f59e0b', borderRadius: 3,
                      }} />
                      <div style={{
                        position: 'absolute', top: -2, bottom: -2,
                        left: `${Math.max(0, Math.min(100, a.threshold))}%`,
                        width: 2, background: '#1a1a2e',
                      }} />
                      <span style={{ position: 'absolute', right: 4, fontSize: 11, lineHeight: '16px' }}>
                        {a.combinedScore.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...TD, color: a.passed ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                    {a.passed ? 'PASS' : 'fail'}
                  </td>
                  <td style={TD}>
                    {a.itemScores.map(i => `${i.itemType}: ${i.score.toFixed(1)}`).join('  ·  ')}
                  </td>
                </tr>
              ))}
              {results.attempts.length === 0 && (
                <tr><td style={TD} colSpan={4}>No attempts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
