import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  note?: string;
  tone?: 'default' | 'warning';
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
  background?: string;
};

// Com `icon`, o card usa o layout compacto (selo colorido + rótulo maiúsculo)
// padronizado a partir da tela Financeiro. Sem `icon`, mantém o layout antigo
// (usado por Vendas/Caixa/Produtos/Fornecedores/Clientes) sem alterar nada ali.
export function MetricCard({ label, value, note, tone = 'default', icon, color, background }: Props) {
  if (icon) {
    return (
      <View style={compactStyles.card}>
        <View style={[compactStyles.icon, { backgroundColor: background || '#F2F4F5' }]}>
          <Feather name={icon} size={15} color={color || theme.colors.muted} />
        </View>
        <View style={compactStyles.content}>
          <Text style={compactStyles.label}>{label}</Text>
          <Text style={[compactStyles.value, tone === 'warning' && styles.valueWarning]}>{value}</Text>
          {!!note && <Text style={compactStyles.note}>{note}</Text>}
        </View>
      </View>
    );
  }

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

const compactStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 220,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  icon: { alignItems: 'center', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  content: { flex: 1 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.55 },
  value: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 2 },
  note: { color: theme.colors.muted, fontSize: 9.5, marginTop: 1 },
});
