import { palette } from './palette';

export const tokens = {
  color: {
    bg:      palette.black,
    surface: palette.surface,
    border:  palette.border,
    text:    palette.white,
    muted:   palette.muted,
    accent:  palette.red,
    success: palette.green,
    warning: palette.yellow,
    viewers: palette.viewers,
  },

  spacing: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  40,
    xxl: 64,
  },

  radius: {
    sm:   6,
    md:   12,
    lg:   20,
    full: 9999,
  },

  font: {
    size: {
      xs:  12,
      sm:  14,
      md:  18,
      lg:  24,
      xl:  32,
      xxl: 48,
    },
    weight: {
      regular: '400' as const,
      medium:  '500' as const,
      bold:    '700' as const,
    },
  },
} as const;
