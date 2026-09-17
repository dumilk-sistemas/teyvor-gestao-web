import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { theme, useThemeColors } from '@/constants/theme';
import { getReports } from '@/services/api';
import { getFull } from '@/services/fullApi';
import type { ReportsData } from '@/types/api';

type Tab = 'day' | 'month' | 'year' | 'period';

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

const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

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
    const start = brToIso(periodStartInput.trim());
    const end = brToIso(periodEndInput.trim());

    if (!start || !end) {
      setPeriodError(
        'Informe as datas no formato DD/MM/AAAA.'
      );
      setPeriodNotice('');
      return;
    }

    if (start > end) {
      setPeriodError(
        'A data inicial não pode ser posterior à data final.'
      );
      setPeriodNotice('');
      return;
    }

    if (end > todayIso) {
      setPeriodError(
        'A data final não pode ser posterior a hoje.'
      );
      setPeriodNotice('');
      return;
    }

    setPeriodStart(start);
    setPeriodEnd(end);
    setPeriodError('');
    setPeriodNotice(
      `Período aplicado: ${isoToBR(start)} a ${isoToBR(end)}`
    );
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

      <View style={styles.tabs}>
        <TabButton
          label="Dia"
          active={tab === 'day'}
          onPress={() => setTab('day')}
        />

        <TabButton
          label="Mês"
          active={tab === 'month'}
          onPress={() => setTab('month')}
        />

        <TabButton
          label="Ano"
          active={tab === 'year'}
          onPress={() => setTab('year')}
        />

        <TabButton
          label="Período"
          active={tab === 'period'}
          onPress={() => setTab('period')}
        />
      </View>

      {tab === 'period' && (
        <View style={styles.customPeriodCard}>
          <Text style={styles.customPeriodTitle}>
            Escolha o período
          </Text>

          <View style={styles.quickFilters}>
            <QuickButton
              label="Hoje"
              onPress={() => setQuickPeriod(1)}
            />

            <QuickButton
              label="7 dias"
              onPress={() => setQuickPeriod(7)}
            />

            <QuickButton
              label="30 dias"
              onPress={() => setQuickPeriod(30)}
            />

            <QuickButton
              label="Mês atual"
              onPress={currentMonthPeriod}
            />
          </View>

          <View style={styles.dateFields}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>Data inicial</Text>

              <TextInput
                value={periodStartInput}
                onChangeText={(value) => {
                  setPeriodStartInput(
                    formatDateInput(value)
                  );
                  setPeriodError('');
                  setPeriodNotice('');
                }}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>

            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>Data final</Text>

              <TextInput
                value={periodEndInput}
                onChangeText={(value) => {
                  setPeriodEndInput(formatDateInput(value));
                  setPeriodError('');
                  setPeriodNotice('');
                }}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>
          </View>

          {!!periodError && (
            <Text style={styles.periodError}>
              {periodError}
            </Text>
          )}

          <Pressable
            style={styles.applyButton}
            onPress={applyPeriod}
          >
            <Text style={styles.applyButtonText}>
              Ver estatísticas
            </Text>
          </Pressable>

          {!!periodNotice && (
            <Text style={styles.periodNotice}>
              {periodNotice}
            </Text>
          )}
        </View>
      )}

      <View style={styles.periodCard}>
        {tab !== 'period' ? (
          <Pressable
            style={styles.arrowButton}
            onPress={previous}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.arrowSpacer} />
        )}

        <View style={styles.periodMain}>
          <Text style={styles.periodTitle}>{view.title}</Text>
          <Text style={styles.periodSubtitle}>
            {view.subtitle}
          </Text>
        </View>

        {tab !== 'period' ? (
          <Pressable
            disabled={!canGoNext}
            style={[
              styles.arrowButton,
              !canGoNext && styles.arrowButtonDisabled,
            ]}
            onPress={next}
          >
            <Text
              style={[
                styles.arrowText,
                !canGoNext && styles.arrowTextDisabled,
              ]}
            >
              ›
            </Text>
          </Pressable>
        ) : (
          <View style={styles.arrowSpacer} />
        )}
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>FATURAMENTO</Text>

        <Text style={styles.heroValue}>
          {money(view.summary.total)}
        </Text>

        <Comparison
          current={view.summary.total}
          previous={view.previous.total}
        />

        <View style={styles.heroDivider} />

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Vendas</Text>
            <Text style={styles.heroStatValue}>
              {String(view.summary.sales)}
            </Text>
          </View>

          <View style={styles.heroStatDivider} />

          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>
              Ticket médio
            </Text>
            <Text style={styles.heroStatValue}>
              {money(view.summary.ticket)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={styles.chartHeaderMain}>
            <Text style={styles.chartTitle}>
              {view.chartTitle}
            </Text>

            <Text style={styles.chartSubtitle}>
              Arraste horizontalmente para consultar todas as faixas.
            </Text>
          </View>

          {bestBar && bestBar.value > 0 && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeLabel}>Maior</Text>
              <Text style={styles.bestBadgeValue}>
                {compactMoney(bestBar.value)}
              </Text>
            </View>
          )}
        </View>

        {view.bars.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chartScrollContent}
          >
            <View style={styles.chartArea}>
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
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
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

      {view.bars.some((item) => item.value > 0) && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>
              Detalhamento
            </Text>

            <Text style={styles.detailHeaderMeta}>
              {view.bars.filter((item) => item.value > 0).length}{' '}
              faixa(s) com vendas
            </Text>
          </View>

          {view.bars
            .filter((item) => item.value > 0)
            .map((item) => (
              <View key={item.key} style={styles.detailRow}>
                <View style={styles.detailMain}>
                  <Text style={styles.detailName}>
                    {item.detailLabel}
                  </Text>

                  <Text style={styles.detailMeta}>
                    {item.sales} venda(s) • Ticket{' '}
                    {money(item.ticket)}
                  </Text>
                </View>

                <Text style={styles.detailAmount}>
                  {money(item.value)}
                </Text>
              </View>
            ))}
        </View>
      )}
    </AdminShell>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
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
}: {
  current: number;
  previous: number;
}) {
  const tone = comparisonTone(current, previous);
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View
      style={[
        styles.comparisonPill,
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

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 5,
    gap: 4,
  },

  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  tabButtonActive: {
    backgroundColor: theme.colors.black,
  },

  tabText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.muted,
  },

  tabTextActive: {
    color: '#FFFFFF',
  },

  customPeriodCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },

  customPeriodTitle: {
    fontSize: 16,
    fontWeight: '900',
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
    fontSize: 12,
    fontWeight: '900',
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
    fontSize: 13,
    fontWeight: '900',
  },

  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 10,
  },

  arrowSpacer: {
    width: 46,
    height: 46,
  },

  arrowButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EC',
  },

  arrowButtonDisabled: {
    backgroundColor: '#F7F7F7',
  },

  arrowText: {
    fontSize: 32,
    lineHeight: 34,
    color: theme.colors.text,
  },

  arrowTextDisabled: {
    color: '#C8C8C8',
  },

  periodMain: {
    flex: 1,
    alignItems: 'center',
  },

  periodTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.text,
    textTransform: 'capitalize',
    textAlign: 'center',
  },

  periodSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.muted,
    textAlign: 'center',
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
    borderRadius: 16,
    padding: 16,
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
    borderRadius: 10,
    backgroundColor: '#F3F0E8',
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'flex-end',
  },

  bestBadgeLabel: {
    fontSize: 9,
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

  chartScrollContent: {
    paddingTop: 18,
    paddingBottom: 2,
  },

  chartArea: {
    minWidth: '100%',
    height: 218,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },

  barColumn: {
    width: 42,
    alignItems: 'center',
  },

  barTrack: {
    width: 27,
    height: 180,
    borderRadius: 7,
    backgroundColor: '#F0EEE9',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },

  barFill: {
    width: '100%',
    backgroundColor: c.gold,
    borderRadius: 7,
  },

  barLabel: {
    width: 42,
    marginTop: 7,
    fontSize: 9,
    fontWeight: '800',
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
    padding: 15,
  },

  detailTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.text,
  },

  detailHeaderMeta: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.muted,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  detailMain: {
    flex: 1,
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

  detailAmount: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },
});
