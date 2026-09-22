import { motion, type HTMLMotionProps } from 'motion/react';
import { useState } from 'react';
import { tokens } from '../../styles/tokens';

export interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  gradientBorder?: boolean;
  hover?: boolean;
}

/* 1px aurora gradient border via mask trick (ring minus inner cutout). */
function GradientBorder() {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 12,
        padding: 1,
        pointerEvents: 'none',
        background: `linear-gradient(135deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet}, ${tokens.aurora.magenta})`,
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}
    />
  );
}

export default function GlassCard({
  children,
  className = '',
  gradientBorder = false,
  hover = false,
  ...rest
}: GlassCardProps) {
  const [over, setOver] = useState(false);
  return (
    <motion.div
      className={className}
      onMouseEnter={() => hover && setOver(true)}
      onMouseLeave={() => setOver(false)}
      whileHover={hover ? { y: -2 } : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        background: 'rgba(10,12,18,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${over ? tokens.border.strong : tokens.border.hairline}`,
        boxShadow: over
          ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,224,255,0.15)'
          : 'none',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      {...rest}
    >
      {gradientBorder && <GradientBorder />}
      {children}
    </motion.div>
  );
}
