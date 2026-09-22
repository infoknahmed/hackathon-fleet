import { motion, type HTMLMotionProps } from 'motion/react';
import type { CSSProperties } from 'react';
import { tokens } from '../../styles/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base: CSSProperties = {
  height: 40,
  borderRadius: 10,
  paddingInline: 16,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
};

const variants: Record<Variant, CSSProperties> = {
  primary: {
    ...base,
    background: `linear-gradient(135deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet})`,
    color: '#000',
    boxShadow: '0 4px 20px rgba(0, 224, 255, 0.25)',
  },
  secondary: {
    ...base,
    background: 'rgba(255,255,255,0.06)',
    border: tokens.border.strong,
    color: tokens.text.primary,
  },
  ghost: {
    ...base,
    background: 'transparent',
    color: tokens.text.secondary,
    fontWeight: 500,
  },
  danger: {
    ...base,
    background: 'rgba(255,61,110,0.14)',
    border: '1px solid rgba(255,61,110,0.4)',
    color: '#fff',
  },
};

export default function AuroraButton({
  variant = 'primary',
  children,
  style,
  ...rest
}: HTMLMotionProps<'button'> & { variant?: Variant }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
      whileTap={{ scale: 0.97 }}
      style={{ ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
