import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { hasSession } from '@/services/api';
import { theme, useThemeColors } from '@/constants/theme';

export default function Index() {
  const c = useThemeColors();
  useEffect(() => {
    hasSession().then(ok => router.replace(ok ? '/dashboard' : '/login'));
  }, []);
  return <View style={styles.root}><ActivityIndicator size="large" color={c.gold} /></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.bg } });
