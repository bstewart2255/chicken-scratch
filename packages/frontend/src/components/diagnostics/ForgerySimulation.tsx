import { useState } from 'react';
import type { ForgerySimulationResult, ForgeryLevelResult, ForgeryLevel } from '@chicken-scratch/shared';
import * as api from '../../api/client';

interface Props {
  username: string;
}

const LEVEL_COLORS: Record<ForgeryLevel, string> = {
  random: '#6366f1',    // indigo
  unskilled: '#f59e0b', // amber
  skilled: '#ef4444',   // red
  replay: '#22c55e',    // green
};

function StatCard({ label, value, color, small }: { label: string; value: string | number; color?: string; small?: boolean }) {
  return (
    <div style={{
      flex: 1,
      padding: small ? 8 : 12,
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      textAlign: 'center',
      minWidth: small ? 70 : 100,
    }}>
      <div style={{
        fontSize: small ? 18 : 24,
        fontWeight: 'bold',
        color: color || '#1a1a2e',
        fontFamily: 'monospace',
      }}>
        {value}
      </div>
      <div style={{ fontSize: small ? 10 : 11, color: '#999', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FARBadge({ far }: { far: number }) {
  const pct = (far * 100).toFixed(1);
  const color = far === 0 ? '#22c55e' : far < 0.05 ? '#eab308' : '#ef4444';
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'monospace',
      background: `${color}18`,
      color,
      border: `1px solid ${color}40`,
    }}>
      FAR: {pct}%
    </span>
  );
}

function ScoreDistributionBar({ level, threshold }: { level: ForgeryLevelResult; threshold: number }) {
  // Create 20 buckets (0-5, 5-10, ..., 95-100)
  const bucketSize = 5;
  const bucketCount = 100 / bucketSize;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const s of level.scores) {
    const idx = Math.min(bucketCount - 1, Math.floor(s / bucketSize));
    buckets[idx]++;
  }
  const maxCount = Math.max(1, ...buckets);
  const thresholdBucket = Math.floor(threshold / bucketSize);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60 }}>
        {buckets.map((count, i) => {
          const height = count > 0 ? Math.max(4, (count / maxCount) * 60) : 0;
          const isAboveThreshold = i >= thresholdBucket;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height,
                background: isAboveThreshold ? '#ef4444' : LEVEL_COLORS[level.level],
                borderRadius: '2px 2px 0 0',
                opacity: count > 0 ? 1 : 0.1,
              }}
              title={`${i * bucketSize}-${(i + 1) * bucketSize}: ${count} trials`}
            />
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 16, fontSize: 9, color: '#999' }}>
        <span style={{ position: 'absolute', left: 0 }}>0</span>
        <span style={{ position: 'absolute', left: `${threshold}%`, transform: 'translateX(-50%)', color: '#ef4444', fontWeight: 'bold', fontSize: 10 }}>
          {threshold}
        </span>
        <span style={{ position: 'absolute', right: 0 }}>100</span>
      </div>
    </div>
  );
}

