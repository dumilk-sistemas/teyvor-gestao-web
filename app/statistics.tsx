import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AdminShell } from '@/components/AdminShell';
import { DateField } from '@/components/FormKit';
import { theme, useThemeColors } from '@/constants/theme';
import { getReports } from '@/services/api';
import { getFull } from '@/services/fullApi';
import type { ReportsData } from '@/types/api';

type Tab = 'day' | 'month' | 'year' | 'period';
type FeatherIconName = ComponentProps<typeof Feather>['name'];

type BarItem = {
  key: string;
  label: string;
  detailLabel: string;
  value: number;
  sales: number;
  ticket: number;
};

type Summary = {
  total: number;
  sales: number;
  ticket: number;
};

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const compactMoney = (value: number) => {
  const number = Number(value || 0);

  if (Math.abs(number) >= 1_000_000) {
    return `R$ ${(number / 1_000_000)
      .toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} mi`;
  }

  if (Math.abs(number) >= 1_000) {
    return `R$ ${(number / 1_000)
      .toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} mil`;
  }

  return money(number);
};

const isoFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day, 12, 0, 0);
};

const dateBR = (value: string) =>
  value
    ? parseIsoDate(value).toLocaleDateString('pt-BR')
    : '—';

const shortDateBR = (value: string) =>
  value
    ? parseIsoDate(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
    : '—';

const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

const shortMonthLabel = (year: number, month: number) =>
  new Date(year, month, 1)
    .toLocaleDateString('pt-BR', {
      month: 'short',
    })
    .replace('.', '');

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
};

const brToIso = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return '';
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};

const inputToIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : brToIso(value);

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);

  return next;
};

const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const addYears = (date: Date, amount: number) =>
  new Date(date.getFullYear() + amount, 0, 1);

const daysBetweenInclusive = (start: string, end: string) => {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const diff = endDate.getTime() - startDate.getTime();

  return Math.floor(diff / 86_400_000) + 1;
};

