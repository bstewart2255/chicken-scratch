import { useState } from 'react';

interface ApiKeyDisplayProps {
  rawKey: string;
  onDismiss: () => void;
}

export function ApiKeyDisplay({ rawKey, onDismiss }: ApiKeyDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      padding: 16,
      background: '#fffbeb',
      border: '1px solid #fbbf24',
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
        API Key Created — Copy it now!
      </div>
      <div style={{ fontSize: 12, color: '#92400e', marginBottom: 12 }}>
        This key will not be shown again. Store it securely.
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: '8px 12px',
      }}>
        <code style={{
          flex: 1,
          fontSize: 13,
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          color: '#1a1a2e',
        }}>
          {rawKey}
        </code>
        <button
          onClick={handleCopy}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            background: copied ? '#22c55e' : '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <button
        onClick={onDismiss}
        style={{
          marginTop: 12,
          padding: '6px 16px',
          fontSize: 12,
          background: '#fff',
          color: '#666',
          border: '1px solid #ddd',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
