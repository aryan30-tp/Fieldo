export const colors = {
  light: {
    background: '#F6F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF1F7',
    border: '#D9DEE9',
    text: '#101828',
    mutedText: '#667085',
    accent: '#0E7490',
    accentSoft: '#D9F2F6',
  },
  dark: {
    background: '#08111F',
    surface: '#101B2D',
    surfaceMuted: '#162339',
    border: '#253248',
    text: '#F8FAFC',
    mutedText: '#94A3B8',
    accent: '#38BDF8',
    accentSoft: '#12324A',
  },
} as const;

export type AppColorScheme = keyof typeof colors;