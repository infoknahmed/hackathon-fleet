import { tokens } from '../../styles/tokens';

const colors = {
  green: tokens.aurora.emerald,
  yellow: '#FFC94D',
  red: '#FF5C5C',
} as const;

export default function Pulse({
  color = 'green',
  size = 8,
}: {
  color?: keyof typeof colors;
  size?: number;
}) {
  const c = colors[color];
  return (
    <span
      aria-hidden
      className="pulse-ring"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: c,
        boxShadow: `0 0 8px ${c}`,
      }}
    />
  );
}
