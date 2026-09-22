export const tokens = {
  bg: {
    base: '#05060A',
    surface: '#0A0C12',
    surface2: '#101319',
    surface3: '#161A23',
  },
  aurora: {
    cyan: '#00E0FF',
    violet: '#7C3AED',
    magenta: '#FF3D9E',
    emerald: '#10E0A0',
  },
  border: {
    hairline: 'rgba(255,255,255,0.06)',
    soft: 'rgba(255,255,255,0.10)',
    strong: 'rgba(255,255,255,0.18)',
  },
  text: {
    primary: '#F7F8FA',
    secondary: '#9AA0AC',
    tertiary: '#5C6472',
  },
  spring: {
    gentle: { type: 'spring', stiffness: 220, damping: 28 },
    bouncy: { type: 'spring', stiffness: 400, damping: 20 },
  },
} as const;
