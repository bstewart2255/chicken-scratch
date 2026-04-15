const colorMap: Record<string, { bg: string; text: string }> = {
  active: { bg: '#dcfce7', text: '#16a34a' },
  suspended: { bg: '#fef2f2', text: '#dc2626' },
  revoked: { bg: '#f3f4f6', text: '#6b7280' },
  free: { bg: '#eff6ff', text: '#2563eb' },
  starter: { bg: '#fefce8', text: '#ca8a04' },
  enterprise: { bg: '#f5f3ff', text: '#7c3aed' },
};

interface StatusPillProps {
  value: string;
  label?: string;
}

export function StatusPill({ value, label }: StatusPillProps) {
  const colors = colorMap[value] || { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'capitalize',
      background: colors.bg,
      color: colors.text,
    }}>
      {label || value}
    </span>
  );
}
