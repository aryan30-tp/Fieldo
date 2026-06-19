import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';

const highlights = [
  {
    title: 'Expo SDK 54',
    description: 'Aligned with React Native 0.81 and the current Expo Router stack.',
  },
  {
    title: 'Single source of truth',
    description: 'Routes live in app/, shared code stays in src/, and assets remain separate.',
  },
  {
    title: 'Production ready foundation',
    description: 'The scaffold is trimmed to the pieces you actually extend in a real app.',
  },
];

export function HomeScreen() {
  const { colors: palette } = useAppTheme();
  const scheme = useColorScheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.ambientTop, { backgroundColor: palette.accentSoft }]} />
        <View style={[styles.ambientBottom, { backgroundColor: palette.surfaceMuted }]} />

        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.badgeText, { color: palette.accent }]}>Fieldo</Text>
          </View>

          <Text style={[styles.title, { color: palette.text }]}>Clean Expo starter for iOS and Android.</Text>
          <Text style={[styles.subtitle, { color: palette.mutedText }]}>A lean Expo Router setup with a proper src-based codebase, a single root route, and only the files you need to start shipping.</Text>
          <Text style={[styles.caption, { color: palette.mutedText }]}>Active theme: {scheme ?? 'light'}</Text>
        </View>

        <View style={styles.grid}>
          {highlights.map((item) => (
            <View
              key={item.title}
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>{item.title}</Text>
              <Text style={[styles.cardBody, { color: palette.mutedText }]}>{item.description}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  ambientTop: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 180,
    height: 180,
    borderRadius: 180,
    opacity: 0.65,
  },
  ambientBottom: {
    position: 'absolute',
    left: -40,
    bottom: 110,
    width: 140,
    height: 140,
    borderRadius: 140,
    opacity: 0.8,
  },
  hero: {
    gap: 16,
    marginTop: 28,
    marginBottom: 28,
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  grid: {
    gap: 14,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 18,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
  },
});