import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
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

  const nextPayables = useMemo(
    () => [...summary.payablesMonth]
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5),
    [summary.payablesMonth]
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
          <View style={s.grid}>
            <MetricCard
              label="A pagar neste mês"
              value={money(summary.payablesTotal)}
              note={`${summary.payablesMonth.length} lançamento${summary.payablesMonth.length === 1 ? '' : 's'} no período`}
            />
            <MetricCard
              label="Vencido"
              value={money(summary.overdueTotal)}
              note={`${summary.overdueCount} lançamento${summary.overdueCount === 1 ? '' : 's'} pendente${summary.overdueCount === 1 ? '' : 's'}`}
              tone={summary.overdueTotal > 0 ? 'warning' : 'default'}
            />
            <MetricCard
              label="A receber neste mês"
              value={money(summary.receivablesTotal)}
              note="Recebimentos em aberto no período"
            />
            <MetricCard
              label="Compromissos futuros"
              value={money(summary.futureTotal)}
              note={`${summary.futureCount} lançamento${summary.futureCount === 1 ? '' : 's'} após este mês`}
            />
          </View>

          <View>
            <Text style={styles.sectionTitle}>Rotinas financeiras</Text>
            <Text style={styles.sectionSubtitle}>Escolha a área que deseja administrar.</Text>
          </View>
          <View style={styles.moduleGrid}>
            {modules.map((module) => (
              <Pressable
                key={module.title}
                style={styles.moduleCard}
                onPress={() => router.push(module.route as never)}
              >
                <View style={[styles.moduleIcon, { backgroundColor: module.background }]}>
                  <Feather name={module.icon as any} size={20} color={module.color} />
                </View>
                <View style={styles.moduleContent}>
                  <Text style={styles.moduleTitle}>{module.title}</Text>
                  <Text style={styles.moduleDescription}>{module.description}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={theme.colors.muted} />
              </Pressable>
            ))}
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <View>
                <Text style={styles.panelTitle}>Próximas contas a pagar</Text>
                <Text style={styles.panelSubtitle}>Vencimentos em {monthName(month)}</Text>
              </View>
              <Pressable onPress={() => router.push('/payables')}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>Ver todas</Text>
              </Pressable>
            </View>
            {nextPayables.length ? nextPayables.map((entry) => (
              <View key={String(entry.id)} style={styles.payableRow}>
                <View style={[styles.dueIcon, entry.status === 'overdue' && styles.dueIconDanger]}>
                  <Feather name="calendar" size={15} color={entry.status === 'overdue' ? theme.colors.danger : theme.colors.muted} />
                </View>
                <View style={styles.payableMain}>
                  <Text style={styles.payableName}>{entry.description}</Text>
                  <Text style={styles.payableMeta}>
                    {entry.category} • vence {dateLabel(entry.due_date)}{entry.recurring_rule_id ? ' • recorrente' : ''}
                  </Text>
                </View>
                <Text style={styles.payableAmount}>{money(entry.amount)}</Text>
              </View>
            )) : (
              <Text style={s.empty}>Nenhuma conta pendente com vencimento neste mês.</Text>
            )}
          </View>
        </>
      )}
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
    padding: 16,
  },
  eyebrow: { color: theme.colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  periodTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 3 },
  periodNote: { color: theme.colors.muted, fontSize: 12 },
  sectionTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 18 },
  sectionSubtitle: { color: theme.colors.muted, fontSize: 12.5, marginTop: 3 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moduleCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 280,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 12,
    minHeight: 94,
    padding: 16,
  },
  moduleIcon: { alignItems: 'center', borderRadius: 10, height: 42, justifyContent: 'center', width: 42 },
  moduleContent: { flex: 1 },
  moduleTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '900' },
  moduleDescription: { color: theme.colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  panel: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  panelHead: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 16 },
  panelTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 16 },
  panelSubtitle: { color: theme.colors.muted, fontSize: 11.5, marginTop: 3 },
  seeAll: { fontSize: 12, fontWeight: '900' },
  payableRow: { alignItems: 'center', borderTopColor: '#ECEAE5', borderTopWidth: 1, flexDirection: 'row', gap: 11, padding: 14 },
  dueIcon: { alignItems: 'center', backgroundColor: '#F1F0EC', borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  dueIconDanger: { backgroundColor: '#FDECEC' },
  payableMain: { flex: 1 },
  payableName: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  payableMeta: { color: theme.colors.muted, fontSize: 10.5, marginTop: 3 },
  payableAmount: { color: theme.colors.text, fontSize: 13, fontWeight: '900' },
});
