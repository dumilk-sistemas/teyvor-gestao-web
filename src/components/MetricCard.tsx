import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';

type Props = { label: string; value: string; note?: string; tone?: 'default' | 'warning' };

export function MetricCard({ label, value, note, tone = 'default' }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === 'warning' && styles.valueWarning]}>{value}</Text>
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 18,
    minWidth: '47%',
    flexGrow: 1,
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  label: { fontSize: 12, color: theme.colors.muted, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { marginTop: 8, fontSize: 27, color: theme.colors.text, fontFamily: 'Sora_800ExtraBold' },
  valueWarning: { color: theme.colors.danger },
  note: { marginTop: 6, fontSize: 12, color: theme.colors.muted }
});
