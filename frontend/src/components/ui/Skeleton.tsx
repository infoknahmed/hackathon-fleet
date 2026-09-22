const base: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.05)',
};

const variants = {
  text: { height: 16, width: '100%', borderRadius: 6 },
  card: { height: 128, width: '100%', borderRadius: 12 },
  row: { height: 48, width: '100%', borderRadius: 10 },
} as const;

export default function Skeleton({
  variant = 'text',
  style,
}: {
  variant?: keyof typeof variants;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className="shimmer"
      style={{ ...base, ...variants[variant], ...style }}
    />
  );
}
