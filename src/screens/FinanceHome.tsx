import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AccountsModal } from '@/components/AccountsModal';
import { AdminShell } from '@/components/AdminShell';
import { Notice, formStyles as s } from '@/components/FormKit';
import { getFull } from '@/services/fullApi';
import { theme, useThemeColors } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const currentMonth = () => new Date().toISOString().slice(0, 7);

const monthName = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  const label = new Date(year, value - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const dateLabel = (iso: string) => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
};

type Entry = {
  id?: string;
  type: 'payable' | 'receivable';
  description: string;
  category: string;
  amount: number;
  due_date: string;
  status: string;
  recurring_rule_id?: number | string | null;
};

type FinanceData = {
  entries: Entry[];
  last_sync_at?: string | null;
};

export default function FinanceHome() {
  const colors = useThemeColors();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountsOpen, setAccountsOpen] = useState(false);
  const month = currentMonth();

  async function load() {
    try {
      setLoading(true);
      setError('');
      setData(await getFull<FinanceData>('finance'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o financeiro.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const entries = data?.entries || [];
    const openStatuses = ['open', 'overdue'];
    const payablesMonth = entries.filter(
      (entry) => entry.type === 'payable' &&
        openStatuses.includes(entry.status) &&
        entry.due_date.slice(0, 7) === month
    );
    const receivablesMonth = entries.filter(
      (entry) => entry.type === 'receivable' &&
        openStatuses.includes(entry.status) &&
        entry.due_date.slice(0, 7) === month
    );
    const overdue = entries.filter(
      (entry) => entry.type === 'payable' && entry.status === 'overdue'
    );
    const future = entries.filter(
      (entry) => entry.type === 'payable' &&
        openStatuses.includes(entry.status) &&
        entry.due_date.slice(0, 7) > month
    );
    const sum = (rows: Entry[]) => rows.reduce((total, entry) => total + Number(entry.amount || 0), 0);

    return {
      payablesMonth,
      payablesTotal: sum(payablesMonth),
      receivablesTotal: sum(receivablesMonth),
      overdueTotal: sum(overdue),
      overdueCount: overdue.length,
      futureTotal: sum(future),
      futureCount: future.length,
    };
  }, [data, month]);

  const nextEntries = useMemo(
    () => [...summary.payablesMonth, ...(data?.entries || []).filter(
      (entry) => entry.type === 'receivable' &&
        ['open', 'overdue'].includes(entry.status) &&
        entry.due_date.slice(0, 7) === month
    )]
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8),
    [data, month, summary.payablesMonth]
  );

  const modules = [
    {
      title: 'Contas a pagar',
      description: 'Despesas, vencimentos, recorrências e baixas.',
      icon: 'arrow-up-right',
      route: '/payables',
      color: theme.colors.danger,
      background: '#FDECEC',
    },
    {
      title: 'Contas a receber',
      description: 'Recebimentos previstos, realizados e vencidos.',
      icon: 'arrow-down-left',
      route: '/receivables',
      color: theme.colors.success,
      background: '#EAF7EF',
    },
    {
      title: 'Fluxo de caixa',
      description: 'Saldo diário, projeções, categorias e riscos.',
      icon: 'trending-up',
      route: '/cashflow',
      color: colors.primary,
      background: `${colors.primary}1A`,
    },
    {
      title: 'Contas e bancos',
      description: 'Saldos, destinos de recebimento e transferências.',
      icon: 'credit-card',
      action: 'accounts',
      color: colors.primary,
      background: '#F8F1DF',
    },
    {
      title: 'Fiscal',
      description: 'Configurações fiscais, certificado e dados para emissão.',
      icon: 'file-text',
      route: '/fiscal',
      color: theme.colors.text,
      background: '#F1F0EC',
    },
  ];

  return (
    <AdminShell
      title="Financeiro"
      subtitle="Visão geral e acesso às rotinas financeiras"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(data.last_sync_at).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={load}
      headerActions={null}
    >
      {!!error && <Notice text={error} tone="error" />}

      <View style={styles.periodBanner}>
        <View>
          <Text style={styles.eyebrow}>RESUMO DO MÊS</Text>
          <Text style={styles.periodTitle}>{monthName(month)}</Text>
        </View>
        <Text style={styles.periodNote}>Os valores abaixo consideram somente os vencimentos deste mês.</Text>
      </View>

      {!!data && (
        <>
          <View style={styles.summaryGrid}>
            {[
              {
                label: 'A PAGAR NO MÊS',
                value: summary.payablesTotal,
                note: `${summary.payablesMonth.length} lançamento${summary.payablesMonth.length === 1 ? '' : 's'}`,
                icon: 'arrow-up-right',
                color: '#C84E4E',
                background: '#FFF3F3',
              },
              {
                label: 'VENCIDO',
                value: summary.overdueTotal,
                note: `${summary.overdueCount} pendente${summary.overdueCount === 1 ? '' : 's'}`,
                icon: 'alert-circle',
                color: '#B63D42',
                background: '#FDEBEC',
              },
              {
                label: 'A RECEBER NO MÊS',
                value: summary.receivablesTotal,
                note: 'Em aberto no período',
                icon: 'arrow-down-left',
                color: '#25835A',
                background: '#EAF7F0',
              },
              {
                label: 'COMPROMISSOS FUTUROS',
                value: summary.futureTotal,
                note: `${summary.futureCount} após este mês`,
                icon: 'calendar',
                color: '#3568B8',
                background: '#EEF4FC',
              },
            ].map((item) => (
              <View key={item.label} style={styles.summaryCard}>
                <View style={[styles.summaryIcon, { backgroundColor: item.background }]}>
                  <Feather name={item.icon as any} size={15} color={item.color} />
                </View>
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                  <Text style={[styles.summaryValue, item.label === 'VENCIDO' && summary.overdueTotal > 0 && { color: item.color }]}>
                    {money(item.value)}
                  </Text>
                  <Text style={styles.summaryNote}>{item.note}</Text>
                </View>
              </View>
            ))}
          </View>

          <View>
            <Text style={styles.sectionTitle}>Rotinas financeiras</Text>
            <Text style={styles.sectionSubtitle}>Escolha a área que deseja administrar.</Text>
          </View>
          <View style={styles.moduleGrid}>
            {modules.map((module) => (
              <Pressable
                key={module.title}
                style={({ pressed }) => [
                  styles.moduleCard,
                  { borderLeftColor: module.color },
                  pressed && styles.moduleCardPressed,
                ]}
                onPress={() => module.action === 'accounts'
                  ? setAccountsOpen(true)
                  : router.push(module.route as never)}
              >
                <View style={[styles.moduleIcon, { backgroundColor: module.background }]}>
                  <Feather name={module.icon as any} size={20} color={module.color} />
                </View>
                <View style={styles.moduleContent}>
                  <Text style={styles.moduleTitle}>{module.title}</Text>
                  <Text style={styles.moduleDescription}>{module.description}</Text>
                </View>
                <View style={[styles.moduleArrow, { backgroundColor: module.background }]}>
                  <Feather name="chevron-right" size={18} color={module.color} />
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <View>
                <Text style={styles.panelTitle}>Próximos vencimentos</Text>
                <Text style={styles.panelSubtitle}>Entradas e saídas previstas em {monthName(month)}</Text>
              </View>
              <View style={styles.panelLinks}>
                <Pressable onPress={() => router.push('/payables')}>
                  <Text style={[styles.seeAll, { color: theme.colors.danger }]}>A pagar</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/receivables')}>
                  <Text style={[styles.seeAll, { color: theme.colors.success }]}>A receber</Text>
                </Pressable>
              </View>
            </View>
            {nextEntries.length ? nextEntries.map((entry) => (
              <View key={`${entry.type}:${String(entry.id)}`} style={styles.payableRow}>
                <View style={[
                  styles.dueIcon,
                  entry.type === 'receivable' && styles.dueIconReceivable,
                  entry.status === 'overdue' && styles.dueIconDanger,
                ]}>
                  <Feather
                    name={entry.type === 'receivable' ? 'arrow-down-left' : 'arrow-up-right'}
                    size={15}
                    color={entry.status === 'overdue' ? theme.colors.danger : entry.type === 'receivable' ? theme.colors.success : theme.colors.muted}
                  />
                </View>
                <View style={styles.payableMain}>
                  <Text style={styles.payableName}>{entry.description}</Text>
                  <Text style={styles.payableMeta}>
                    {entry.type === 'receivable' ? 'Entrada' : 'Saída'} • {entry.category} • vence {dateLabel(entry.due_date)}{entry.recurring_rule_id ? ' • recorrente' : ''}
                  </Text>
                </View>
                <Text style={[styles.payableAmount, entry.type === 'receivable' && styles.receivableAmount]}>{money(entry.amount)}</Text>
              </View>
            )) : (
              <Text style={s.empty}>Nenhuma entrada ou saída pendente com vencimento neste mês.</Text>
            )}
          </View>
        </>
      )}

      <AccountsModal
        visible={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        onChanged={load}
      />
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  periodBanner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    padding: 13,
  },
  eyebrow: { color: theme.colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  periodTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 3 },
  periodNote: { color: theme.colors.muted, fontSize: 12 },
  sectionTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 18 },
  sectionSubtitle: { color: theme.colors.muted, fontSize: 12.5, marginTop: 3 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
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
  summaryIcon: { alignItems: 'center', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  summaryContent: { flex: 1 },
  summaryLabel: { color: theme.colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.55 },
  summaryValue: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 2 },
  summaryNote: { color: theme.colors.muted, fontSize: 9.5, marginTop: 1 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moduleCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    flexBasis: 280,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 12,
    minHeight: 82,
    padding: 13,
    shadowColor: '#17202A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 7,
  },
  moduleCardPressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  moduleIcon: { alignItems: 'center', borderRadius: 10, height: 42, justifyContent: 'center', width: 42 },
  moduleContent: { flex: 1 },
  moduleTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '900' },
  moduleDescription: { color: theme.colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  moduleArrow: { alignItems: 'center', borderRadius: 16, height: 30, justifyContent: 'center', width: 30 },
  panel: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  panelHead: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 16 },
  panelTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 16 },
  panelSubtitle: { color: theme.colors.muted, fontSize: 11.5, marginTop: 3 },
  panelLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  seeAll: { fontSize: 12, fontWeight: '900' },
  payableRow: { alignItems: 'center', borderTopColor: '#ECEAE5', borderTopWidth: 1, flexDirection: 'row', gap: 11, padding: 14 },
  dueIcon: { alignItems: 'center', backgroundColor: '#F1F0EC', borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  dueIconReceivable: { backgroundColor: '#EAF7EF' },
  dueIconDanger: { backgroundColor: '#FDECEC' },
  payableMain: { flex: 1 },
  payableName: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  payableMeta: { color: theme.colors.muted, fontSize: 10.5, marginTop: 3 },
  payableAmount: { color: theme.colors.text, fontSize: 13, fontWeight: '900' },
  receivableAmount: { color: theme.colors.success },
});