function LevelCard({ level, threshold }: { level: ForgeryLevelResult; threshold: number }) {
  const [expanded, setExpanded] = useState(false);
  const color = LEVEL_COLORS[level.level];

  return (
    <div style={{
      padding: 16,
      background: '#fff',
      border: `1px solid #e5e7eb`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8,
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 'bold', fontSize: 15, color: '#1a1a2e' }}>{level.label}</span>
          <FARBadge far={level.falseAcceptanceRate} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#666' }}>
          {level.trials} trials
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>{level.description}</p>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <StatCard label="Mean" value={level.meanScore.toFixed(1)} color={color} small />
        <StatCard label="Std Dev" value={level.stdDev.toFixed(1)} small />
        <StatCard label="Min" value={level.minScore.toFixed(1)} small />
        <StatCard label="Max" value={level.maxScore.toFixed(1)} small />
        <StatCard
          label="Passed"
          value={`${level.passCount}/${level.trials}`}
          color={level.passCount === 0 ? '#22c55e' : '#ef4444'}
          small
        />
      </div>

      {/* Distribution bar */}
      <ScoreDistributionBar level={level} threshold={threshold} />

      {/* Expandable per-shape breakdown */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          marginTop: 8,
          padding: '4px 12px',
          fontSize: 11,
          background: 'none',
          border: '1px solid #ddd',
          borderRadius: 4,
          cursor: 'pointer',
          color: '#666',
        }}
      >
        {expanded ? 'Hide' : 'Show'} per-shape breakdown
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px' }}>Shape</th>
                <th style={{ padding: '4px 6px' }}>Avg Score</th>
                <th style={{ padding: '4px 6px' }}>Min</th>
                <th style={{ padding: '4px 6px' }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Aggregate per-shape scores across trials
                const shapeMap = new Map<string, number[]>();
                for (const trial of level.trialDetails) {
                  for (const ss of trial.shapeScores) {
                    const arr = shapeMap.get(ss.shapeType) || [];
                    arr.push(ss.combinedScore);
                    shapeMap.set(ss.shapeType, arr);
                  }
                }
                // Also add signature scores
                const sigScores = level.trialDetails.map(t => t.signatureScore);
                shapeMap.set('signature', sigScores);

                return Array.from(shapeMap.entries()).map(([shape, scores]) => {
                  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                  return (
                    <tr key={shape} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px', fontWeight: shape === 'signature' ? 'bold' : 'normal' }}>
                        {shape}
                      </td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{avg.toFixed(1)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{Math.min(...scores).toFixed(1)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{Math.max(...scores).toFixed(1)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ForgerySimulation({ username }: Props) {
  const [result, setResult] = useState<ForgerySimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trialsPerLevel, setTrialsPerLevel] = useState(20);

  const runSimulation = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.runForgerySimulation(username, trialsPerLevel);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        padding: 12,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}>
        <label style={{ fontSize: 13, color: '#555' }}>
          Trials per level:
          <select
            value={trialsPerLevel}
            onChange={e => setTrialsPerLevel(Number(e.target.value))}
            style={{ marginLeft: 6, padding: '4px 8px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          onClick={runSimulation}
          disabled={loading}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            fontWeight: 'bold',
            background: loading ? '#999' : '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Running...' : 'Run Simulation'}
        </button>
        {loading && (
          <span style={{ fontSize: 12, color: '#999' }}>
            Running {trialsPerLevel * 4} total trials (this may take a few seconds)...
          </span>
        )}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

      {result && (
        <>
          {/* Summary header */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}>
            <StatCard label="Real User Mean" value={result.realUserMeanScore.toFixed(1)} color="#22c55e" />
            <StatCard label="Threshold" value={result.threshold} color="#1a1a2e" />
            {result.levels.map(l => (
              <StatCard
                key={l.level}
                label={`${l.level.charAt(0).toUpperCase() + l.level.slice(1)} FAR`}
                value={`${(l.falseAcceptanceRate * 100).toFixed(0)}%`}
                color={l.falseAcceptanceRate === 0 ? '#22c55e' : '#ef4444'}
              />
            ))}
          </div>

          {/* Separation gap visualization */}
          <div style={{
            padding: 12,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#555' }}>Score Separation</h4>
            <div style={{ position: 'relative', height: 40, background: '#f9fafb', borderRadius: 4, overflow: 'hidden' }}>
              {/* Threshold line */}
              <div style={{
                position: 'absolute',
                left: `${result.threshold}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#ef4444',
                zIndex: 2,
              }} />
              <div style={{
                position: 'absolute',
                left: `${result.threshold}%`,
                top: -2,
                transform: 'translateX(-50%)',
                fontSize: 9,
                color: '#ef4444',
                fontWeight: 'bold',
                zIndex: 3,
              }}>
                {result.threshold}
              </div>

              {/* Level markers */}
              {result.levels.map(l => {
                const left = Math.max(0, Math.min(100, l.meanScore));
                const width = Math.max(1, Math.min(50, l.stdDev * 2));
                return (
                  <div key={l.level} style={{ position: 'absolute', top: 12, zIndex: 1 }}>
                    {/* Range bar */}
                    <div style={{
                      position: 'absolute',
                      left: `${Math.max(0, left - width)}%`,
                      width: `${width * 2}%`,
                      height: 16,
                      background: `${LEVEL_COLORS[l.level]}30`,
                      borderRadius: 8,
                      transform: 'translateX(-50%)',
                      marginLeft: `${left - (left - width)}%`,
                    }} />
                    {/* Mean dot */}
                    <div style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: 10,
                      height: 10,
                      background: LEVEL_COLORS[l.level],
                      borderRadius: '50%',
                      transform: 'translate(-50%, 3px)',
                      border: '2px solid #fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                );
              })}

              {/* Real user marker */}
              <div style={{
                position: 'absolute',
                left: `${result.realUserMeanScore}%`,
                top: 12,
                width: 10,
                height: 10,
                background: '#22c55e',
                borderRadius: '50%',
                transform: 'translate(-50%, 3px)',
                border: '2px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                zIndex: 2,
              }} />
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Real User ({result.realUserMeanScore.toFixed(1)})
              </span>
              {result.levels.map(l => (
                <span key={l.level} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL_COLORS[l.level], display: 'inline-block' }} />
                  {l.level} ({l.meanScore.toFixed(1)})
                </span>
              ))}
            </div>
          </div>

          {/* Per-level cards */}
          {result.levels.map(l => (
            <LevelCard key={l.level} level={l} threshold={result.threshold} />
          ))}

          <p style={{ fontSize: 11, color: '#999', marginTop: 8, fontStyle: 'italic' }}>
            Simulation run at {new Date(result.runAt).toLocaleString()} — {result.trialsPerLevel} trials per level ({result.trialsPerLevel * 4} total)
          </p>
        </>
      )}
    </div>
  );
}
