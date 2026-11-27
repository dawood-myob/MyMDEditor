import type { CSSProperties } from 'react';

export function Skeleton({ width, height = 14, radius, style }: { width?: number | string; height?: number | string; radius?: number | string; style?: CSSProperties }) {
  return <span className="app-skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** Table-like placeholder rows used while a list is loading. */
export function SkeletonRows({ rows = 4, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div className="app-skeleton-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="app-skeleton-row" key={i}>
          <Skeleton width={32} height={32} radius="50%" />
          <div className="app-skeleton-row__lines">
            <Skeleton width={`${40 + ((i * 17) % 30)}%`} />
            <Skeleton width={`${20 + ((i * 11) % 20)}%`} height={10} />
          </div>
          <Skeleton width={64} height={20} radius={10} />
        </div>
      ))}
    </div>
  );
}
