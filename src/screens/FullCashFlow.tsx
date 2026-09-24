import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AccountPicker } from '@/components/AccountPicker';
import { AdminShell } from '@/components/AdminShell';
import { Notice, formStyles as s } from '@/components/FormKit';
import { PeriodCalendar } from '@/components/PeriodCalendar';
import { getCashFlow } from '@/services/fullApi';
import { theme, useThemeColors } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const flowColors = {
  realizedIn: '#25835A',
  forecastIn: '#9BBEAA',
  realizedOut: '#C84E4E',
  forecastOut: '#C9CFD6',
  balance: '#3568B8',
  category: '#3F6F8F',
};

const isoFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentMonthString = () => new Date().toISOString().slice(0, 7);

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return {
    start: isoFromDate(new Date(y, m - 1, 1)),
    end: isoFromDate(new Date(y, m, 0)),
  };
};

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} (${weekday})`;
};

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

type FlowItem = {
  kind: 'in' | 'out';
  realized: boolean;
  label: string;
  amount: number;
  category?: string;
};

type FlowDay = {
  date: string;
  opening_balance_realized?: number;
  opening_balance_projected?: number;
  realized_in: number;
  forecast_in: number;
  realized_out: number;
  forecast_out: number;
  realized_net?: number;
  projected_net?: number;
  realized_balance?: number;
  projected_balance?: number;
  balance: number;
  items: FlowItem[];
};

type CashFlowData = {
  start: string;
  end: string;
  clamped: boolean;
  opening_balance: number;
  opening_date: string;
  realized_closing_balance?: number;
  closing_balance: number;
  has_negative_day: boolean;
  no_accounts?: boolean;
  last_sync_at?: string;
  account_id?: number | null;
  accounts?: Array<{ id: number; name: string }>;
  totals: {
    realized_in: number;
    forecast_in: number;
    realized_out: number;
    forecast_out: number;
    net: number;
  };
  rows: FlowDay[];
};

export default function FullCashFlow() {
  const { width } = useWindowDimensions();
  const mobile = width < 1100;
  const compact = width < 1040;
  const colors = useThemeColors();
  const initialRange = monthRange(currentMonthString());
  const [appliedStart, setAppliedStart] = useState(initialRange.start);
  const [appliedEnd, setAppliedEnd] = useState(initialRange.end);
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const requestSequence = useRef(0);

  async function load(start: string, end: string, accId: number | null = accountId) {
    const sequence = ++requestSequence.current;
    try {
      setLoading(true);
      setError('');
      const result = await getCashFlow(start, end, accId);
      if (sequence !== requestSequence.current) return;
      setData(result);
      setExpandedDays(Object.fromEntries(
        (result.rows || [])
          .filter((day: FlowDay) => (day.items || []).length > 0)
          .map((day: FlowDay) => [day.date, true])
      ));
    } catch (e: any) {
      if (sequence !== requestSequence.current) return;
      setError(e?.message || 'Não foi possível carregar o fluxo de caixa.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    load(appliedStart, appliedEnd, accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedStart, appliedEnd, accountId]);

  function changeAccount(value: string) {
    const nextId = value ? Number(value) : null;
    setAccountId(nextId);
  }

  const totalIn = data?.totals ? data.totals.realized_in + data.totals.forecast_in : 0;
  const totalOut = data?.totals ? data.totals.realized_out + data.totals.forecast_out : 0;
  const firstDay = data?.rows?.[0];
  const periodOpeningBalance = firstDay
    ? firstDay.opening_balance_projected
      ?? firstDay.balance
        - firstDay.realized_in
        - firstDay.forecast_in
        + firstDay.realized_out
        + firstDay.forecast_out
    : data?.opening_balance || 0;
  const todayIso = isoFromDate(new Date());

  const byCategory = useMemo(() => {
    if (!data?.rows) return [];
    const groups: Record<string, { in: number; out: number; inForecast: number; outForecast: number }> = {};
    for (const day of data.rows) {
      for (const item of day.items || []) {
        const key = item.category || 'Sem categoria';
        const g = groups[key] || { in: 0, out: 0, inForecast: 0, outForecast: 0 };
        if (item.kind === 'in') {
          if (item.realized) g.in += item.amount;
          else g.inForecast += item.amount;
        } else {
          if (item.realized) g.out += item.amount;
          else g.outForecast += item.amount;
        }
        groups[key] = g;
      }
    }
    return Object.entries(groups).map(([category, v]) => ({
      category,
      ...v,
      totalIn: v.in + v.inForecast,
      totalOut: v.out + v.outForecast,
      net: v.in + v.inForecast - v.out - v.outForecast,
    }));
  }, [data]);

  const expenseCategories = useMemo(
    () => byCategory.filter((item) => item.totalOut > 0).sort((a, b) => b.totalOut - a.totalOut),
    [byCategory]
  );

  const periodInsights = useMemo(() => {
    const rows = data?.rows || [];
    const projectedBalance = (row: FlowDay) => row.projected_balance ?? row.balance;
    const negativeRows = rows.filter((row) => projectedBalance(row) < 0);
    const lowest = rows.reduce<FlowDay | null>(
      (current, row) => (!current || projectedBalance(row) < projectedBalance(current) ? row : current),
      null
    );
    const highestOut = rows.reduce<FlowDay | null>((current, row) => {
      const value = row.realized_out + row.forecast_out;
      const currentValue = current ? current.realized_out + current.forecast_out : -1;
      return value > currentValue ? row : current;
    }, null);
    return { negativeRows, lowest, highestOut };
  }, [data]);

  const chartRows = useMemo(() => {
    const rows = data?.rows || [];
    if (rows.length <= 18) return rows;
    const step = Math.ceil(rows.length / 18);
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1);
  }, [data]);

  const maxChartMovement = useMemo(
    () => Math.max(1, ...chartRows.flatMap((row) => [
      row.realized_in + row.forecast_in,
      row.realized_out + row.forecast_out,
    ])),
    [chartRows]
  );

  const maxExpenseCategory = expenseCategories[0]?.totalOut || 1;

  function toggleDay(date: string) {
    setExpandedDays((current) => ({ ...current, [date]: !current[date] }));
  }

  return (
    <AdminShell
      title="Fluxo de Caixa"
      subtitle="Posição financeira, projeções e riscos do período"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(data.last_sync_at).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={() => load(appliedStart, appliedEnd, accountId)}
      headerActions={null}
    >
      {!!error && <Notice text={error} tone="error" />}

      {!!data?.no_accounts && (
        <Notice
          text="Nenhuma conta cadastrada ainda. Vá em Financeiro → Contas para cadastrar a primeira conta e liberar o fluxo de caixa."
          tone="error"
        />
      )}

      <View style={styles.filterCard}>
        <View style={[styles.filterTop, mobile && styles.filterTopMobile]}>
          <View>
            <Text style={styles.sectionEyebrow}>FILTROS</Text>
            <Text style={styles.filterTitle}>Período e conta financeira</Text>
          </View>

          <PeriodCalendar
            start={appliedStart}
            end={appliedEnd}
            label="Período do fluxo"
            compact
            onApply={(start, end) => {
              setAppliedStart(start);
              setAppliedEnd(end);
            }}
          />
        </View>

        {!data?.no_accounts && (data?.accounts || []).length > 0 && (
          <AccountPicker
            label="Conta"
            options={(data?.accounts || []).map((account) => ({
              label: account.name,
              value: String(account.id),
            }))}
            value={accountId != null ? String(accountId) : ''}
            onChange={changeAccount}
            emptyLabel="Todas as contas"
          />
        )}

      </View>

      {!!data && !data.no_accounts && data.clamped && (
        <Notice text={`O saldo desta conta começa em ${isoToBR(data.opening_date)}. Datas anteriores foram desconsideradas.`} />
      )}

      {!!data && !data.no_accounts && (
        <>
          <View style={[styles.executiveGrid, compact && styles.executiveGridCompact]}>
            <View style={[styles.balanceHero, compact && styles.balanceHeroCompact]}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Feather name="trending-up" size={18} color="#FFFFFF" />
                </View>
                <View style={[
                  styles.healthBadge,
                  data.has_negative_day ? styles.healthBadgeDanger : styles.healthBadgeOk,
                ]}>
                  <View style={[
                    styles.healthDot,
                    { backgroundColor: data.has_negative_day ? '#F09A9D' : '#86D8A3' },
                  ]} />
                  <Text style={styles.healthBadgeText}>
                    {data.has_negative_day ? 'Requer atenção' : 'Caixa saudável'}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroLabel}>Saldo projetado no fim do período</Text>
              <Text style={[styles.heroValue, data.closing_balance < 0 && styles.heroValueDanger]}>
                {money(data.closing_balance)}
              </Text>
              <View style={styles.heroDivider} />
              <View style={styles.heroFooter}>
                <View>
                  <Text style={styles.heroMetaLabel}>Saldo no início do período</Text>
                  <Text style={styles.heroMetaValue}>{money(periodOpeningBalance)}</Text>
                </View>
                <View style={styles.heroFooterRight}>
                  <Text style={styles.heroMetaLabel}>Saldo realizado ao final</Text>
                  <Text style={[styles.heroMetaValue, Number(data.realized_closing_balance ?? 0) < 0 && styles.heroValueDanger]}>
                    {money(data.realized_closing_balance ?? data.opening_balance)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.metricGrid}>
              {[
                { label: 'Entradas realizadas', value: data.totals.realized_in, icon: 'arrow-down-left', tone: 'in' },
                { label: 'Entradas previstas', value: data.totals.forecast_in, icon: 'clock', tone: 'forecastIn' },
                { label: 'Saídas realizadas', value: data.totals.realized_out, icon: 'arrow-up-right', tone: 'out' },
                { label: 'Saídas previstas', value: data.totals.forecast_out, icon: 'calendar', tone: 'forecastOut' },
              ].map((metric) => {
                const isIn = metric.tone === 'in' || metric.tone === 'forecastIn';
                const isForecast = metric.tone === 'forecastIn' || metric.tone === 'forecastOut';
                const iconColor = isIn ? flowColors.realizedIn : flowColors.realizedOut;
                return (
                  <View key={metric.label} style={[styles.metricCard, mobile && styles.metricCardMobile]}>
                    <View style={[styles.metricIcon, { backgroundColor: isIn ? '#EAF7F0' : '#FDEBEC' }]}>
                      <Feather name={metric.icon as any} size={16} color={iconColor} />
                    </View>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <Text style={styles.metricValue}>{money(metric.value)}</Text>
                    <Text style={styles.metricNote}>{isForecast ? 'Ainda não liquidado' : 'Movimentação confirmada'}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {data.has_negative_day && (
            <View style={styles.riskBanner}>
              <View style={styles.riskIcon}>
                <Feather name="alert-triangle" size={18} color={theme.colors.danger} />
              </View>
              <View style={styles.riskTextArea}>
                <Text style={styles.riskTitle}>Risco de saldo negativo identificado</Text>
                <Text style={styles.riskText}>
                  O caixa fica negativo em {periodInsights.negativeRows.length} {periodInsights.negativeRows.length === 1 ? 'dia' : 'dias'} do período. O menor saldo projetado é {money(periodInsights.lowest ? (periodInsights.lowest.projected_balance ?? periodInsights.lowest.balance) : 0)} em {periodInsights.lowest ? isoToBR(periodInsights.lowest.date) : '—'}.
                </Text>
              </View>
            </View>
          )}

          <View style={[styles.analysisGrid, compact && styles.analysisGridCompact]}>
            <View style={[styles.panel, styles.chartPanel]}>
              <View style={[styles.panelHead, styles.chartPanelHead, mobile && styles.panelHeadMobile]}>
                <View>
                  <Text style={styles.panelTitle}>Entradas e saídas por dia</Text>
                  <Text style={styles.panelSubtitle}>Movimentação total, incluindo valores previstos</Text>
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: flowColors.realizedIn }]} /><Text style={styles.legendText}>Recebido</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: flowColors.forecastIn }]} /><Text style={styles.legendText}>A receber</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: flowColors.realizedOut }]} /><Text style={styles.legendText}>Pago</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: flowColors.forecastOut }]} /><Text style={styles.legendText}>A pagar</Text></View>
                </View>
              </View>

              {chartRows.length === 0 ? (
                <Text style={s.empty}>Sem movimentação no período.</Text>
              ) : (
                <View style={styles.chartArea}>
                  <View style={[styles.chartGridLine, { bottom: 24 }]} />
                  <View style={[styles.chartGridLine, { bottom: 76 }]} />
                  <View style={[styles.chartGridLine, { bottom: 128 }]} />
                  {chartRows.map((day, index) => {
                    const dayIn = day.realized_in + day.forecast_in;
                    const dayOut = day.realized_out + day.forecast_out;
                    const inHeight = dayIn > 0 ? Math.max(5, (dayIn / maxChartMovement) * 104) : 0;
                    const outHeight = dayOut > 0 ? Math.max(5, (dayOut / maxChartMovement) * 104) : 0;
                    const realizedInHeight = dayIn > 0 ? (day.realized_in / dayIn) * inHeight : 0;
                    const forecastInHeight = dayIn > 0 ? (day.forecast_in / dayIn) * inHeight : 0;
                    const realizedOutHeight = dayOut > 0 ? (day.realized_out / dayOut) * outHeight : 0;
                    const forecastOutHeight = dayOut > 0 ? (day.forecast_out / dayOut) * outHeight : 0;
                    return (
                      <View key={day.date} style={styles.chartColumn}>
                        <View style={styles.bars}>
                          <View style={[styles.chartBarStack, { height: inHeight }]}>
                            {forecastInHeight > 0 && <View style={{ height: Math.max(3, forecastInHeight), backgroundColor: flowColors.forecastIn }} />}
                            {realizedInHeight > 0 && <View style={{ height: Math.max(3, realizedInHeight), backgroundColor: flowColors.realizedIn }} />}
                          </View>
                          <View style={[styles.chartBarStack, { height: outHeight }]}>
                            {forecastOutHeight > 0 && <View style={{ height: Math.max(3, forecastOutHeight), backgroundColor: flowColors.forecastOut }} />}
                            {realizedOutHeight > 0 && <View style={{ height: Math.max(3, realizedOutHeight), backgroundColor: flowColors.realizedOut }} />}
                          </View>
                        </View>
                        <Text style={styles.chartDate}>{index % 2 === 0 || chartRows.length < 10 ? day.date.slice(8) : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={styles.chartSummary}>
                <Text style={styles.chartSummaryText}>Entradas {money(totalIn)}</Text>
                <Text style={styles.chartSummaryDivider}>•</Text>
                <Text style={styles.chartSummaryText}>Saídas {money(totalOut)}</Text>
              </View>
            </View>

            <View style={[styles.panel, styles.insightPanel]}>
              <Text style={styles.panelTitle}>Indicadores do período</Text>
              <Text style={styles.panelSubtitle}>Pontos que exigem acompanhamento</Text>
              <View style={styles.insightList}>
                <View style={styles.insightRow}>
                  <View style={[styles.insightIcon, { backgroundColor: '#F1F0EC' }]}><Feather name="trending-down" size={17} color={theme.colors.text} /></View>
                  <View style={styles.insightContent}><Text style={styles.insightLabel}>Menor saldo projetado</Text><Text style={[styles.insightValue, Number(periodInsights.lowest ? (periodInsights.lowest.projected_balance ?? periodInsights.lowest.balance) : 0) < 0 && styles.negative]}>{money(periodInsights.lowest ? (periodInsights.lowest.projected_balance ?? periodInsights.lowest.balance) : 0)}</Text><Text style={styles.insightDate}>{periodInsights.lowest ? isoToBR(periodInsights.lowest.date) : 'Sem dados'}</Text></View>
                </View>
                <View style={styles.insightRow}>
                  <View style={[styles.insightIcon, { backgroundColor: '#FDECEC' }]}><Feather name="alert-circle" size={17} color={theme.colors.danger} /></View>
                  <View style={styles.insightContent}><Text style={styles.insightLabel}>Dias com saldo negativo</Text><Text style={[styles.insightValue, periodInsights.negativeRows.length > 0 && styles.negative]}>{periodInsights.negativeRows.length}</Text><Text style={styles.insightDate}>{periodInsights.negativeRows.length ? 'Revisar pagamentos e recebimentos' : 'Nenhum risco no período'}</Text></View>
                </View>
                <View style={styles.insightRow}>
                  <View style={[styles.insightIcon, { backgroundColor: '#FFF4E5' }]}><Feather name="arrow-up-right" size={17} color="#A96213" /></View>
                  <View style={styles.insightContent}><Text style={styles.insightLabel}>Maior volume de saídas</Text><Text style={styles.insightValue}>{money(periodInsights.highestOut ? periodInsights.highestOut.realized_out + periodInsights.highestOut.forecast_out : 0)}</Text><Text style={styles.insightDate}>{periodInsights.highestOut ? isoToBR(periodInsights.highestOut.date) : 'Sem dados'}</Text></View>
                </View>
              </View>
            </View>
          </View>

          {expenseCategories.length > 0 && (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <View>
                  <Text style={styles.panelTitle}>Maiores saídas por categoria</Text>
                  <Text style={styles.panelSubtitle}>Categorias com maior impacto no caixa do período</Text>
                </View>
                <Text style={styles.panelTotal}>Total {money(totalOut)}</Text>
              </View>
              <View style={styles.categoryGrid}>
                {expenseCategories.slice(0, 8).map((category) => (
                  <View key={category.category} style={[styles.categoryItem, mobile && styles.categoryItemMobile]}>
                    <View style={styles.categoryTop}>
                      <Text style={styles.categoryName} numberOfLines={1}>{category.category}</Text>
                      <Text style={styles.categoryValue}>{money(category.totalOut)}</Text>
                    </View>
                    <View style={styles.categoryTrack}>
                      <View style={[styles.categoryFill, { width: `${Math.max(4, (category.totalOut / maxExpenseCategory) * 100)}%`, backgroundColor: flowColors.category }]} />
                    </View>
                    {category.outForecast > 0 && <Text style={styles.categoryForecast}>{money(category.outForecast)} previsto</Text>}
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.panel}>
            <View style={[styles.panelHead, mobile && styles.panelHeadMobile]}>
              <View>
                <Text style={styles.panelTitle}>Movimentação diária</Text>
                <Text style={styles.panelSubtitle}>
                  {data.start === data.end ? isoToBR(data.start) : `${isoToBR(data.start)} a ${isoToBR(data.end)}`}
                </Text>
              </View>
              <View style={styles.periodPill}><Feather name="calendar" size={13} color={theme.colors.muted} /><Text style={styles.periodPillText}>{data.rows.length} dias</Text></View>
            </View>

            {!mobile && data.rows.length > 0 && (
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadText, styles.dateColumn]}>DATA</Text>
                <Text style={[styles.tableHeadText, styles.numberColumn]}>ENTRADAS</Text>
                <Text style={[styles.tableHeadText, styles.numberColumn]}>SAÍDAS</Text>
                <Text style={[styles.tableHeadText, styles.numberColumn]}>RESULTADO DO DIA</Text>
                <Text style={[styles.tableHeadText, styles.balanceColumn]}>SALDO REALIZADO</Text>
                <Text style={[styles.tableHeadText, styles.balanceColumn]}>SALDO PROJETADO</Text>
                <View style={styles.expandColumn} />
              </View>
            )}

            {data.rows.length === 0 ? (
              <Text style={s.empty}>Sem movimentação no período.</Text>
            ) : (
              data.rows.map((day) => {
                const totalDayIn = day.realized_in + day.forecast_in;
                const totalDayOut = day.realized_out + day.forecast_out;
                const projectedNet = day.projected_net ?? totalDayIn - totalDayOut;
                const realizedBalance = day.realized_balance ?? day.balance;
                const projectedBalance = day.projected_balance ?? day.balance;
                const items = day.items || [];
                const expanded = !!expandedDays[day.date];
                return (
                  <View key={day.date} style={[styles.tableGroup, day.date === todayIso && styles.todayGroup]}>
                    <Pressable disabled={!items.length} onPress={() => toggleDay(day.date)} style={[styles.tableRow, mobile && styles.tableRowMobile]}>
                      <View style={[styles.dateColumn, mobile && styles.mobileDateColumn]}>
                        <Text style={styles.tableDate}>{dayLabel(day.date)}</Text>
                        <View style={styles.rowMetaLine}>
                          {day.date === todayIso && <Text style={[styles.todayBadge, { color: colors.primary }]}>HOJE</Text>}
                          <Text style={styles.itemCount}>{items.length ? `${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'}` : 'Sem lançamentos'}</Text>
                        </View>
                      </View>

                      {mobile ? (
                        <View style={styles.mobileValues}>
                          <View style={styles.mobileValue}><Text style={styles.mobileValueLabel}>Entradas</Text><Text style={styles.inValue}>{money(totalDayIn)}</Text></View>
                          <View style={styles.mobileValue}><Text style={styles.mobileValueLabel}>Saídas</Text><Text style={styles.outValue}>{money(totalDayOut)}</Text></View>
                          <View style={styles.mobileValue}><Text style={styles.mobileValueLabel}>Resultado do dia</Text><Text style={[styles.balanceValue, projectedNet < 0 && styles.negative]}>{money(projectedNet)}</Text></View>
                          <View style={styles.mobileValue}><Text style={styles.mobileValueLabel}>Saldo realizado</Text><Text style={[styles.balanceValue, realizedBalance < 0 && styles.negative]}>{money(realizedBalance)}</Text></View>
                          <View style={styles.mobileValue}><Text style={styles.mobileValueLabel}>Saldo projetado</Text><Text style={[styles.balanceValue, projectedBalance < 0 && styles.negative]}>{money(projectedBalance)}</Text></View>
                        </View>
                      ) : (
                        <>
                          <Text style={[styles.tableValue, styles.numberColumn, styles.inValue]}>{totalDayIn ? `+${money(totalDayIn)}` : '—'}</Text>
                          <Text style={[styles.tableValue, styles.numberColumn, styles.outValue]}>{totalDayOut ? `-${money(totalDayOut)}` : '—'}</Text>
                          <Text style={[styles.tableValue, styles.numberColumn, projectedNet < 0 ? styles.negative : styles.forecastValue]}>{projectedNet ? `${projectedNet > 0 ? '+' : ''}${money(projectedNet)}` : '—'}</Text>
                          <Text style={[styles.tableValue, styles.balanceColumn, styles.balanceValue, realizedBalance < 0 && styles.negative]}>{money(realizedBalance)}</Text>
                          <Text style={[styles.tableValue, styles.balanceColumn, styles.balanceValue, projectedBalance < 0 && styles.negative]}>{money(projectedBalance)}</Text>
                        </>
                      )}

                      <View style={styles.expandColumn}>
                        {items.length > 0 && <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.muted} />}
                      </View>
                    </Pressable>

                    {expanded && items.length > 0 && (
                      <View style={styles.itemList}>
                        {items.map((item, index) => (
                          <View key={`${day.date}-${index}`} style={[styles.itemRow, mobile && styles.itemRowMobile]}>
                            <View style={[styles.itemDirection, item.kind === 'in' ? styles.itemDirectionIn : styles.itemDirectionOut]}>
                              <Feather name={item.kind === 'in' ? 'arrow-down-left' : 'arrow-up-right'} size={14} color={item.kind === 'in' ? theme.colors.success : theme.colors.danger} />
                            </View>
                            <View style={styles.itemMain}>
                              <Text style={styles.itemLabel} numberOfLines={1}>{item.label}</Text>
                              <View style={styles.itemMeta}>
                                <Text style={styles.itemCategory}>{item.category || 'Sem categoria'}</Text>
                                <Text style={[styles.statusBadge, item.realized ? styles.statusRealized : styles.statusForecast]}>{item.realized ? 'REALIZADO' : 'PREVISTO'}</Text>
                              </View>
                            </View>
                            <Text style={[styles.itemAmount, item.kind === 'in' ? styles.itemAmountIn : styles.itemAmountOut]}>{item.kind === 'in' ? '+' : '-'}{money(item.amount)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
            <View style={styles.tableFoot}>
              <Feather name="info" size={14} color={theme.colors.muted} />
              <Text style={styles.tableFootText}>O saldo final considera valores realizados e previstos até cada data.</Text>
            </View>
          </View>
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  filterCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 18,
    gap: 16,
  },
  filterTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  filterTopMobile: { alignItems: 'flex-start', flexDirection: 'column' },
  sectionEyebrow: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 1.1,
  },
  filterTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    marginTop: 3,
  },
  modeSwitch: {
    backgroundColor: '#F0EFEA',
    borderRadius: 10,
    flexDirection: 'row',
    padding: 3,
  },
  modeButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  modeButtonText: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 12 },
  modeButtonTextActive: { color: '#FFFFFF' },
  monthNav: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  monthArrow: {
    alignItems: 'center',
    backgroundColor: '#F3F1EC',
    borderRadius: 9,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  monthTextArea: { minWidth: 170 },
  monthCaption: { color: theme.colors.muted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  monthLabel: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 16, marginTop: 1 },
  currentMonthButton: {
    borderColor: theme.colors.border,
    borderRadius: 9,
    borderWidth: 1,
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  currentMonthButtonText: { color: theme.colors.text, fontSize: 12, fontWeight: '600' },
  customArea: { gap: 8 },
  dateFields: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dateField: { flex: 1, minWidth: 150 },
  dateLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 5 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  periodError: { color: theme.colors.danger, fontSize: 13, fontWeight: '700' },
  applyButton: { borderRadius: 10, justifyContent: 'center', minHeight: 43, paddingHorizontal: 18 },
  applyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  executiveGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 12 },
  executiveGridCompact: { flexDirection: 'column' },
  balanceHero: {
    backgroundColor: '#243447',
    borderRadius: theme.radius.md,
    flex: 0.95,
    justifyContent: 'space-between',
    minHeight: 214,
    minWidth: 330,
    padding: 18,
  },
  balanceHeroCompact: { minWidth: 0 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  healthBadge: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  healthBadgeOk: { backgroundColor: 'rgba(47,125,74,0.25)' },
  healthBadgeDanger: { backgroundColor: 'rgba(166,61,64,0.3)' },
  healthDot: { borderRadius: 4, height: 7, width: 7 },
  healthBadgeText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '600' },
  heroLabel: { color: '#AEB9C3', fontSize: 12.5, fontWeight: '700', marginTop: 22 },
  heroValue: { color: '#FFFFFF', fontFamily: 'Sora_700Bold', fontSize: 26, marginTop: 5 },
  heroValueDanger: { color: '#FFB2B4' },
  heroDivider: { backgroundColor: 'rgba(255,255,255,0.12)', height: 1, marginVertical: 19 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  heroFooterRight: { alignItems: 'flex-end' },
  heroMetaLabel: { color: '#91A0AD', fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  heroMetaValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 4 },
  metricGrid: { flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 96,
    minWidth: 205,
    padding: 13,
  },
  metricCardMobile: { minWidth: '100%' },
  metricIcon: { alignItems: 'center', borderRadius: 8, height: 30, justifyContent: 'center', width: 30 },
  metricLabel: { color: theme.colors.muted, fontSize: 10.5, fontWeight: '600', marginTop: 8 },
  metricValue: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 3 },
  metricNote: { color: theme.colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11.5, marginTop: 3 },

  riskBanner: {
    alignItems: 'center',
    backgroundColor: '#FFF4F3',
    borderColor: '#F1CDCE',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  riskIcon: { alignItems: 'center', backgroundColor: '#FDE4E5', borderRadius: 9, height: 36, justifyContent: 'center', width: 36 },
  riskTextArea: { flex: 1 },
  riskTitle: { color: theme.colors.danger, fontSize: 13, fontWeight: '700' },
  riskText: { color: '#784749', fontSize: 12.5, lineHeight: 18, marginTop: 2 },

  analysisGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 12 },
  analysisGridCompact: { flexDirection: 'column' },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  insightPanel: { flex: 0.9, minWidth: 275, padding: 18 },
  panelHead: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 14, padding: 18 },
  chartPanel: { flex: 2.1, minHeight: 286, padding: 18 },
  chartPanelHead: { padding: 0 },
  panelHeadMobile: { flexDirection: 'column' },
  panelTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 16 },
  panelSubtitle: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  panelTotal: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 3, height: 7, width: 7 },
  legendText: { color: theme.colors.muted, fontSize: 10.5, fontWeight: '700' },
  chartArea: { alignItems: 'flex-end', flexDirection: 'row', height: 155, marginTop: 24, paddingBottom: 25, position: 'relative' },
  chartGridLine: { backgroundColor: '#ECEFF2', height: 1, left: 0, position: 'absolute', right: 0 },
  chartColumn: { alignItems: 'center', flex: 1, height: 130, justifyContent: 'flex-end', minWidth: 16 },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 106 },
  chartBarStack: { borderRadius: 4, justifyContent: 'flex-end', minWidth: 5, overflow: 'hidden', width: 9 },
  chartDate: { color: theme.colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 11, height: 18, marginTop: 5 },
  chartSummary: { borderTopColor: '#EEECE7', borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingTop: 12 },
  chartSummaryText: { color: theme.colors.muted, fontSize: 11.5, fontWeight: '700' },
  chartSummaryDivider: { color: '#C2C0BA', fontSize: 11 },
  insightList: { gap: 4, marginTop: 14 },
  insightRow: { alignItems: 'center', borderTopColor: '#EFEEE9', borderTopWidth: 1, flexDirection: 'row', gap: 11, paddingVertical: 13 },
  insightIcon: { alignItems: 'center', borderRadius: 9, height: 36, justifyContent: 'center', width: 36 },
  insightContent: { flex: 1 },
  insightLabel: { color: theme.colors.muted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  insightValue: { color: theme.colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  insightDate: { color: theme.colors.muted, fontSize: 10.5, marginTop: 2 },
  negative: { color: theme.colors.danger },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingBottom: 20, paddingHorizontal: 18 },
  categoryItem: { flexBasis: '47%', flexGrow: 1, minWidth: 260 },
  categoryItemMobile: { minWidth: '100%' },
  categoryTop: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  categoryName: { color: theme.colors.text, flex: 1, fontSize: 12.5, fontWeight: '600' },
  categoryValue: { color: theme.colors.text, fontSize: 12.5, fontWeight: '700' },
  categoryTrack: { backgroundColor: '#EEEDE8', borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' },
  categoryFill: { borderRadius: 4, height: '100%' },
  categoryForecast: { color: theme.colors.muted, fontSize: 10.5, marginTop: 5 },

  periodPill: { alignItems: 'center', backgroundColor: '#F3F2EE', borderRadius: 16, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  periodPillText: { color: theme.colors.muted, fontSize: 11, fontWeight: '600' },
  tableHeader: { backgroundColor: '#F7F6F3', borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10 },
  tableHeadText: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.3 },
  tableGroup: { borderBottomColor: '#ECEAE5', borderBottomWidth: 1 },
  todayGroup: { borderLeftColor: '#C9A548', borderLeftWidth: 3 },
  tableRow: { alignItems: 'center', flexDirection: 'row', minHeight: 68, paddingHorizontal: 16, paddingVertical: 10 },
  tableRowMobile: { alignItems: 'stretch', flexDirection: 'column', gap: 12 },
  dateColumn: { flex: 1.35, minWidth: 130 },
  mobileDateColumn: { minWidth: 0, width: '100%' },
  numberColumn: { flex: 1, minWidth: 100, textAlign: 'right' },
  balanceColumn: { flex: 1.1, minWidth: 115, textAlign: 'right' },
  expandColumn: { alignItems: 'flex-end', justifyContent: 'center', width: 32 },
  tableDate: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  rowMetaLine: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 4 },
  todayBadge: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.3 },
  itemCount: { color: theme.colors.muted, fontSize: 10.5 },
  tableValue: { color: theme.colors.text, fontSize: 12.5, fontWeight: '600' },
  inValue: { color: theme.colors.success },
  outValue: { color: theme.colors.danger },
  forecastValue: { color: '#4D6478' },
  balanceValue: { color: theme.colors.text, fontWeight: '700' },
  mobileValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' },
  mobileValue: { flex: 1, minWidth: 90 },
  mobileValueLabel: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 3, textTransform: 'uppercase' },
  itemList: { backgroundColor: '#FAF9F6', borderTopColor: '#ECEAE5', borderTopWidth: 1, paddingHorizontal: 18 },
  itemRow: { alignItems: 'center', borderBottomColor: '#EEECE8', borderBottomWidth: 1, flexDirection: 'row', gap: 11, paddingVertical: 11 },
  itemRowMobile: { alignItems: 'flex-start' },
  itemDirection: { alignItems: 'center', borderRadius: 8, height: 30, justifyContent: 'center', width: 30 },
  itemDirectionIn: { backgroundColor: '#EAF7EF' },
  itemDirectionOut: { backgroundColor: '#FDECEC' },
  itemMain: { flex: 1 },
  itemLabel: { color: theme.colors.text, fontSize: 12.5, fontWeight: '700' },
  itemMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  itemCategory: { color: theme.colors.muted, fontSize: 10.5 },
  statusBadge: { borderRadius: 8, fontFamily: 'Inter_700Bold', fontSize: 11, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  statusRealized: { backgroundColor: '#E8F4EC', color: theme.colors.success },
  statusForecast: { backgroundColor: '#ECEFF2', color: '#596B78' },
  itemAmount: { fontSize: 12.5, fontWeight: '700' },
  itemAmountIn: { color: theme.colors.success },
  itemAmountOut: { color: theme.colors.danger },
  tableFoot: { alignItems: 'center', backgroundColor: '#FAF9F6', flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingVertical: 11 },
  tableFootText: { color: theme.colors.muted, flex: 1, fontSize: 10.5 },
});
