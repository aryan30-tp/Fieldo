import { useColorScheme as useReactNativeColorScheme } from 'react-native';

import { colors, type AppColorScheme } from '@/constants/colors';

export function useAppTheme() {
  const scheme = (useReactNativeColorScheme() ?? 'light') as AppColorScheme;

  return {
    scheme,
    colors: colors[scheme],
  };
}