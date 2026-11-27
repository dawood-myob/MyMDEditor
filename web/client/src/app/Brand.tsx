export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="app-brand__mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" style={{ fill: 'var(--accent)' }} />
      <path
        d="M14 44V20h6l6 9 6-9h6v24h-6V30l-6 9-6-9v14zM46 36l6-8v5h-4v11h-4V33h-4z"
        style={{ fill: 'var(--accent-text)' }}
      />
    </svg>
  );
}

export function Brand({ size = 28, text = true }: { size?: number; text?: boolean }) {
  return (
    <span className="app-brand">
      <BrandMark size={size} />
      {text && <span className="app-brand__name">MDHub</span>}
    </span>
  );
}
