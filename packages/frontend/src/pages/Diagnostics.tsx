import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { DiagnosticsUser, DiagnosticsAttempt, UserStats, BaselineSummary } from '@chicken-scratch/shared';
import { AttemptHistoryTable } from '../components/diagnostics/AttemptHistoryTable';
import { ScoreBreakdownChart } from '../components/diagnostics/ScoreBreakdownChart';
import { FeatureComparisonView } from '../components/diagnostics/FeatureComparisonView';
import { AggregateStats } from '../components/diagnostics/AggregateStats';
import { ShapeDetailPanel } from '../components/diagnostics/ShapeDetailPanel';
import { FingerprintPanel } from '../components/diagnostics/FingerprintPanel';
import { ForgerySimulation } from '../components/diagnostics/ForgerySimulation';
import * as api from '../api/client';

type Tab = 'attempts' | 'stats' | 'forgery';

interface EnrollmentInfo {
  signatures: { sampleNumber: number; deviceCapabilities: any; createdAt: string }[];
  shapes: { shapeType: string; deviceCapabilities: any; createdAt: string }[];
}

export function Diagnostics() {
  const [users, setUsers] = useState<DiagnosticsUser[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [tab, setTab] = useState<Tab>('attempts');
  const [attempts, setAttempts] = useState<DiagnosticsAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<DiagnosticsAttempt | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [baseline, setBaseline] = useState<BaselineSummary | null>(null);
  const [enrollmentInfo, setEnrollmentInfo] = useState<EnrollmentInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // Load users on mount
  useEffect(() => {
    api.getDiagnosticsUsers().then(setUsers).catch(console.error);
  }, []);

  // Load data when user is selected
  useEffect(() => {
    if (!selectedUsername) {
      setAttempts([]);
      setStats(null);
      setBaseline(null);
      setSelectedAttempt(null);
      return;
    }

    setLoading(true);
    setSelectedAttempt(null);

    Promise.all([
      api.getUserAttempts(selectedUsername),
      api.getUserStats(selectedUsername),
      api.getUserBaseline(selectedUsername),
      api.getEnrollmentSamples(selectedUsername),
    ]).then(([a, s, b, e]) => {
      setAttempts(a);
      setStats(s);
      setBaseline(b);
      setEnrollmentInfo(e);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedUsername]);

  const refreshData = () => {
    if (!selectedUsername) return;
    setLoading(true);
    Promise.all([
      api.getUserAttempts(selectedUsername),
      api.getUserStats(selectedUsername),
    ]).then(([a, s]) => {
      setAttempts(a);
      setStats(s);
    }).catch(console.error)
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Link to="/" style={{ color: '#666', textDecoration: 'none', fontSize: 13 }}>Back</Link>
          <h2 style={{ margin: '4px 0 0' }}>Diagnostics</h2>
        </div>
        {selectedUsername && (
          <button
            onClick={refreshData}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        )}
      </div>

      {/* User selector */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={selectedUsername}
          onChange={e => setSelectedUsername(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 14,
            border: '2px solid #ccc',
            borderRadius: 8,
            minWidth: 200,
            background: '#fff',
          }}
        >
          <option value="">Select a user...</option>
          {users.map(u => (
            <option key={u.id} value={u.username}>
              {u.username} {u.enrolled ? '' : '(not enrolled)'}
            </option>
          ))}
        </select>
        {loading && <span style={{ marginLeft: 8, color: '#999', fontSize: 13 }}>Loading...</span>}
      </div>

      {!selectedUsername && (
        <p style={{ color: '#999', textAlign: 'center', marginTop: 40 }}>
          Select a user to view diagnostics
        </p>
      )}

      {/* Enrollment device info */}
      {selectedUsername && !loading && enrollmentInfo && (
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          padding: 12,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: 13,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontWeight: 'bold', color: '#555', marginRight: 4 }}>Enrollment Device:</div>
          {enrollmentInfo.signatures.length > 0 && (() => {
            const dc = enrollmentInfo.signatures[0].deviceCapabilities;
            return (
              <span style={{ color: '#333' }}>
                {dc?.os} / {dc?.browser} / {dc?.inputMethod}
                {dc?.supportsPressure && ' (pressure supported)'}
                <span style={{ color: '#999', marginLeft: 8 }}>
                  enrolled {new Date(enrollmentInfo.signatures[0].createdAt).toLocaleDateString()}
                </span>
              </span>
            );
          })()}
          {attempts.length > 0 && (() => {
            const lastDc = attempts[0].deviceCapabilities;
            const enrollDc = enrollmentInfo.signatures[0]?.deviceCapabilities;
            const sameDevice = enrollDc &&
              lastDc?.os === enrollDc.os &&
              lastDc?.browser === enrollDc.browser &&
              lastDc?.inputMethod === enrollDc.inputMethod;
            return !sameDevice ? (
              <span style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: '#fef3c7',
                color: '#92400e',
                fontSize: 11,
              }}>
                Last verify on different device: {lastDc?.os} / {lastDc?.browser} / {lastDc?.inputMethod}
              </span>
            ) : null;
          })()}
        </div>
      )}

      {selectedUsername && !loading && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #eee' }}>
            {(['attempts', 'stats', 'forgery'] as Tab[]).map(t => {
              const labels: Record<Tab, string> = {
                attempts: 'Attempts',
                stats: 'Aggregate Stats',
                forgery: 'Forgery Simulation',
              };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    borderBottom: tab === t ? '2px solid #1a1a2e' : '2px solid transparent',
                    color: tab === t ? '#1a1a2e' : '#999',
                    fontWeight: tab === t ? 'bold' : 'normal',
                    marginBottom: -2,
                  }}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {/* Attempts tab */}
          {tab === 'attempts' && (
            <div style={{ display: 'flex', gap: 20 }}>
              {/* Left: attempt list */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <AttemptHistoryTable
                  attempts={attempts}
                  selectedId={selectedAttempt?.id ?? null}
                  onSelect={setSelectedAttempt}
                  onForgeryToggle={async (attemptId, isForgery) => {
                    await api.setAttemptForgeryFlag(attemptId, isForgery);
                    setAttempts(prev => prev.map(a =>
                      a.id === attemptId ? { ...a, isForgery } : a
                    ));
                  }}
                />
              </div>

              {/* Right: detail panel */}
              {selectedAttempt && (
                <div style={{
                  width: 420,
                  flexShrink: 0,
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto',
                  padding: 16,
                  background: '#fafafa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}>
                  <ScoreBreakdownChart attempt={selectedAttempt} />

                  {/* Timing breakdown */}
                  {selectedAttempt.durationMs && (
                    <div style={{ marginTop: 16, padding: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#555' }}>
                        Timing — {(selectedAttempt.durationMs / 1000).toFixed(1)}s total
                      </h4>
                      {selectedAttempt.stepDurations && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {selectedAttempt.stepDurations.map((sd, i) => (
                            <span key={i} style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontFamily: 'monospace',
                              background: '#f3f4f6',
                              color: '#374151',
                            }}>
                              {sd.step}: {(sd.durationMs / 1000).toFixed(1)}s
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Signature feature comparison */}
                  {selectedAttempt.signatureFeatures && selectedAttempt.signatureComparison && baseline?.signature && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ height: 1, background: '#ddd', marginBottom: 16 }} />
                      <FeatureComparisonView
                        baseline={baseline.signature.avgFeatures}
                        attempt={selectedAttempt.signatureFeatures}
                        comparison={selectedAttempt.signatureComparison}
                        title="Signature Feature Comparison"
                      />
                    </div>
                  )}

                  {/* Shape details */}
                  {selectedAttempt.shapeDetails && selectedAttempt.shapeDetails.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ height: 1, background: '#ddd', marginBottom: 16 }} />
                      <ShapeDetailPanel
                        shapeDetails={selectedAttempt.shapeDetails}
                        baseline={baseline}
                      />
                    </div>
                  )}

                  {/* Fingerprint match */}
                  {selectedAttempt.fingerprintMatch && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ height: 1, background: '#ddd', marginBottom: 16 }} />
                      <FingerprintPanel match={selectedAttempt.fingerprintMatch} />
                    </div>
                  )}

                  {/* No diagnostic data */}
                  {!selectedAttempt.signatureFeatures && (
                    <p style={{ color: '#999', fontSize: 12, fontStyle: 'italic', marginTop: 16 }}>
                      This attempt was recorded before diagnostics were enabled.
                      Only basic score data is available.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stats tab */}
          {tab === 'stats' && stats && (
            <AggregateStats stats={stats} />
          )}

          {/* Forgery simulation tab */}
          {tab === 'forgery' && (
            <ForgerySimulation username={selectedUsername} />
          )}
        </>
      )}
    </div>
  );
}