const dateRange = (start: string, end: string) => {
  const result: string[] = [];
  let cursor = parseIsoDate(start);
  const last = parseIsoDate(end);

  while (cursor <= last) {
    result.push(isoFromDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return result;
};

const validSale = (row: any) => {
  const status = String(row?.status || '').toLowerCase();

  return !status.includes('cancel') && !status.includes('exclu');
};

function summarizeRows(
  rows: Array<{
    date: string;
    sales: number;
    total: number;
    ticket?: number;
  }>,
  start: string,
  end: string
): Summary {
  const selected = rows.filter(
    (row) => row.date >= start && row.date <= end
  );

  const total = selected.reduce(
    (sum, row) => sum + Number(row.total || 0),
    0
  );

  const sales = selected.reduce(
    (sum, row) => sum + Number(row.sales || 0),
    0
  );

  return {
    total,
    sales,
    ticket: sales > 0 ? total / sales : 0,
  };
}

function comparisonText(current: number, previous: number) {
  if (previous === 0) {
    return current === 0
      ? 'Sem movimento no período anterior'
      : 'Sem base no período anterior';
  }

  const percent = ((current - previous) / previous) * 100;
  const sign = percent > 0 ? '+' : '';

  return `${sign}${percent.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}% vs. período anterior`;
}

function comparisonTone(current: number, previous: number) {
  if (previous === 0 || current === previous) {
    return 'neutral';
  }

  return current > previous ? 'positive' : 'negative';
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function yearStart(year: number) {
  return new Date(year, 0, 1);
}

function yearEnd(year: number) {
  return new Date(year, 11, 31);
}

export default function Statistics() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<ReportsData | null>(null);
  const [salesRows, setSalesRows] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<Tab>('day');

  const [dayCursor, setDayCursor] = useState(new Date());
  const [monthCursor, setMonthCursor] = useState(
    monthStart(new Date())
  );
  const [yearCursor, setYearCursor] = useState(
    yearStart(new Date().getFullYear())
  );

  const [periodStart, setPeriodStart] = useState(
    isoFromDate(addDays(new Date(), -29))
  );
  const [periodEnd, setPeriodEnd] = useState(
    isoFromDate(new Date())
  );

  const [periodStartInput, setPeriodStartInput] = useState(
    isoToBR(isoFromDate(addDays(new Date(), -29)))
  );
  const [periodEndInput, setPeriodEndInput] = useState(
    isoToBR(isoFromDate(new Date()))
  );

  const [periodError, setPeriodError] = useState('');
  const [periodNotice, setPeriodNotice] = useState('');
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const reportsResult = await getReports();

      // Vendas detalhadas só enriquecem os indicadores; perfis sem
      // acesso a Vendas ainda veem as estatísticas normalmente.
      const salesResult = await getFull('sales').catch(() => null);

      setData(reportsResult);
      setSalesRows(salesResult?.rows || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar estatísticas.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const todayIso = isoFromDate(new Date());

  const view = useMemo(() => {
    if (!data) {
      return {
        title: '',
        subtitle: '',
        chartTitle: '',
        summary: { total: 0, sales: 0, ticket: 0 },
        previous: { total: 0, sales: 0, ticket: 0 },
        bars: [] as BarItem[],
        start: '',
        end: '',
      };
    }

    const dailyRows = data.by_day || [];

    if (tab === 'day') {
      const selectedIso = isoFromDate(dayCursor);
      const previousIso = isoFromDate(addDays(dayCursor, -1));

      const summary = summarizeRows(
        dailyRows,
        selectedIso,
        selectedIso
      );

      const previous = summarizeRows(
        dailyRows,
        previousIso,
        previousIso
      );

      const hourly = new Map<
        number,
        { total: number; sales: number }
      >();

      for (let hour = 0; hour < 24; hour += 1) {
        hourly.set(hour, {
          total: 0,
          sales: 0,
        });
      }

      salesRows
        .filter(
          (row) =>
            validSale(row) &&
            String(row.date || '') === selectedIso
        )
        .forEach((row) => {
          const hour = Number(
            String(row.time || '00:00').slice(0, 2)
          );

          if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
            return;
          }

          const current = hourly.get(hour) || {
            total: 0,
            sales: 0,
          };

          current.total += Number(row.total || 0);
          current.sales += 1;
          hourly.set(hour, current);
        });

      const bars = Array.from(hourly.entries()).map(
        ([hour, item]) => ({
          key: `hour-${hour}`,
          label: `${String(hour).padStart(2, '0')}h`,
          detailLabel: `${String(hour).padStart(2, '0')}:00`,
          value: item.total,
          sales: item.sales,
          ticket:
            item.sales > 0 ? item.total / item.sales : 0,
        })
      );

      return {
        title: dateBR(selectedIso),
        subtitle: 'Resultado do dia',
        chartTitle: 'Faturamento por hora',
        summary,
        previous,
        bars,
        start: selectedIso,
        end: selectedIso,
      };
    }

    if (tab === 'month') {
      const startDate = monthStart(monthCursor);
      const naturalEnd = monthEnd(monthCursor);
      const currentMonth =
        monthCursor.getFullYear() === new Date().getFullYear() &&
        monthCursor.getMonth() === new Date().getMonth();

      const endDate = currentMonth ? new Date() : naturalEnd;

      const startIso = isoFromDate(startDate);
      const endIso = isoFromDate(endDate);

      const previousMonth = addMonths(monthCursor, -1);
      const previousStart = isoFromDate(monthStart(previousMonth));

      const previousNaturalEnd = monthEnd(previousMonth);
      const previousComparableEnd = currentMonth
        ? new Date(
            previousMonth.getFullYear(),
            previousMonth.getMonth(),
            Math.min(
              new Date().getDate(),
              previousNaturalEnd.getDate()
            )
          )
        : previousNaturalEnd;

      const previousEnd = isoFromDate(previousComparableEnd);

      const summary = summarizeRows(
        dailyRows,
        startIso,
        endIso
      );

      const previous = summarizeRows(
        dailyRows,
        previousStart,
        previousEnd
      );

      const byDate = new Map(
        dailyRows.map((row) => [row.date, row])
      );

      const bars = dateRange(startIso, endIso).map((date) => {
        const row = byDate.get(date);

        return {
          key: date,
          label: String(Number(date.slice(8, 10))),
          detailLabel: dateBR(date),
          value: Number(row?.total || 0),
          sales: Number(row?.sales || 0),
          ticket: Number(row?.ticket || 0),
        };
      });

      return {
        title: monthLabel(
          monthCursor.getFullYear(),
          monthCursor.getMonth()
        ),
        subtitle: 'Evolução diária do mês',
        chartTitle: 'Faturamento por dia',
        summary,
        previous,
        bars,
        start: startIso,
        end: endIso,
      };
    }

    if (tab === 'year') {
      const year = yearCursor.getFullYear();
      const currentYear = year === new Date().getFullYear();

      const startIso = isoFromDate(yearStart(year));
      const endIso = isoFromDate(
        currentYear ? new Date() : yearEnd(year)
      );

      const previousStart = isoFromDate(yearStart(year - 1));

      const previousComparableEnd = currentYear
        ? new Date(
            year - 1,
            new Date().getMonth(),
            Math.min(
              new Date().getDate(),
              new Date(
                year - 1,
                new Date().getMonth() + 1,
                0
              ).getDate()
            )
          )
        : yearEnd(year - 1);

      const previousEnd = isoFromDate(previousComparableEnd);

      const summary = summarizeRows(
        dailyRows,
        startIso,
        endIso
      );

      const previous = summarizeRows(
        dailyRows,
        previousStart,
        previousEnd
      );

      const lastMonth = currentYear
        ? new Date().getMonth()
        : 11;

      const bars: BarItem[] = [];

      for (let month = 0; month <= lastMonth; month += 1) {
        const start = isoFromDate(new Date(year, month, 1));
        const end = isoFromDate(
          monthEnd(new Date(year, month, 1))
        );

        const monthSummary = summarizeRows(
          dailyRows,
          start,
          end
        );

        bars.push({
          key: `${year}-${month}`,
          label: shortMonthLabel(year, month),
          detailLabel: monthLabel(year, month),
          value: monthSummary.total,
          sales: monthSummary.sales,
          ticket: monthSummary.ticket,
        });
      }

      return {
        title: String(year),
        subtitle: 'Evolução mensal do ano',
        chartTitle: 'Faturamento por mês',
        summary,
        previous,
        bars,
        start: startIso,
        end: endIso,
      };
    }

    const summary = summarizeRows(
      dailyRows,
      periodStart,
      periodEnd
    );

    const periodDays = daysBetweenInclusive(
      periodStart,
      periodEnd
    );

    const previousEndDate = addDays(
      parseIsoDate(periodStart),
      -1
    );

    const previousStartDate = addDays(
      previousEndDate,
      -(periodDays - 1)
    );

    const previous = summarizeRows(
      dailyRows,
      isoFromDate(previousStartDate),
      isoFromDate(previousEndDate)
    );

    const byDate = new Map(
      dailyRows.map((row) => [row.date, row])
    );

    let bars: BarItem[] = [];
    let chartTitle = 'Faturamento por dia';

    if (periodDays <= 62) {
      bars = dateRange(periodStart, periodEnd).map((date) => {
        const row = byDate.get(date);

        return {
          key: date,
          label: shortDateBR(date),
          detailLabel: dateBR(date),
          value: Number(row?.total || 0),
          sales: Number(row?.sales || 0),
          ticket: Number(row?.ticket || 0),
        };
      });
    } else {
      chartTitle = 'Faturamento por mês';

      const grouped = new Map<
        string,
        { total: number; sales: number }
      >();

      dailyRows
        .filter(
          (row) =>
            row.date >= periodStart &&
            row.date <= periodEnd
        )
        .forEach((row) => {
          const key = row.date.slice(0, 7);
          const current = grouped.get(key) || {
            total: 0,
            sales: 0,
          };

          current.total += Number(row.total || 0);
          current.sales += Number(row.sales || 0);
          grouped.set(key, current);
        });

      const startDate = parseIsoDate(periodStart);
      const endDate = parseIsoDate(periodEnd);

      let cursor = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        1
      );

      const endMonth = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        1
      );

      while (cursor <= endMonth) {
        const key = `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1
        ).padStart(2, '0')}`;

        const item = grouped.get(key) || {
          total: 0,
          sales: 0,
        };

        bars.push({
          key,
          label: shortMonthLabel(
            cursor.getFullYear(),
            cursor.getMonth()
          ),
          detailLabel: monthLabel(
            cursor.getFullYear(),
            cursor.getMonth()
          ),
          value: item.total,
          sales: item.sales,
          ticket:
            item.sales > 0 ? item.total / item.sales : 0,
        });

        cursor = addMonths(cursor, 1);
      }
    }

    return {
      title:
        periodStart === periodEnd
          ? dateBR(periodStart)
          : `${dateBR(periodStart)} a ${dateBR(periodEnd)}`,
      subtitle: 'Período personalizado',
      chartTitle,
      summary,
      previous,
      bars,
      start: periodStart,
      end: periodEnd,
    };
  }, [
    data,
    salesRows,
    tab,
    dayCursor,
    monthCursor,
    yearCursor,
    periodStart,
    periodEnd,
  ]);

  const maxBar = useMemo(
    () =>
      Math.max(
        1,
        ...view.bars.map((item) => Number(item.value || 0))
      ),
    [view.bars]
  );

  const bestBar = useMemo(() => {
    if (view.bars.length === 0) {
      return null;
    }

    return view.bars.reduce((best, item) =>
      item.value > best.value ? item : best
    );
  }, [view.bars]);

  const activeBars = useMemo(
    () => view.bars.filter((item) => item.value > 0),
    [view.bars]
  );

  const rankedBars = useMemo(
    () =>
      [...activeBars]
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [activeBars]
  );

  const averagePerActiveRange =
    activeBars.length > 0
      ? view.summary.total / activeBars.length
      : 0;

  const bestRangeShare =
    bestBar && view.summary.total > 0
      ? (bestBar.value / view.summary.total) * 100
      : 0;

  // Complementa o gráfico de evolução com um retrato do MESMO período:
  // pra onde o dinheiro entrou (formas de pagamento) e o que mais vendeu,
  // no mesmo espírito do "painel integrado" dos concorrentes.
  const periodInsights = useMemo(() => {
    if (!view.start || !view.end) {
      return { payments: [] as Array<{ method: string; total: number; percent: number }>, products: [] as Array<{ name: string; qty: number; revenue: number }> };
    }

    const rows = salesRows.filter(
      (row) => validSale(row) &&
        String(row.date || '') >= view.start &&
        String(row.date || '') <= view.end
    );

    const paymentTotals = new Map<string, number>();
    const productTotals = new Map<string, { name: string; qty: number; revenue: number }>();

    rows.forEach((row) => {
      const method = row.payment || 'Outros';
      paymentTotals.set(method, (paymentTotals.get(method) || 0) + Number(row.total || 0));

      (row.items_detail || []).forEach((item: any) => {
        const key = item.name || item.code || 'Produto';
        const current = productTotals.get(key) || { name: key, qty: 0, revenue: 0 };
        current.qty += Number(item.qty || 0);
        current.revenue += Number(item.qty || 0) * Number(item.price || 0);
        productTotals.set(key, current);
      });
    });

    const paymentSum = Array.from(paymentTotals.values()).reduce((sum, value) => sum + value, 0);

    const payments = Array.from(paymentTotals.entries())
      .map(([method, total]) => ({
        method,
        total,
        percent: paymentSum > 0 ? (total / paymentSum) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const products = Array.from(productTotals.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return { payments, products };
  }, [salesRows, view.start, view.end]);

  const canGoNext = useMemo(() => {
    const now = new Date();

    if (tab === 'day') {
      return isoFromDate(dayCursor) < isoFromDate(now);
    }

    if (tab === 'month') {
      const monthKey =
        monthCursor.getFullYear() * 12 +
        monthCursor.getMonth();

      return (
        monthKey <
        now.getFullYear() * 12 + now.getMonth()
      );
    }

    if (tab === 'year') {
      return yearCursor.getFullYear() < now.getFullYear();
    }

    return false;
  }, [tab, dayCursor, monthCursor, yearCursor]);

  function applyPeriod() {
    const start = inputToIso(periodStartInput.trim());
    const end = inputToIso(periodEndInput.trim());

    if (!start || !end) {
      setPeriodError(
        'Informe as datas no formato DD/MM/AAAA.'
      );
      setPeriodNotice('');
      return false;
    }

    if (start > end) {
      setPeriodError(
        'A data inicial não pode ser posterior à data final.'
      );
      setPeriodNotice('');
      return false;
    }

    if (end > todayIso) {
      setPeriodError(
        'A data final não pode ser posterior a hoje.'
      );
      setPeriodNotice('');
      return false;
    }

    setPeriodStart(start);
    setPeriodEnd(end);
    setPeriodError('');
    setPeriodNotice(
      `Período aplicado: ${isoToBR(start)} a ${isoToBR(end)}`
    );
    return true;
  }

  function setQuickPeriod(days: number) {
    const end = new Date();
    const start = addDays(end, -(days - 1));

    const startIso = isoFromDate(start);
    const endIso = isoFromDate(end);

    setPeriodStartInput(isoToBR(startIso));
    setPeriodEndInput(isoToBR(endIso));
    setPeriodStart(startIso);
    setPeriodEnd(endIso);
    setPeriodError('');
    setPeriodNotice(
      `Período aplicado: ${isoToBR(startIso)} a ${isoToBR(
        endIso
      )}`
    );
  }

  function currentMonthPeriod() {
    const now = new Date();
    const startIso = isoFromDate(monthStart(now));
    const endIso = isoFromDate(now);

    setPeriodStartInput(isoToBR(startIso));
    setPeriodEndInput(isoToBR(endIso));
    setPeriodStart(startIso);
    setPeriodEnd(endIso);
    setPeriodError('');
    setPeriodNotice(
      `Período aplicado: ${isoToBR(startIso)} a ${isoToBR(
        endIso
      )}`
    );
  }

  function previous() {
    if (tab === 'day') {
      setDayCursor((current) => addDays(current, -1));
      return;
    }

    if (tab === 'month') {
      setMonthCursor((current) => addMonths(current, -1));
      return;
    }

    if (tab === 'year') {
      setYearCursor((current) => addYears(current, -1));
    }
  }

  function next() {
    if (!canGoNext) {
      return;
    }

    if (tab === 'day') {
      setDayCursor((current) => addDays(current, 1));
      return;
    }

    if (tab === 'month') {
      setMonthCursor((current) => addMonths(current, 1));
      return;
    }

    if (tab === 'year') {
      setYearCursor((current) => addYears(current, 1));
    }
  }

  return (
    <AdminShell
      title="Estatísticas"
      subtitle="Análise de desempenho com evolução e comparação de períodos"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(
              data.last_sync_at
            ).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={load}
      headerActions={null}
    >
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.analysisPanel}>
        <View style={styles.analysisPanelHeader}>
          <View>
            <Text style={styles.analysisEyebrow}>JANELA DE ANÁLISE</Text>
            <Text style={styles.analysisTitle}>Compare o desempenho</Text>
          </View>

          <View style={styles.analysisStatus}>
            <View style={styles.analysisStatusDot} />
            <Text style={styles.analysisStatusText}>Dados consolidados</Text>
          </View>
        </View>

        <View style={styles.periodToolbar}>
          {tab !== 'period' && (
            <Pressable style={styles.arrowButton} onPress={previous} accessibilityLabel="Período anterior">
              <Feather name="chevron-left" size={18} color={theme.colors.text} />
            </Pressable>
          )}

          <View style={styles.periodMain}>
            <Text style={styles.periodCaption}>PERÍODO SELECIONADO</Text>
            <Text style={styles.periodTitle}>{view.title}</Text>
            <Text style={styles.periodSubtitle}>{view.subtitle}</Text>
          </View>

          {tab !== 'period' && (
            <Pressable
              disabled={!canGoNext}
              style={[styles.arrowButton, !canGoNext && styles.arrowButtonDisabled]}
              onPress={next}
              accessibilityLabel="Próximo período"
            >
              <Feather name="chevron-right" size={18} color={canGoNext ? theme.colors.text : '#B7BDC4'} />
            </Pressable>
          )}

          <Pressable style={styles.periodPickerButton} onPress={() => setPeriodPickerOpen(true)}>
            <Feather name="calendar" size={16} color="#3568B8" />
            <Text style={styles.periodPickerButtonText}>Alterar período</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={periodPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.periodModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Selecionar período</Text>
                <Text style={styles.modalSubtitle}>Escolha como deseja analisar e comparar os resultados.</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setPeriodPickerOpen(false)} accessibilityLabel="Fechar">
                <Feather name="x" size={21} color={theme.colors.muted} />
              </Pressable>
            </View>

            <View style={styles.tabs}>
              <TabButton label="Dia" icon="sun" active={tab === 'day'} onPress={() => setTab('day')} />
              <TabButton label="Mês" icon="calendar" active={tab === 'month'} onPress={() => setTab('month')} />
              <TabButton label="Ano" icon="bar-chart-2" active={tab === 'year'} onPress={() => setTab('year')} />
              <TabButton label="Personalizado" icon="sliders" active={tab === 'period'} onPress={() => setTab('period')} />
            </View>

            <View style={styles.quickFilters}>
              <QuickButton label="Hoje" onPress={() => { setTab('period'); setQuickPeriod(1); }} />
              <QuickButton label="7 dias" onPress={() => { setTab('period'); setQuickPeriod(7); }} />
              <QuickButton label="30 dias" onPress={() => { setTab('period'); setQuickPeriod(30); }} />
              <QuickButton label="Mês atual" onPress={() => { setTab('period'); currentMonthPeriod(); }} />
            </View>

            {tab === 'period' && (
              <View style={styles.customPeriodCard}>
                <View style={styles.dateFields}>
                  <View style={styles.dateField}>
                    <DateField label="Data inicial" value={periodStartInput} onChangeText={(value) => {
                      setPeriodStartInput(value);
                      setPeriodError('');
                      setPeriodNotice('');
                    }} />
                  </View>
                  <View style={styles.dateField}>
                    <DateField label="Data final" value={periodEndInput} onChangeText={(value) => {
                      setPeriodEndInput(value);
                      setPeriodError('');
                      setPeriodNotice('');
                    }} />
                  </View>
                </View>
                {!!periodError && <Text style={styles.periodError}>{periodError}</Text>}
                {!!periodNotice && <Text style={styles.periodNotice}>{periodNotice}</Text>}
              </View>
            )}

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelButton} onPress={() => setPeriodPickerOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={() => {
                if (tab !== 'period' || applyPeriod()) setPeriodPickerOpen(false);
              }}>
                <Text style={styles.applyButtonText}>Aplicar período</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.metricsGrid}>
        <PerformanceMetric
          label="Faturamento"
          value={money(view.summary.total)}
          icon="dollar-sign"
          color="#247A4D"
          background="#EAF6EF"
          current={view.summary.total}
          previous={view.previous.total}
        />

        <PerformanceMetric
          label="Vendas concluídas"
          value={String(view.summary.sales)}
          icon="shopping-bag"
          color="#3568B8"
          background="#EDF3FC"
          current={view.summary.sales}
          previous={view.previous.sales}
        />

        <PerformanceMetric
          label="Ticket médio"
          value={money(view.summary.ticket)}
          icon="trending-up"
          color="#8A6520"
          background="#FBF3DF"
          current={view.summary.ticket}
          previous={view.previous.ticket}
        />

        <PerformanceMetric
          label="Média por faixa ativa"
          value={money(averagePerActiveRange)}
          icon="activity"
          color="#6E56A6"
          background="#F2EEFA"
          helper={`${activeBars.length} ${activeBars.length === 1 ? 'faixa com movimento' : 'faixas com movimento'}`}
        />
      </View>

      <View style={styles.periodHighlights}>
        <HighlightItem
          icon="award"
          label="Melhor desempenho"
          value={bestBar && bestBar.value > 0 ? bestBar.detailLabel : 'Sem movimento'}
          detail={bestBar && bestBar.value > 0 ? money(bestBar.value) : 'Nenhuma venda no período'}
        />
        <HighlightItem
          icon="pie-chart"
          label="Concentração da melhor faixa"
          value={`${bestRangeShare.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          detail="Participação no faturamento total"
        />
        <HighlightItem
          icon="check-circle"
          label="Cobertura do período"
          value={`${activeBars.length} de ${view.bars.length}`}
          detail="Faixas com vendas registradas"
        />
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={styles.chartHeaderMain}>
            <Text style={styles.chartTitle}>
              {view.chartTitle}
            </Text>

            <Text style={styles.chartSubtitle}>
              Evolução do faturamento no período selecionado. Arraste para consultar todas as faixas.
            </Text>
          </View>

          {bestBar && bestBar.value > 0 && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeLabel}>PICO DO PERÍODO</Text>
              <Text style={styles.bestBadgeValue}>
                {compactMoney(bestBar.value)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={styles.legendDefaultDot} />
            <Text style={styles.legendText}>Faturamento</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendHighlightDot} />
            <Text style={styles.legendText}>Maior faixa</Text>
          </View>
        </View>

        {view.bars.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chartScrollContent}
          >
            <View style={styles.chartArea}>
              <View style={[styles.chartGuide, styles.chartGuideTop]} />
              <View style={[styles.chartGuide, styles.chartGuideMiddle]} />
              <View style={[styles.chartGuide, styles.chartGuideBottom]} />

              {view.bars.map((item) => {
                const percentage =
                  item.value > 0
                    ? Math.max(
                        4,
                        Math.round(
                          (item.value / maxBar) * 100
                        )
                      )
                    : 0;

                return (
                  <View
                    key={item.key}
                    style={styles.barColumn}
                  >
                    <Text numberOfLines={1} style={styles.barValue}>
                      {item.value > 0
                        ? compactMoney(item.value).replace(/^R\$\s*/, '')
                        : '—'}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          item.key === bestBar?.key &&
                            styles.barFillHighlight,
                          {
                            height: `${percentage}%`,
                          },
                        ]}
                      />
                    </View>

                    <Text
                      numberOfLines={1}
                      style={styles.barLabel}
                    >
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              Sem movimento
            </Text>

            <Text style={styles.emptyText}>
              Não há vendas registradas neste período.
            </Text>
          </View>
        )}
      </View>

      {rankedBars.length > 0 && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.sectionTitleGroup}>
              <View style={styles.sectionIcon}>
                <Feather name="list" size={15} color="#3568B8" />
              </View>
              <View>
                <Text style={styles.detailTitle}>Ranking do período</Text>
                <Text style={styles.sectionSubtitle}>Faixas com maior faturamento</Text>
              </View>
            </View>

            <Text style={styles.detailHeaderMeta}>
              Top {rankedBars.length}
            </Text>
          </View>

          {rankedBars.map((item, index) => (
              <View key={item.key} style={styles.detailRow}>
                <View
                  style={[
                    styles.rankBadge,
                    index === 0 && styles.rankBadgeFirst,
                  ]}
                >
                  <Text
                    style={[
                      styles.rankBadgeText,
                      index === 0 && styles.rankBadgeTextFirst,
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>

                <View style={styles.detailMain}>
                  <Text style={styles.detailName}>
                    {item.detailLabel}
                  </Text>

                  <Text style={styles.detailMeta}>
                    {item.sales} venda(s) • Ticket{' '}
                    {money(item.ticket)}
                  </Text>

                  <View style={styles.rankingTrack}>
                    <View
                      style={[
                        styles.rankingFill,
                        {
                          width: `${Math.max(
                            5,
                            (item.value / Math.max(1, bestBar?.value || 1)) * 100
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <Text style={styles.detailAmount}>
                  {money(item.value)}
                </Text>
              </View>
            ))}
        </View>
      )}

      {(periodInsights.payments.length > 0 || periodInsights.products.length > 0) && (
        <View style={styles.insightsSection}>
          <View style={styles.contentSectionHeader}>
            <View>
              <Text style={styles.contentSectionEyebrow}>COMPOSIÇÃO DO RESULTADO</Text>
              <Text style={styles.contentSectionTitle}>O que movimentou o período</Text>
            </View>
            <Text style={styles.contentSectionPeriod}>{view.title}</Text>
          </View>

          <View style={styles.insightsGrid}>
          {periodInsights.payments.length > 0 && (
            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <View style={[styles.insightIcon, styles.paymentIcon]}>
                  <Feather name="credit-card" size={16} color="#3568B8" />
                </View>
                <View>
                  <Text style={styles.detailTitle}>Formas de pagamento</Text>
                  <Text style={styles.insightSubtitle}>Participação no faturamento</Text>
                </View>
              </View>

              {periodInsights.payments.map((row) => (
                <View key={row.method} style={styles.paymentRow}>
                  <View style={styles.paymentRowHead}>
                    <Text style={styles.paymentMethod}>{row.method}</Text>
                    <Text style={styles.paymentValue}>
                      {money(row.total)} • {row.percent.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.paymentTrack}>
                    <View
                      style={[
                        styles.paymentFill,
                        { width: `${Math.max(4, row.percent)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {periodInsights.products.length > 0 && (
            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <View style={[styles.insightIcon, styles.productIcon]}>
                  <Feather name="package" size={16} color="#6A70A8" />
                </View>
                <View>
                  <Text style={styles.detailTitle}>Produtos mais vendidos</Text>
                  <Text style={styles.insightSubtitle}>Ranking por receita</Text>
                </View>
              </View>

              {periodInsights.products.map((product, index) => (
                <View key={product.name} style={styles.detailRow}>
                  <View style={styles.productRank}>
                    <Text style={styles.productRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.detailMain}>
                    <Text style={styles.detailName}>
                      {product.name}
                    </Text>
                    <Text style={styles.detailMeta}>
                      {product.qty} vendido(s)
                    </Text>
                  </View>
                  <Text style={styles.detailAmount}>
                    {money(product.revenue)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          </View>
        </View>
      )}
    </AdminShell>
  );
}

function PerformanceMetric({
  label,
  value,
  icon,
  color,
  background,
  current,
  previous,
  helper,
}: {
  label: string;
  value: string;
  icon: FeatherIconName;
  color: string;
  background: string;
  current?: number;
  previous?: number;
  helper?: string;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTopRow}>
        <View style={[styles.metricIcon, { backgroundColor: background }]}>
          <Feather name={icon} size={17} color={color} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>

      <Text style={styles.metricValue}>{value}</Text>

      {current !== undefined && previous !== undefined ? (
        <Comparison current={current} previous={previous} compact />
      ) : (
        <Text style={styles.metricHelper}>{helper}</Text>
      )}
    </View>
  );
}

function HighlightItem({
  icon,
  label,
  value,
  detail,
}: {
  icon: FeatherIconName;
  label: string;
  value: string;
  detail: string;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={styles.highlightItem}>
      <View style={styles.highlightIcon}>
        <Feather name={icon} size={15} color="#3568B8" />
      </View>
      <View style={styles.highlightContent}>
        <Text style={styles.highlightLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.highlightValue}>{value}</Text>
        <Text numberOfLines={1} style={styles.highlightDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: FeatherIconName;
  active: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      style={[
        styles.tabButton,
        active && styles.tabButtonActive,
      ]}
      onPress={onPress}
    >
      <Feather
        name={icon}
        size={15}
        color={active ? '#FFFFFF' : theme.colors.muted}
      />
      <Text
        style={[
          styles.tabText,
          active && styles.tabTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QuickButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      style={styles.quickButton}
      onPress={onPress}
    >
      <Text style={styles.quickButtonText}>{label}</Text>
    </Pressable>
  );
}

function Comparison({
  current,
  previous,
  compact = false,
}: {
  current: number;
  previous: number;
  compact?: boolean;
}) {
  const tone = comparisonTone(current, previous);
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View
      style={[
        styles.comparisonPill,
        compact && styles.comparisonPillCompact,
        tone === 'positive' &&
          styles.comparisonPillPositive,
        tone === 'negative' &&
          styles.comparisonPillNegative,
      ]}
    >
      <Text
        style={[
          styles.comparisonText,
          tone === 'positive' &&
            styles.comparisonTextPositive,
          tone === 'negative' &&
            styles.comparisonTextNegative,
        ]}
      >
        {comparisonText(current, previous)}
      </Text>
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#F1CACA',
    borderRadius: 12,
    padding: 12,
  },

  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },

  analysisPanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },

  analysisPanelHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  analysisEyebrow: {
    color: '#3568B8',
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.5,
  },

  analysisTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    marginTop: 2,
  },

  analysisStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F4F7F4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  analysisStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },

  analysisStatusText: {
    color: theme.colors.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },

  periodToolbar: {
    alignItems: 'center',
    backgroundColor: '#FAFBFC',
    borderColor: '#E4E7EB',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
  },

  periodCaption: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.35,
  },

  periodPickerButton: {
    alignItems: 'center',
    backgroundColor: '#EEF4FC',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
  },

  periodPickerButtonText: {
    color: '#284F7A',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.52)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },

  periodModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    gap: 14,
    maxWidth: 680,
    padding: 18,
    width: '100%',
  },

  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },

  modalTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },

  modalSubtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  modalClose: {
    alignItems: 'center',
    borderRadius: 9,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },

  modalFooter: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'flex-end',
    paddingTop: 14,
  },

  cancelButton: {
    borderColor: theme.colors.border,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  cancelButtonText: {
    color: theme.colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F2F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },

  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 5,
  },

  tabButtonActive: {
    backgroundColor: theme.colors.black,
  },

  tabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: theme.colors.muted,
  },

  tabTextActive: {
    color: '#FFFFFF',
  },

  customPeriodCard: {
    backgroundColor: '#F8F7F4',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },

  customPeriodTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: theme.colors.text,
  },

  quickFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  quickButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#F8F7F4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quickButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: theme.colors.text,
  },

  dateFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  dateField: {
    flex: 1,
    minWidth: 135,
  },

  dateLabel: {
    marginBottom: 5,
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.muted,
  },

  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#FFFFFF',
  },

  periodError: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },

  periodNotice: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '800',
  },

  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.black,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },

  applyButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#E9E7E1',
    borderRadius: 12,
    padding: 8,
  },

  arrowSpacer: {
    width: 38,
    height: 38,
  },

  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EC',
  },

  arrowButtonDisabled: {
    backgroundColor: '#F7F7F7',
  },

  arrowText: {
    fontSize: 26,
    lineHeight: 28,
    color: theme.colors.text,
  },

  arrowTextDisabled: {
    color: '#C8C8C8',
  },

  periodMain: {
    flex: 1,
    minWidth: 190,
  },

  periodTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: theme.colors.text,
    textTransform: 'capitalize',
  },

  periodSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    color: theme.colors.muted,
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  metricCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 190,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 15,
  },

  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metricLabel: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 0.2,
  },

  metricValue: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 30,
    marginTop: 12,
  },

  metricHelper: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 8,
  },

  periodHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 6,
    gap: 2,
  },

  highlightItem: {
    flexGrow: 1,
    flexBasis: 230,
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  highlightIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F6F1E5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  highlightContent: {
    flex: 1,
  },

  highlightLabel: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.2,
  },

  highlightValue: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginTop: 2,
    textTransform: 'capitalize',
  },

  highlightDetail: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  heroLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  heroValue: {
    marginTop: 5,
    color: theme.colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
  },

  comparisonPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F1F0EC',
  },

  comparisonPillCompact: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  comparisonPillPositive: {
    backgroundColor: '#E8F6EE',
  },

  comparisonPillNegative: {
    backgroundColor: '#FBEAEA',
  },

  comparisonText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },

  comparisonTextPositive: {
    color: theme.colors.success,
  },

  comparisonTextNegative: {
    color: theme.colors.danger,
  },

  heroDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 16,
  },

  heroStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    backgroundColor: '#F8F7F4',
    padding: 14,
  },

  heroStat: {
    flex: 1,
  },

  heroStatDivider: {
    width: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.border,
  },

  heroStatLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },

  heroStatValue: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 18,
  },

  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  chartHeaderMain: {
    flex: 1,
  },

  chartTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
  },

  chartSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.muted,
  },

  bestBadge: {
    borderRadius: 12,
    backgroundColor: '#F7F2E6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },

  bestBadgeLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.colors.muted,
    textTransform: 'uppercase',
  },

  bestBadgeValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.text,
  },

  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  legendDefaultDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: '#738496',
  },

  legendHighlightDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    backgroundColor: '#244D70',
  },

  legendText: {
    color: theme.colors.muted,
    fontSize: 12,
  },

  chartScrollContent: {
    paddingTop: 12,
    paddingBottom: 2,
  },

  chartArea: {
    minWidth: '100%',
    height: 230,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 16,
    position: 'relative',
  },

  chartGuide: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#ECEAE5',
  },

  chartGuideTop: {
    top: 38,
  },

  chartGuideMiddle: {
    top: 108,
  },

  chartGuideBottom: {
    top: 178,
  },

  barColumn: {
    width: 50,
    alignItems: 'center',
    zIndex: 1,
  },

  barValue: {
    width: 54,
    height: 16,
    color: theme.colors.muted,
    fontSize: 10.5,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: 4,
  },

  barTrack: {
    width: 30,
    height: 160,
    borderRadius: 6,
    backgroundColor: 'rgba(115, 132, 150, 0.10)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },

  barFill: {
    width: '100%',
    backgroundColor: '#738496',
    borderRadius: 6,
  },

  barFillHighlight: {
    backgroundColor: '#244D70',
  },

  barLabel: {
    width: 50,
    marginTop: 7,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.muted,
    textAlign: 'center',
  },

  emptyBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.text,
  },

  emptyText: {
    marginTop: 5,
    color: theme.colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },

  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 16,
  },

  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF4FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionSubtitle: {
    color: theme.colors.muted,
    fontSize: 11.5,
    marginTop: 2,
  },

  detailTitle: {
    fontSize: 17,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },

  detailHeaderMeta: {
    fontSize: 11.5,
    fontWeight: '800',
    color: theme.colors.muted,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  detailMain: {
    flex: 1,
  },

  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#F1F2F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rankBadgeFirst: {
    backgroundColor: '#F7F0DE',
  },

  rankBadgeText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },

  rankBadgeTextFirst: {
    color: '#8A6520',
  },

  detailName: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'capitalize',
  },

  detailMeta: {
    marginTop: 3,
    fontSize: 11,
    color: theme.colors.muted,
  },

  rankingTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EEEDE9',
    overflow: 'hidden',
    marginTop: 7,
  },

  rankingFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#3568B8',
  },

  detailAmount: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },

  insightsSection: {
    gap: 10,
  },

  contentSectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 2,
  },

  contentSectionEyebrow: {
    color: '#3568B8',
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.45,
  },

  contentSectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },

  contentSectionPeriod: {
    color: theme.colors.muted,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  insightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },

  insightCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    flexBasis: 320,
    flexGrow: 1,
    minWidth: 280,
    overflow: 'hidden',
    paddingBottom: 6,
  },

  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 15,
  },

  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  paymentIcon: {
    backgroundColor: '#EDF3FC',
  },

  productIcon: {
    backgroundColor: '#F0F1FA',
  },

  insightSubtitle: {
    color: theme.colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  productRank: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F6F1E5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  productRankText: {
    color: '#8A6520',
    fontSize: 11.5,
    fontWeight: '900',
  },

  paymentRow: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },

  paymentRowHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  paymentMethod: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  paymentValue: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  paymentTrack: {
    backgroundColor: '#EEEDE8',
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },

  paymentFill: {
    backgroundColor: '#3568B8',
    borderRadius: 4,
    height: '100%',
  },
});
