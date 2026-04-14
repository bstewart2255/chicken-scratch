import { useEffect, useState } from 'react';
import * as api from '../api/client';

interface SessionState {
  status: string;
  result: any;
}

interface Props {
  sessionId: string;
  onComplete: (result: any) => void;
  pollInterval?: number;
}

export function SessionPoller({ sessionId, onComplete, pollInterval = 2000 }: Props) {
  const [session, setSession] = useState<SessionState>({ status: 'pending', result: null });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const data = await api.getSession(sessionId);
        if (!active) return;

        setSession({ status: data.status, result: data.result });

        if (data.status === 'completed' && data.result) {
          onComplete(data.result);
          return;
        }

        if (data.status === 'expired') {
          setError('Session expired.');
          return;
        }

        // Continue polling
        setTimeout(poll, pollInterval);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    };

    poll();
    return () => { active = false; };
  }, [sessionId, onComplete, pollInterval]);

  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    completed: '#22c55e',
    expired: '#ef4444',
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <div style={{
        display: 'inline-block',
        padding: '8px 16px',
        borderRadius: 20,
        background: `${statusColors[session.status] || '#999'}22`,
        color: statusColors[session.status] || '#999',
        fontSize: 14,
        fontWeight: 600,
      }}>
        {session.status === 'pending' && 'Waiting for phone...'}
        {session.status === 'in_progress' && 'Drawing in progress...'}
        {session.status === 'completed' && 'Complete!'}
        {session.status === 'expired' && 'Expired'}
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
